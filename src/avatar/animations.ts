/**
 * animations.ts —— 程序化肢体动作（Pose 定义）
 * ------------------------------------------------------------------
 * 每个动作是"统一骨位 → 局部欧拉偏移"的映射，外加少量 morph 增强。
 * 偏移叠加在绑定姿态之上（base * offset），通过 AvatarController 的
 * 手势通道权重做插值过渡，可与表情/口型/头部系统同时运行。
 *
 * 说明：本文件中的角度是针对参考模型（RPM humanoid，T-Pose 绑定，
 * 骨骼 +X 沿手臂方向）调校的；更换模型后如动作方向异常，
 * 只需调整这里或 Adapter 的骨骼映射，业务逻辑不变。
 */

import { BonePart } from './AvatarAdapter';

export interface Pose {
  /** 统一骨位 → (x, y, z) 弧度局部偏移 */
  rotations?: Partial<Record<BonePart, [number, number, number]>>;
  /** 附加 morph 增强（adapter 统一语义） */
  morphs?: Record<string, number>;
}

const NO_ROT: Partial<Record<BonePart, [number, number, number]>> = {};

/** Idle：轻微呼吸 + 身体自然摆动 */
export function idlePose(t: number): Pose {
  const breathe = Math.sin(t * 1.7) * 0.014;
  return {
    rotations: {
      spine1: [breathe, 0, 0],
      spine2: [breathe * 0.5, 0, 0],
      shoulderL: [0, 0, breathe * 0.6],
      shoulderR: [0, 0, -breathe * 0.6],
      head: [Math.sin(t * 0.6) * 0.018, Math.sin(t * 0.43) * 0.03, Math.sin(t * 0.31) * 0.012],
    },
  };
}

/** Wave：右手举起挥手 */
export function wavePose(t: number): Pose {
  const s = Math.sin(t * 7.5);
  return {
    rotations: {
      armR: [-0.3, 0.12, -2.4],
      forearmR: [0.1, 0, s * 0.55 - 0.12],
      handR: [0, s * 0.14, 0],
      indexR: [0, 0, 0.3],
      middleR: [0, 0, 0.26],
      ringR: [0, 0, 0.24],
      pinkyR: [0, 0, 0.24],
      head: [0.05, 0.14, 0.02],
    },
    morphs: { mouthSmile: 0.4 },
  };
}

/** Explain：双手摊开讲解，前臂交替摆动 */
export function explainPose(t: number): Pose {
  const s = Math.sin(t * 2.3);
  return {
    rotations: {
      armL: [0.05, 0.1, 1.55],
      forearmL: [0.12, 0, s * 0.32 + 0.45],
      armR: [0.05, -0.1, -1.55],
      forearmR: [0.12, 0, -s * 0.32 - 0.45],
      head: [0.045, 0, 0],
    },
    morphs: { browInnerUp: 0.28, mouthSmile: 0.22 },
  };
}

/** Thinking Pose：右手托腮思考，头微倾 */
export function thinkingPose(_t: number): Pose {
  return {
    rotations: {
      spine2: [-0.035, 0, 0],
      armR: [0.18, 0.2, 1.15],
      forearmR: [-2.15, 0, 0.3],
      handR: [-0.25, 0, 0.1],
      indexR: [0.3, 0, 0.1],
      head: [0.1, -0.18, -0.14],
    },
    morphs: {
      browInnerUp: 0.6,
      browDownLeft: 0.25,
      browDownRight: 0.2,
      mouthPressLeft: 0.3,
      mouthPressRight: 0.3,
    },
  };
}

/** Encouraging：单臂前伸鼓励 + 轻微侧摆 */
export function encouragingPose(t: number): Pose {
  const s = Math.sin(t * 2.6) * 0.07;
  return {
    rotations: {
      spine1: [0, s * 0.5, 0],
      armR: [-0.55, 0.18, -0.55],
      forearmR: [-0.65, 0, 0.12],
      handR: [0, 0.12, 0.08],
      indexR: [0, 0, 0.18],
      middleR: [0, 0, 0.16],
      ringR: [0, 0, 0.16],
      pinkyR: [0, 0, 0.16],
      head: [0.04, s, 0],
    },
    morphs: { mouthSmile: 0.55, browInnerUp: 0.3, browOuterUpLeft: 0.18, browOuterUpRight: 0.18 },
  };
}

export type GesturePoseFn = (t: number) => Pose;

export const GESTURE_POSES: Record<string, GesturePoseFn> = {
  idle: idlePose,
  wave: wavePose,
  explain: explainPose,
  thinkingPose: thinkingPose,
  encouraging: encouragingPose,
};

/**
 * VRM 姿势表 —— 供 AvatarController({ poseSet: 'vrm' }) 使用。
 * VRM 0.x 人物（VRoid 系）为直臂绑定，骨骼局部轴与 RPM/glTF 有差异：
 *   - 上臂/前臂：绕局部 Z 正方向抬臂（armR 实测），左臂为镜像（负方向抬）；
 *   - head rest 为 identity（局部欧拉 ≈ 世界轴），可复用 GLTF 表的头部角度；
 *   - 手指（Index/Middle/Ring/Pinky Proximal）绕局部 X 弯曲。
 * 本地预览调校后，动作方向异常只需改本表，业务逻辑与 AvatarAdapter 无需改动。
 */

/** Explain（VRM）：双臂抬起 40° 摊开讲解，前臂交替外摆 */
export function explainPoseVRM(t: number): Pose {
  const s = Math.sin(t * 2.3);
  return {
    rotations: {
      armL: [0.05, 0.1, -0.7],
      forearmL: [0.05, 0, -0.5 + s * 0.18],
      armR: [0.05, -0.1, 0.7],
      forearmR: [0.05, 0, 0.5 + s * 0.18],
      head: [0.045, 0, 0],
    },
    morphs: { browInnerUp: 0.28, mouthSmile: 0.22 },
  };
}

/** Thinking Pose（VRM）：右手托腮思考，头微倾 */
export function thinkingPoseVRM(): Pose {
  return {
    rotations: {
      spine2: [-0.035, 0, 0],
      armR: [0.05, 0.5, 0.8],
      forearmR: [0.1, 0, 0.5],
      handR: [-0.2, 0, 0.1],
      indexR: [0.35, 0, 0.1],
      head: [0.12, -0.18, -0.14],
    },
    morphs: {
      browInnerUp: 0.6,
      browDownLeft: 0.25,
      browDownRight: 0.2,
      mouthPressLeft: 0.3,
      mouthPressRight: 0.3,
    },
  };
}

/** Encouraging（VRM）：右臂抬起握拳鼓励 + 轻微侧摆 */
export function encouragingPoseVRM(t: number): Pose {
  const s = Math.sin(t * 2.6) * 0.07;
  return {
    rotations: {
      spine1: [0, s * 0.5, 0],
      armR: [0.05, 0.18, 1.1],
      forearmR: [0.1, 0, 0.8],
      handR: [0, 0.12, 0.08],
      indexR: [0.6, 0, 0.08],
      middleR: [0.6, 0, 0.08],
      ringR: [0.6, 0, 0.08],
      pinkyR: [0.6, 0, 0.08],
      head: [0.04, s, 0],
    },
    morphs: { mouthSmile: 0.55, browInnerUp: 0.3, browOuterUpLeft: 0.18, browOuterUpRight: 0.18 },
  };
}

export const GESTURE_POSES_VRM: Record<string, GesturePoseFn> = {
  idle: idlePose,
  wave: wavePose,
  explain: explainPoseVRM,
  thinkingPose: thinkingPoseVRM,
  encouraging: encouragingPoseVRM,
};

/** 空姿态（用于无动作时的兜底） */
export function emptyPose(): Pose {
  return { rotations: NO_ROT };
}
