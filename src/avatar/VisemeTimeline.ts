/**
 * VisemeTimeline —— 口型时间轴
 * ------------------------------------------------------------------
 * 通过 requestAnimationFrame 驱动：update(dt) 推进内部时钟，
 * 计算当前激活 viseme 的目标权重（含起音/收音包络），并做指数平滑，
 * 避免口型瞬间跳变。
 *
 * 兼容性：
 * - 模型有完整 Oculus viseme（viseme_aa / viseme_E ...）→ 直接使用；
 * - 模型只有 A/I/U/E/O → resolveVisemes 自动建立兼容映射
 *   （aa→A、E→E、I→I、O→O、U→U；辅音 PP/FF/TH/DD/kk/CH/SS/nn/RR → A 且权重减半）。
 *
 * 注意：本实现不依赖"音量大小控制嘴巴开合"，权重完全来自时间轴事件。
 */

import { VisemeEvent } from './types';
import { AvatarAdapter } from './AvatarAdapter';

export interface VisemeSmoothingOptions {
  /** 平滑速率（每秒），越大跟随越紧 */
  smoothing?: number;
  /** 起音时间（秒） */
  attack?: number;
  /** 收音时间（秒） */
  release?: number;
}

const DEFAULT_OPTIONS: Required<VisemeSmoothingOptions> = {
  smoothing: 18,
  attack: 0.04,
  release: 0.09,
};

/** Oculus viseme → 回退口型映射（仅当模型缺 Oculus viseme 时使用） */
const OCULUS_TO_FALLBACK: Record<string, { viseme: string; weightScale: number }> = {
  sil: { viseme: 'sil', weightScale: 0 },
  aa: { viseme: 'A', weightScale: 1 },
  E: { viseme: 'E', weightScale: 1 },
  I: { viseme: 'I', weightScale: 1 },
  O: { viseme: 'O', weightScale: 1 },
  U: { viseme: 'U', weightScale: 1 },
  PP: { viseme: 'A', weightScale: 0.45 },
  FF: { viseme: 'A', weightScale: 0.4 },
  TH: { viseme: 'A', weightScale: 0.35 },
  DD: { viseme: 'A', weightScale: 0.5 },
  kk: { viseme: 'A', weightScale: 0.4 },
  CH: { viseme: 'I', weightScale: 0.5 },
  SS: { viseme: 'I', weightScale: 0.35 },
  nn: { viseme: 'A', weightScale: 0.35 },
  RR: { viseme: 'A', weightScale: 0.4 },
};

export class VisemeTimeline {
  private events: VisemeEvent[] = [];
  private t = 0;
  private playing = false;
  private speed = 1;
  private weights = new Map<string, number>();
  private targets = new Map<string, number>();
  private opts: Required<VisemeSmoothingOptions>;

  constructor(events: VisemeEvent[] = [], options: VisemeSmoothingOptions = {}) {
    this.events = [...events].sort((a, b) => a.time - b.time);
    this.opts = { ...DEFAULT_OPTIONS, ...options };
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get currentTime(): number {
    return this.t;
  }

  get duration(): number {
    if (this.events.length === 0) return 0;
    return Math.max(...this.events.map((e) => e.time + (e.duration ?? 0.25)));
  }

  /** 播放（可传入新事件，替换现有序列） */
  play(events?: VisemeEvent[]): void {
    if (events) this.events = [...events].sort((a, b) => a.time - b.time);
    this.t = 0;
    this.playing = true;
  }

  stop(): void {
    this.playing = false;
    this.weights.clear();
    this.targets.clear();
  }

  pause(): void {
    this.playing = false;
  }

  resume(): void {
    this.playing = true;
  }

  /**
   * 每帧调用。返回当前平滑后的 viseme → weight（0..1）映射。
   * key 为 Oculus viseme 名（'aa'/'E'/'I'/'O'/'U'/'PP'/... 或 'sil'），
   * 由上层再经 adapter 解析为具体 morph。
   */
  update(dt: number): Map<string, number> {
    if (this.playing) {
      this.t += dt * this.speed;
      if (this.t > this.duration) {
        this.playing = false;
      }
    }

    // 计算当前目标权重（含包络）
    this.targets.clear();
    if (this.playing) {
      for (const ev of this.events) {
        const start = ev.time;
        const end = ev.time + (ev.duration ?? 0.25);
        if (this.t < start || this.t > end) continue;
        let w = ev.weight ?? 1;
        if (this.t < start + this.opts.attack) {
          w *= (this.t - start) / this.opts.attack;
        }
        if (this.t > end - this.opts.release) {
          w *= Math.min(1, (end - this.t) / this.opts.release);
        }
        if (w <= 0.001) continue;
        const key = this.normalizeViseme(ev.viseme);
        this.targets.set(key, Math.max(this.targets.get(key) ?? 0, w));
      }
    }

    // 指数平滑到目标
    const k = 1 - Math.exp(-this.opts.smoothing * Math.max(0, dt));
    const keys = new Set<string>([...this.weights.keys(), ...this.targets.keys()]);
    for (const key of keys) {
      const target = this.targets.get(key) ?? 0;
      const cur = this.weights.get(key) ?? 0;
      const next = cur + (target - cur) * k;
      if (next < 0.004) this.weights.delete(key);
      else this.weights.set(key, next);
    }
    return this.weights;
  }

  private normalizeViseme(v: string): string {
    // 兼容 'viseme_aa' 写法 → 'aa'
    return v.startsWith('viseme_') ? v.slice('viseme_'.length) : v;
  }

  /**
   * 把时间轴的 viseme 权重解析为 adapter 可写的语义 morph 权重。
   * 返回：adapter 语义名 → 权重。
   */
  static resolveVisemeWeights(
    weights: Map<string, number>,
    adapter: AvatarAdapter,
  ): Map<string, number> {
    const out = new Map<string, number>();
    const useOculus = adapter.hasOculusVisemes;

    for (const [viseme, weight] of weights) {
      if (useOculus) {
        const semantic = `viseme_${viseme}`;
        if (adapter.hasMorph(semantic)) {
          out.set(semantic, weight);
        } else if (adapter.hasMorph('mouthOpen')) {
          // 个别 viseme 缺失时用 mouthOpen 兜底
          out.set('mouthOpen', weight * 0.5);
        }
        continue;
      }

      // 回退模式：只有 A/I/U/E/O
      const mapped = OCULUS_TO_FALLBACK[viseme] ?? { viseme: 'A', weightScale: 0.4 };
      if (mapped.viseme === 'sil') continue;
      const semantic = mapped.viseme;
      if (adapter.hasMorph(semantic)) {
        out.set(semantic, weight * mapped.weightScale);
      } else if (adapter.hasMorph('mouthOpen')) {
        out.set('mouthOpen', weight * mapped.weightScale * 0.6);
      }
    }
    return out;
  }
}
