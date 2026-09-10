/**
 * AvatarAdapter —— 模型适配层
 * ------------------------------------------------------------------
 * 职责：把具体模型的 Bone / MorphTarget 名称映射为统一语义。
 * 上层（AvatarController / VisemeTimeline / animations）只使用统一语义，
 * 替换模型时只需替换/扩展本适配器的名称映射，不重写业务逻辑。
 *
 * 设计原则：
 * 1. 禁止假设模型存在固定 Bone 或 Morph 名称 —— 全部通过名称启发式扫描 + 别名表匹配；
 * 2. MorphTarget 写所有包含该目标的网格（RPM 的头/眼/齿网格共享同一套 morph）；
 * 3. 骨骼记录初始 baseQuaternion，姿态叠加 = base * offset，避免污染绑定姿态。
 */

import * as THREE from 'three';

export type BonePart =
  | 'hips'
  | 'spine'
  | 'spine1'
  | 'spine2'
  | 'neck'
  | 'head'
  | 'eyeL'
  | 'eyeR'
  | 'shoulderL'
  | 'armL'
  | 'forearmL'
  | 'handL'
  | 'shoulderR'
  | 'armR'
  | 'forearmR'
  | 'handR'
  | 'thumbL'
  | 'indexL'
  | 'middleL'
  | 'ringL'
  | 'pinkyL'
  | 'thumbR'
  | 'indexR'
  | 'middleR'
  | 'ringR'
  | 'pinkyR';

export const BONE_PARTS: BonePart[] = [
  'hips', 'spine', 'spine1', 'spine2', 'neck', 'head',
  'eyeL', 'eyeR',
  'shoulderL', 'armL', 'forearmL', 'handL',
  'shoulderR', 'armR', 'forearmR', 'handR',
  'thumbL', 'indexL', 'middleL', 'ringL', 'pinkyL',
  'thumbR', 'indexR', 'middleR', 'ringR', 'pinkyR',
];

/** 每个统一骨位对应的候选骨骼名（大小写/空格/下划线已归一化） */
const BONE_PART_CANDIDATES: Record<BonePart, string[]> = {
  hips: ['hips', 'pelvis', 'hip'],
  spine: ['spine', 'spine0', 'chest0'],
  spine1: ['spine1', 'spine01', 'chest', 'upperchest'],
  spine2: ['spine2', 'spine02', 'chest1'],
  neck: ['neck'],
  head: ['head', 'headend', 'headtop'],
  eyeL: ['lefteye', 'eyel', 'eyeleft'],
  eyeR: ['righteye', 'eyer', 'eyeright'],
  shoulderL: ['leftshoulder'],
  armL: ['leftarm', 'upperarml'],
  forearmL: ['leftforearm', 'lowerarml'],
  handL: ['lefthand', 'handl'],
  shoulderR: ['rightshoulder'],
  armR: ['rightarm', 'upperarmr'],
  forearmR: ['rightforearm', 'lowerarmr'],
  handR: ['righthand', 'handr'],
  thumbL: ['lefthandthumb1', 'thumbl1', 'thumb_l'],
  indexL: ['lefthandindex1', 'indexl1', 'index_l'],
  middleL: ['lefthandmiddle1', 'middlel1', 'middle_l'],
  ringL: ['lefthandring1', 'ringl1', 'ring_l'],
  pinkyL: ['lefthandpinky1', 'pinkyl1', 'pinky_l'],
  thumbR: ['righthandthumb1', 'thumbr1', 'thumb_r'],
  indexR: ['righthandindex1', 'indexr1', 'index_r'],
  middleR: ['righthandmiddle1', 'middler1', 'middle_r'],
  ringR: ['righthandring1', 'ringr1', 'ring_r'],
  pinkyR: ['righthandpinky1', 'pinkyr1', 'pinky_r'],
};

/**
 * 统一 Morph 语义 → 候选 morph 名。
 * key 即上层使用的统一语义；首个命中的模型名生效。
 * RPM/ARKit 命名优先，其次兼容 VRM / Mixamo / 自定义命名。
 */
const MORPH_ALIASES: Record<string, string[]> = {
  // 眼
  eyeBlinkLeft: ['eyeBlinkLeft', 'blinkLeft', 'blink_l', 'eyesClosed'],
  eyeBlinkRight: ['eyeBlinkRight', 'blinkRight', 'blink_r', 'eyesClosed'],
  eyesClosed: ['eyesClosed', 'eyeClosed', 'blink'],
  eyeWideLeft: ['eyeWideLeft', 'eyeWide'],
  eyeWideRight: ['eyeWideRight', 'eyeWide'],
  eyeSquintLeft: ['eyeSquintLeft', 'cheekSquintLeft', 'eyeSquint'],
  eyeSquintRight: ['eyeSquintRight', 'cheekSquintRight', 'eyeSquint'],
  // 眉
  browInnerUp: ['browInnerUp', 'browUp', 'browRaise', 'browUpLeft'],
  browDownLeft: ['browDownLeft', 'browFrownLeft', 'browDown'],
  browDownRight: ['browDownRight', 'browFrownRight', 'browDown'],
  browOuterUpLeft: ['browOuterUpLeft', 'browOuterUp'],
  browOuterUpRight: ['browOuterUpRight', 'browOuterUp'],
  // 嘴
  mouthSmile: ['mouthSmile', 'mouthSmileLeft', 'smile', 'happy'],
  mouthSmileLeft: ['mouthSmileLeft', 'mouthSmile'],
  mouthSmileRight: ['mouthSmileRight', 'mouthSmile'],
  mouthOpen: ['mouthOpen', 'jawOpen'],
  jawOpen: ['jawOpen', 'mouthOpen'],
  mouthClose: ['mouthClose'],
  mouthFrownLeft: ['mouthFrownLeft', 'mouthFrown'],
  mouthFrownRight: ['mouthFrownRight', 'mouthFrown'],
  mouthPucker: ['mouthPucker'],
  mouthFunnel: ['mouthFunnel'],
  mouthPressLeft: ['mouthPressLeft', 'mouthPress'],
  mouthPressRight: ['mouthPressRight', 'mouthPress'],
  mouthShrugUpper: ['mouthShrugUpper'],
  mouthShrugLower: ['mouthShrugLower'],
  cheekPuff: ['cheekPuff'],
  tongueOut: ['tongueOut'],
  // 视线 morph（骨骼缺失时的回退）
  eyeLookUp: ['eyeLookUp', 'eyesLookUp', 'eyeLookUpLeft', 'lookUp'],
  eyeLookDown: ['eyeLookDown', 'eyesLookDown', 'eyeLookDownLeft', 'lookDown'],
  eyeLookLeft: ['eyeLookLeft', 'eyesLookLeft', 'eyeLookInLeft', 'lookLeft'],
  eyeLookRight: ['eyeLookRight', 'eyesLookRight', 'eyeLookOutLeft', 'lookRight'],
  // Oculus viseme（模型名带 viseme_ 前缀）
  viseme_sil: ['viseme_sil'],
  viseme_PP: ['viseme_PP'],
  viseme_FF: ['viseme_FF'],
  viseme_TH: ['viseme_TH'],
  viseme_DD: ['viseme_DD'],
  viseme_kk: ['viseme_kk'],
  viseme_CH: ['viseme_CH'],
  viseme_SS: ['viseme_SS'],
  viseme_nn: ['viseme_nn'],
  viseme_RR: ['viseme_RR'],
  viseme_aa: ['viseme_aa'],
  viseme_E: ['viseme_E'],
  viseme_I: ['viseme_I'],
  viseme_O: ['viseme_O'],
  viseme_U: ['viseme_U'],
  // 回退口型 A/I/U/E/O（VRM 等只有单字母/音标名的模型）
  A: ['viseme_aa', 'A', 'aa', 'ah'],
  I: ['viseme_I', 'I', 'ih', 'ee'],
  U: ['viseme_U', 'U', 'ou', 'oo'],
  E: ['viseme_E', 'E', 'ee', 'eh'],
  O: ['viseme_O', 'O', 'oh'],
  sil: ['viseme_sil', 'sil'],
};

export interface BoneRef {
  bone: THREE.Bone;
  baseQuaternion: THREE.Quaternion;
}

export interface MorphRef {
  meshes: THREE.Mesh[];
  indices: number[];
}

export interface AvatarCapabilities {
  meshNames: string[];
  boneParts: BonePart[];
  morphNames: string[];
  animationNames: string[];
  skeleton: THREE.Skeleton | null;
  hasOculusVisemes: boolean;
  hasFallbackVisemes: boolean;
}

const normName = (name: string) => name.replace(/[\s_\-.]/g, '').toLowerCase();

export class AvatarAdapter {
  private bones = new Map<BonePart, BoneRef>();
  private morphs = new Map<string, MorphRef>();
  private meshes: THREE.Mesh[] = [];
  private skeleton: THREE.Skeleton | null = null;
  private animationClips: THREE.AnimationClip[] = [];

  private readonly tmpQ = new THREE.Quaternion();

  constructor(root: THREE.Object3D, animationClips: THREE.AnimationClip[] = []) {
    this.animationClips = animationClips;

    // 1) 收集带 MorphTarget 的网格，并按统一语义建索引
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const dict = obj.morphTargetDictionary as Record<string, number> | undefined;
        const extras = (obj.userData?.gltfExtras ?? {}) as { targetNames?: string[] };
        if (dict && Object.keys(dict).length > 0) {
          this.meshes.push(obj);
        } else if (extras.targetNames && obj.morphTargetInfluences) {
          // GLTFLoader 未建字典时的兜底：用 extras.targetNames 手动建立
          obj.morphTargetDictionary = {};
          extras.targetNames.forEach((name, i) => {
            if (obj.morphTargetDictionary) obj.morphTargetDictionary[name] = i;
          });
          this.meshes.push(obj);
        }
      }
      if (obj instanceof THREE.SkinnedMesh && obj.skeleton) {
        this.skeleton = obj.skeleton;
      }
    });
    this.indexMorphs();

    // 2) 骨骼：遍历骨架关节（含未蒙皮节点里的 Bone）
    const bones: THREE.Bone[] = [];
    root.traverse((obj) => {
      if (obj instanceof THREE.Bone) bones.push(obj);
    });
    if (this.skeleton) {
      for (const b of this.skeleton.bones) if (!bones.includes(b)) bones.push(b);
    }
    for (const part of BONE_PARTS) {
      const candidates = BONE_PART_CANDIDATES[part];
      const hit = bones.find((b) => candidates.some((c) => normName(b.name) === c));
      if (hit) {
        hit.updateWorldMatrix(true, false);
        this.bones.set(part, { bone: hit, baseQuaternion: hit.quaternion.clone() });
      }
    }
  }

  private indexMorphs() {
    for (const mesh of this.meshes) {
      const dict = mesh.morphTargetDictionary as Record<string, number>;
      for (const name of Object.keys(dict)) {
        // 先按模型名建索引（供 hasOculusVisemes 等判断）
        const idx = dict[name];
        const ref = this.morphs.get(name);
        if (ref) {
          ref.meshes.push(mesh);
          ref.indices.push(idx);
        } else {
          this.morphs.set(name, { meshes: [mesh], indices: [idx] });
        }
      }
    }
  }

  // ---------------------------------------------------------------- Morph

  /** 按统一语义（可含别名）解析实际 morph 名；找不到返回 null */
  resolveMorph(semantic: string): string | null {
    const candidates = MORPH_ALIASES[semantic] ?? [semantic];
    for (const c of candidates) {
      if (this.morphs.has(c)) return c;
    }
    return null;
  }

  hasMorph(semantic: string): boolean {
    return this.resolveMorph(semantic) !== null;
  }

  /** 写入 morph 权重（0..1），自动钳制；写到所有包含该目标的网格 */
  setMorph(semantic: string, weight: number): void {
    const actual = this.resolveMorph(semantic);
    if (!actual) return;
    const ref = this.morphs.get(actual)!;
    const w = Math.min(1, Math.max(0, weight));
    for (let i = 0; i < ref.meshes.length; i++) {
      const influences = ref.meshes[i].morphTargetInfluences;
      if (influences) influences[ref.indices[i]] = w;
    }
  }

  /** 当前实际 morph 名列表（模型原始名） */
  get morphNames(): string[] {
    return [...this.morphs.keys()];
  }

  /** 读取当前 morph 权重（读第一个包含该目标的网格；找不到返回 0） */
  getMorphWeight(semantic: string): number {
    const actual = this.resolveMorph(semantic);
    if (!actual) return 0;
    const ref = this.morphs.get(actual)!;
    const influences = ref.meshes[0].morphTargetInfluences;
    return influences ? influences[ref.indices[0]] : 0;
  }

  /** 是否有完整 Oculus viseme 集 */
  get hasOculusVisemes(): boolean {
    return ['viseme_aa', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U'].every((v) => this.morphs.has(v));
  }

  /** 是否有 A/I/U/E/O 回退口型 */
  get hasFallbackVisemes(): boolean {
    return ['A', 'I', 'U', 'E', 'O'].some((v) => this.morphs.has(v));
  }

  // ---------------------------------------------------------------- Bone

  getBone(part: BonePart): BoneRef | undefined {
    return this.bones.get(part);
  }

  hasBone(part: BonePart): boolean {
    return this.bones.has(part);
  }

  /**
   * 在骨骼局部坐标系叠加一个姿态偏移：final = base * offset。
   * euler 为 (x, y, z) 弧度；传 null 恢复绑定姿态。
   */
  applyBoneOffset(part: BonePart, euler: [number, number, number] | null): void {
    const ref = this.bones.get(part);
    if (!ref) return;
    if (euler === null) {
      ref.bone.quaternion.copy(ref.baseQuaternion);
      return;
    }
    const q = this.tmpQ.setFromEuler(new THREE.Euler(euler[0], euler[1], euler[2]));
    ref.bone.quaternion.copy(ref.baseQuaternion).multiply(q);
  }

  /** 全部骨骼恢复绑定姿态 */
  resetBones(): void {
    for (const ref of this.bones.values()) {
      ref.bone.quaternion.copy(ref.baseQuaternion);
    }
  }

  /** 已识别的统一骨位 */
  get foundBoneParts(): BonePart[] {
    return [...this.bones.keys()];
  }

  // ---------------------------------------------------------------- 汇总

  get skeletonObject(): THREE.Skeleton | null {
    return this.skeleton;
  }

  get clips(): THREE.AnimationClip[] {
    return this.animationClips;
  }

  getCapabilities(): AvatarCapabilities {
    return {
      meshNames: this.meshes.map((m) => m.name),
      boneParts: this.foundBoneParts,
      morphNames: this.morphNames,
      animationNames: this.animationClips.map((c) => c.name),
      skeleton: this.skeleton,
      hasOculusVisemes: this.hasOculusVisemes,
      hasFallbackVisemes: this.hasFallbackVisemes,
    };
  }
}
