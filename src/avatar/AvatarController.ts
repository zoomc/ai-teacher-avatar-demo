/**
 * AvatarController —— 统一控制调度器
 * ------------------------------------------------------------------
 * 调用形式：
 *   avatar.execute({ emotion: 'encouraging', gesture: 'explain', lookAt: 'user', intensity: 0.7 });
 *
 * 职责：
 * - 表情通道：5 种情绪权重平滑过渡（指数阻尼，杜绝瞬间切换 Morph 权重）；
 * - 口型通道：驱动 VisemeTimeline，按时间轴平滑驱动 viseme morph；
 * - 头部系统：随机眨眼、Look Left/Right/User、点头、轻微抬头/低头（骨骼驱动 + 角度钳制）；
 * - 肢体通道：手势姿态（Idle/Wave/Explain/Thinking/Encouraging）经骨骼插值叠加，
 *   与表情/口型同时工作；
 * - Run Demo 脚本序列。
 *
 * 本类只使用统一语义（Emotion / Gesture / LookTarget / 语义 morph 名），
 * 不出现任何具体模型名称 —— 模型差异全部隔离在 AvatarAdapter。
 */

import * as THREE from 'three';
import { AvatarAdapter, BonePart } from './AvatarAdapter';
import { VisemeTimeline } from './VisemeTimeline';
import { GESTURE_POSES, GESTURE_POSES_VRM, Pose, emptyPose, GesturePoseFn } from './animations';
import { createTalkDemo } from './talkDemo';
import { AvatarCommand, Emotion, Gesture, LookTarget, VisemeEvent } from './types';

const EMOTIONS: Emotion[] = ['neutral', 'happy', 'thinking', 'encouraging', 'surprised'];
const GESTURES: Gesture[] = ['idle', 'wave', 'explain', 'thinkingPose', 'encouraging'];

/** 情绪 → 语义 morph（权重为 0..1 基准，最终乘 intensity） */
const EMOTION_MORPHS: Record<Emotion, Record<string, number>> = {
  neutral: {},
  happy: {
    mouthSmile: 0.85,
    mouthSmileLeft: 0.4,
    mouthSmileRight: 0.4,
    eyeSquintLeft: 0.28,
    eyeSquintRight: 0.28,
    browInnerUp: 0.12,
    cheekPuff: 0.08,
  },
  thinking: {
    browInnerUp: 0.6,
    browDownLeft: 0.25,
    browDownRight: 0.2,
    mouthPressLeft: 0.3,
    mouthPressRight: 0.3,
  },
  encouraging: {
    mouthSmile: 0.7,
    mouthSmileLeft: 0.3,
    mouthSmileRight: 0.3,
    browInnerUp: 0.35,
    browOuterUpLeft: 0.25,
    browOuterUpRight: 0.25,
  },
  surprised: {
    browInnerUp: 0.9,
    browOuterUpLeft: 0.7,
    browOuterUpRight: 0.7,
    jawOpen: 0.5,
    eyeWideLeft: 0.6,
    eyeWideRight: 0.6,
  },
};

/** 情绪 → 附加头部姿态 */
const EMOTION_POSE: Partial<Record<Emotion, Pose>> = {
  thinking: { rotations: { head: [0.08, -0.12, -0.06] } },
  surprised: { rotations: { head: [-0.05, 0, 0] } },
  encouraging: { rotations: { head: [0.03, 0, 0] } },
};

/** 视线角度钳制（弧度） */
const EYE_YAW_LIMIT = 0.32;
const EYE_PITCH_LIMIT = 0.24;
const HEAD_YAW_LIMIT = 0.5;
const HEAD_PITCH_LIMIT = 0.34;

interface ScriptStep {
  at: number;
  run: () => void;
}

const DAMP_RATE = 7.5; // 情绪/手势平滑速率（每秒）
const LOOK_RATE = 9;
const LOOK_WEIGHT_RATE = 8;

export interface AvatarControllerOptions {
  /** 姿势表：gltf（RPM 风格，T-Pose）或 vrm（VRM 0.x，A/T-Pose 直臂绑定） */
  poseSet?: 'gltf' | 'vrm';
}

export class AvatarController {
  readonly adapter: AvatarAdapter;

  private poseTable: Record<string, GesturePoseFn>;

  private emotionWeights: Record<Emotion, number> = {
    neutral: 1,
    happy: 0,
    thinking: 0,
    encouraging: 0,
    surprised: 0,
  };
  private emotionTargets: Record<Emotion, number> = {
    neutral: 1,
    happy: 0,
    thinking: 0,
    encouraging: 0,
    surprised: 0,
  };

  private gestureWeights: Record<Gesture, number> = {
    idle: 1,
    wave: 0,
    explain: 0,
    thinkingPose: 0,
    encouraging: 0,
  };
  private gestureTargets: Record<Gesture, number> = {
    idle: 1,
    wave: 0,
    explain: 0,
    thinkingPose: 0,
    encouraging: 0,
  };

  private intensity = 0.8;
  private time = 0;

  // 口型
  private timeline = new VisemeTimeline();

  // 眨眼
  private blink = { phase: 'idle' as 'idle' | 'down' | 'up', t: 0, next: 2.2, weight: 0 };

  // 视线
  private lookRequest: LookTarget | THREE.Vector3 = null;
  private lookWeight = 0;
  private headYaw = 0;
  private headPitch = 0;
  private eyeYaw = 0;
  private eyePitch = 0;

  // 点头
  private nodState = { active: false, t: 0, dur: 0.85, offset: 0 };

  // 脚本
  private script: ScriptStep[] = [];
  private scriptIndex = 0;
  private scriptT = 0;
  private scriptRunning = false;

  private camera: THREE.Camera | null = null;

  onLog: ((msg: string) => void) | null = null;

  // 临时对象（避免每帧分配）
  private tmpV1 = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private tmpV3 = new THREE.Vector3();
  private tmpV4 = new THREE.Vector3();
  private tmpV5 = new THREE.Vector3();
  private tmpV6 = new THREE.Vector3();
  private tmpQ1 = new THREE.Quaternion();

  constructor(adapter: AvatarAdapter, options: AvatarControllerOptions = {}) {
    this.adapter = adapter;
    this.poseTable = options.poseSet === 'vrm' ? GESTURE_POSES_VRM : GESTURE_POSES;
  }

  // ------------------------------------------------------------ 公共 API

  /** 统一入口 */
  execute(cmd: AvatarCommand): void {
    if (cmd.emotion) this.setEmotion(cmd.emotion);
    if (cmd.gesture) this.setGesture(cmd.gesture);
    if (cmd.lookAt !== undefined) this.setLook(cmd.lookAt);
    if (cmd.intensity !== undefined) {
      this.intensity = Math.min(1, Math.max(0.1, cmd.intensity));
    }
  }

  setEmotion(emotion: Emotion): void {
    for (const e of EMOTIONS) this.emotionTargets[e] = e === emotion ? 1 : 0;
    this.log(`表情 → ${emotion}`);
  }

  setGesture(gesture: Gesture): void {
    for (const g of GESTURES) this.gestureTargets[g] = g === gesture ? 1 : 0;
    this.log(`手势 → ${gesture}`);
  }

  setLook(target: LookTarget | THREE.Vector3): void {
    this.lookRequest = target;
    this.log(`视线 → ${typeof target === 'string' ? target : '自定义点'}`);
  }

  blinkNow(): void {
    this.blink.phase = 'down';
    this.blink.t = 0;
    this.log('眨眼');
  }

  nod(): void {
    this.nodState = { active: true, t: 0, dur: 0.85, offset: 0 };
    this.log('点头');
  }

  playTalk(events?: VisemeEvent[]): void {
    this.timeline.play(events ?? createTalkDemo());
    this.log(`口型播放（${this.timeline.duration.toFixed(1)}s）`);
  }

  stopTalk(): void {
    this.timeline.stop();
  }

  setCamera(camera: THREE.Camera | null): void {
    this.camera = camera;
  }

  stopAll(): void {
    this.setEmotion('neutral');
    this.setGesture('idle');
    this.setLook(null);
    this.stopTalk();
    this.scriptRunning = false;
  }

  /** Run Demo：Idle → Blink → LookAt User → Happy → Talk → Nod → Explain → Encouraging → Neutral */
  runDemo(): void {
    const at = (t: number, run: () => void): ScriptStep => ({ at: t, run });
    this.script = [
      at(0, () => {
        this.setGesture('idle');
        this.setEmotion('neutral');
        this.setLook(null);
        this.log('▶ Run Demo 开始：Idle');
      }),
      at(1.2, () => this.blinkNow()),
      at(2.0, () => this.setLook('user')),
      at(3.0, () => this.setEmotion('happy')),
      at(4.2, () => this.playTalk()),
      at(11.2, () => this.nod()),
      at(12.6, () => {
        this.setGesture('explain');
        this.setEmotion('neutral');
      }),
      at(15.4, () => {
        this.setGesture('encouraging');
        this.setEmotion('encouraging');
      }),
      at(18.0, () => {
        this.setGesture('idle');
        this.setEmotion('neutral');
        this.setLook(null);
        this.log('▶ Run Demo 完成，回到 Neutral');
      }),
    ];
    this.scriptIndex = 0;
    this.scriptT = 0;
    this.scriptRunning = true;
  }

  get isTalking(): boolean {
    return this.timeline.isPlaying;
  }

  get currentEmotion(): Emotion {
    let best: Emotion = 'neutral';
    let bestW = -1;
    for (const e of EMOTIONS) {
      if (this.emotionWeights[e] > bestW) {
        bestW = this.emotionWeights[e];
        best = e;
      }
    }
    return best;
  }

  get currentGesture(): Gesture {
    let best: Gesture = 'idle';
    let bestW = -1;
    for (const g of GESTURES) {
      if (this.gestureWeights[g] > bestW) {
        bestW = this.gestureWeights[g];
        best = g;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ 每帧更新

  update(dt: number): void {
    const d = Math.min(0.05, Math.max(0, dt));
    this.time += d;

    this.updateScript(d);
    this.updateBlink(d);
    this.updateLook(d);
    this.updateNod(d);
    this.timeline.update(d);

    // 情绪 / 手势权重平滑
    for (const e of EMOTIONS) {
      this.emotionWeights[e] = this.damp(this.emotionWeights[e], this.emotionTargets[e], DAMP_RATE, d);
    }
    for (const g of GESTURES) {
      this.gestureWeights[g] = this.damp(this.gestureWeights[g], this.gestureTargets[g], DAMP_RATE, d);
    }

    this.applyPoseAndMorphs();
  }

  private updateScript(d: number): void {
    if (!this.scriptRunning) return;
    this.scriptT += d;
    while (this.scriptIndex < this.script.length && this.scriptT >= this.script[this.scriptIndex].at) {
      const step = this.script[this.scriptIndex];
      this.scriptIndex++;
      step.run();
      if (this.scriptIndex >= this.script.length) {
        this.scriptRunning = false;
        break;
      }
    }
  }

  private updateBlink(d: number): void {
    const b = this.blink;
    if (b.phase === 'idle') {
      b.next -= d;
      if (b.next <= 0) {
        b.phase = 'down';
        b.t = 0;
      }
    } else if (b.phase === 'down') {
      b.t += d;
      b.weight = Math.min(1, b.t / 0.055);
      if (b.t >= 0.055) {
        b.phase = 'up';
        b.t = 0;
      }
    } else {
      b.t += d;
      b.weight = Math.max(0, 1 - b.t / 0.085);
      if (b.t >= 0.085) {
        b.phase = 'idle';
        b.next = 2 + Math.random() * 4.5;
      }
    }
    this.adapter.setMorph('eyeBlinkLeft', b.weight);
    this.adapter.setMorph('eyeBlinkRight', b.weight);
  }

  private updateNod(d: number): void {
    const n = this.nodState;
    if (!n.active) {
      n.offset = this.damp(n.offset, 0, 6, d);
      return;
    }
    n.t += d;
    if (n.t >= n.dur) {
      n.active = false;
      n.offset = 0;
    } else {
      const p = n.t / n.dur;
      n.offset = Math.sin(Math.PI * p) * 0.22;
    }
  }

  // ------------------------------------------------------------ 视线系统

  private updateLook(d: number): void {
    const targetWeight = this.lookRequest === null ? 0 : 1;
    this.lookWeight = this.damp(this.lookWeight, targetWeight, LOOK_WEIGHT_RATE, d);

    const headRef = this.adapter.getBone('head');
    if (!headRef || !this.camera || this.lookRequest === null) {
      // 没有请求或缺少骨骼时，视线平滑归零
      this.headYaw = this.damp(this.headYaw, 0, LOOK_RATE, d);
      this.headPitch = this.damp(this.headPitch, 0, LOOK_RATE, d);
      this.eyeYaw = this.damp(this.eyeYaw, 0, LOOK_RATE, d);
      this.eyePitch = this.damp(this.eyePitch, 0, LOOK_RATE, d);
      return;
    }

    // 计算目标世界点
    const target = this.resolveLookTarget();
    if (!target) {
      this.headYaw = this.damp(this.headYaw, 0, LOOK_RATE, d);
      this.headPitch = this.damp(this.headPitch, 0, LOOK_RATE, d);
      this.eyeYaw = this.damp(this.eyeYaw, 0, LOOK_RATE, d);
      this.eyePitch = this.damp(this.eyePitch, 0, LOOK_RATE, d);
      return;
    }

    // 头 + 眼：分别计算目标方向（含角度钳制）
    const headAngles = this.computeLookAngles('head', target) ?? { yaw: 0, pitch: 0 };
    const eyeRaw = this.computeLookAngles('eyeL', target) ?? headAngles;
    const clampY = (v: number, lim: number) => Math.min(lim, Math.max(-lim, v));
    const cHead = {
      yaw: clampY(headAngles.yaw, HEAD_YAW_LIMIT),
      pitch: clampY(headAngles.pitch, HEAD_PITCH_LIMIT),
    };
    const cEye = {
      yaw: clampY(eyeRaw.yaw, EYE_YAW_LIMIT),
      pitch: clampY(eyeRaw.pitch, EYE_PITCH_LIMIT),
    };

    this.headYaw = this.damp(this.headYaw, cHead.yaw, LOOK_RATE, d);
    this.headPitch = this.damp(this.headPitch, cHead.pitch, LOOK_RATE, d);
    this.eyeYaw = this.damp(this.eyeYaw, cEye.yaw, LOOK_RATE, d);
    this.eyePitch = this.damp(this.eyePitch, cEye.pitch, LOOK_RATE, d);
  }

  private resolveLookTarget(): THREE.Vector3 | null {
    const cam = this.camera;
    if (!cam) return null;
    const req = this.lookRequest;
    if (req instanceof THREE.Vector3) return req;
    if (req === 'user') return cam.position;

    const head = this.adapter.getBone('head')?.bone;
    if (!head) return null;
    const origin = head.getWorldPosition(this.tmpV1);
    const right = this.tmpV2.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
    const up = this.tmpV3.setFromMatrixColumn(cam.matrixWorld, 1).normalize();

    if (req === 'left') return origin.clone().addScaledVector(right, -0.85);
    if (req === 'right') return origin.clone().addScaledVector(right, 0.85);
    if (req === 'up') return origin.clone().addScaledVector(up, 0.55);
    if (req === 'down') return origin.clone().addScaledVector(up, -0.55);
    return null;
  }

  private computeLookAngles(part: BonePart, target: THREE.Vector3): { yaw: number; pitch: number } | null {
    const ref = this.adapter.getBone(part);
    if (!ref) return null;
    const bone = ref.bone;
    const parent = bone.parent;
    if (!parent) return null;
    const origin = bone.getWorldPosition(this.tmpV1);

    // 父级世界旋转（把世界方向转回父空间）
    const parentQ = this.tmpQ1.setFromRotationMatrix(parent.matrixWorld).invert();
    const dirWorld = this.tmpV2.copy(target).sub(origin).normalize();
    const dirLocal = this.tmpV3.copy(dirWorld).applyQuaternion(parentQ);

    // 用绑定姿态的三个基向量计算 yaw/pitch（与模型朝向无关）。
    // VRM normalized bones 的 rest quaternion 与 RPM 不同，局部轴基向量法会串位，
    // 改按 rest 世界旋转的基向量（默认 -Z 为前方，three.js 渲染惯例）在世界空间解算。
    if (this.adapter.isVrm) {
      const rq = ref.restWorldQuaternion;
      const fwd = this.tmpV4.set(0, 0, -1).applyQuaternion(rq);
      const right = this.tmpV5.set(1, 0, 0).applyQuaternion(rq);
      const up = this.tmpV6.set(0, 1, 0).applyQuaternion(rq);
      const yaw = Math.atan2(dirWorld.dot(right), dirWorld.dot(fwd));
      const pitch = Math.asin(Math.min(1, Math.max(-1, dirWorld.dot(up))));
      return { yaw, pitch };
    }
    const q = ref.baseQuaternion;
    const fwd = this.tmpV4.set(0, 0, 1).applyQuaternion(q);
    const right = this.tmpV5.set(1, 0, 0).applyQuaternion(q);
    const up = this.tmpV6.set(0, 1, 0).applyQuaternion(q);

    const yaw = Math.atan2(dirLocal.dot(right), dirLocal.dot(fwd));
    const pitch = Math.asin(Math.min(1, Math.max(-1, dirLocal.dot(up))));
    return { yaw, pitch };
  }

  // ------------------------------------------------------------ 姿态与 Morph 合成

  private applyPoseAndMorphs(): void {
    const adapter = this.adapter;

    // 1) 手势姿态：按权重叠加（含 Idle 呼吸兜底）
    const accum = new Map<BonePart, [number, number, number]>();
    let otherSum = 0;
    for (const g of GESTURES) {
      if (g === 'idle') continue;
      const w = this.gestureWeights[g];
      if (w <= 0.004) continue;
      otherSum += w;
      this.accumPose(accum, this.poseTable[g](this.time), w);
    }
    const idleWeight = Math.min(1, Math.max(0, 1 - otherSum));
    if (idleWeight > 0.004) {
      this.accumPose(accum, this.poseTable.idle(this.time), idleWeight);
    }

    // 2) 情绪附加姿态
    for (const e of EMOTIONS) {
      const w = this.emotionWeights[e];
      if (w <= 0.004) continue;
      const pose = EMOTION_POSE[e];
      if (pose) this.accumPose(accum, pose, w);
    }

    // 3) 视线：头/眼
    const headPose: [number, number, number] = [0, 0, 0];
    const headRef = adapter.getBone('head');
    if (headRef) {
      headPose[0] += -this.headPitch * this.lookWeight;
      headPose[1] += this.headYaw * this.lookWeight;
    }
    headPose[0] += this.nodState.offset;

    // 4) 写入骨骼
    for (const [part, euler] of accum) {
      adapter.applyBoneOffset(part, euler);
    }
    if (headRef) adapter.applyBoneOffset('head', headPose);
    if (adapter.getBone('eyeL') || adapter.getBone('eyeR')) {
      const eyePose: [number, number, number] = [-this.eyePitch * this.lookWeight, this.eyeYaw * this.lookWeight, 0];
      adapter.applyBoneOffset('eyeL', eyePose);
      adapter.applyBoneOffset('eyeR', eyePose);
    }

    // 5) Morph：情绪 + 手势增强
    const morphAccum = new Map<string, number>();
    const addMorph = (name: string, w: number) => {
      morphAccum.set(name, Math.min(1, (morphAccum.get(name) ?? 0) + w));
    };
    for (const e of EMOTIONS) {
      const w = this.emotionWeights[e];
      if (w <= 0.004) continue;
      for (const [m, v] of Object.entries(EMOTION_MORPHS[e])) {
        addMorph(m, v * w * this.intensity);
      }
    }
    for (const g of GESTURES) {
      const w = this.gestureWeights[g];
      if (w <= 0.004) continue;
      const pose = this.poseTable[g](this.time);
      if (pose.morphs) {
        for (const [m, v] of Object.entries(pose.morphs)) {
          addMorph(m, v * w * this.intensity);
        }
      }
    }

    // 6) Morph：口型（时间轴 → adapter 语义）
    const visemeMorphs = VisemeTimeline.resolveVisemeWeights(this.timeline.update(0), adapter);
    for (const [m, v] of visemeMorphs) {
      addMorph(m, v);
    }

    for (const [m, w] of morphAccum) {
      adapter.setMorph(m, w);
    }
  }

  private accumPose(accum: Map<BonePart, [number, number, number]>, pose: Pose, weight: number): void {
    const rots = pose.rotations;
    if (!rots) return;
    for (const [part, euler] of Object.entries(rots)) {
      const p = part as BonePart;
      const cur = accum.get(p) ?? [0, 0, 0];
      cur[0] += euler[0] * weight;
      cur[1] += euler[1] * weight;
      cur[2] += euler[2] * weight;
      accum.set(p, cur);
    }
  }

  private damp(cur: number, target: number, rate: number, dt: number): number {
    return cur + (target - cur) * (1 - Math.exp(-rate * dt));
  }

  private log(msg: string): void {
    if (this.onLog) this.onLog(msg);
  }

  /** UI 调试信息 */
  debugString(): string {
    const visemes = [...this.timeline.update(0).entries()]
      .filter(([, w]) => w > 0.02)
      .map(([v, w]) => `${v}:${w.toFixed(2)}`)
      .join(' ');
    return [
      `表情: ${this.currentEmotion}(${EMOTIONS.map((e) => this.emotionWeights[e].toFixed(2)).join('/')})`,
      `手势: ${this.currentGesture}`,
      `口型: ${visemes || '—'}`,
      `眨眼: ${this.blink.weight.toFixed(2)}`,
      `强度: ${this.intensity.toFixed(2)}`,
    ].join('  |  ');
  }
}

export { emptyPose };
