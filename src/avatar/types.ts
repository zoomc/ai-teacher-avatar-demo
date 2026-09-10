/**
 * 统一语义类型定义
 * ------------------------------------------------------------------
 * AvatarController 只面向这些"统一语义"编程，具体模型如何映射由 AvatarAdapter 负责。
 */

export type Emotion = 'neutral' | 'happy' | 'thinking' | 'encouraging' | 'surprised';

export type Gesture = 'idle' | 'wave' | 'explain' | 'thinkingPose' | 'encouraging';

/** 视线目标：'user' = 看向相机；'left/right/up/down' 为相对屏幕的方位 */
export type LookTarget = 'user' | 'center' | 'left' | 'right' | 'up' | 'down' | null;

export interface AvatarCommand {
  emotion?: Emotion;
  gesture?: Gesture;
  lookAt?: LookTarget;
  /** 0..1 全局强度系数，缩放表情/动作幅度 */
  intensity?: number;
}

/**
 * Viseme 时间轴事件。
 * 后续接入 TTS 时，把 TTS 返回的 phoneme / viseme timestamp 转成该结构即可，
 * 无需改动 VisemeTimeline / AvatarController。
 */
export interface VisemeEvent {
  /** 起始时间（秒） */
  time: number;
  /**
   * Oculus OVR viseme 名（'sil' | 'PP' | 'FF' | 'TH' | 'DD' | 'kk' | 'CH' | 'SS' |
   * 'nn' | 'RR' | 'aa' | 'E' | 'I' | 'O' | 'U'），
   * 或回退口型（'A' | 'I' | 'U' | 'E' | 'O' | 'sil'）。
   */
  viseme: string;
  /** 0..1 目标权重，缺省 1 */
  weight?: number;
  /** 持续时间（秒），缺省 0.25 */
  duration?: number;
}

/** Oculus OVR LipSync 全部 viseme 名（不含 sil 前缀写法） */
export const OCULUS_VISEMES = [
  'sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR', 'aa', 'E', 'I', 'O', 'U',
] as const;

/** 模型只有 A/I/U/E/O 时的回退口型 */
export const FALLBACK_VISEMES = ['A', 'I', 'U', 'E', 'O', 'sil'] as const;

export interface CapabilitySummary {
  meshNames: string[];
  boneParts: string[];
  morphNames: string[];
  animationNames: string[];
  hasOculusVisemes: boolean;
  hasFallbackVisemes: boolean;
}
