/**
 * ControlPanel —— Demo 控制面板
 * ------------------------------------------------------------------
 * 按钮按规范提供：Neutral / Happy / Thinking / Encouraging / Surprised /
 * Blink / Look Left / Look Right / Nod / Wave / Explain / Thinking Pose /
 * Talk Demo / Run Demo。
 * 所有按钮只调用 AvatarController 的统一语义 API。
 */

import type { AvatarController } from '../avatar/AvatarController';
import type { AvatarCapabilities } from '../avatar/AvatarAdapter';

interface Props {
  controller: AvatarController | null;
  caps: AvatarCapabilities | null;
  logs: string[];
}

interface Btn {
  label: string;
  onClick: (c: AvatarController) => void;
  kind?: 'primary';
}

function Button({ b, c }: { b: Btn; c: AvatarController | null }) {
  return (
    <button
      className={`ctrl-btn${b.kind === 'primary' ? ' primary' : ''}`}
      disabled={!c}
      onClick={() => c && b.onClick(c)}
    >
      {b.label}
    </button>
  );
}

const EMOTION_BTNS: Btn[] = [
  { label: 'Neutral', onClick: (c) => c.setEmotion('neutral') },
  { label: 'Happy', onClick: (c) => c.setEmotion('happy') },
  { label: 'Thinking', onClick: (c) => c.setEmotion('thinking') },
  { label: 'Encouraging', onClick: (c) => c.setEmotion('encouraging') },
  { label: 'Surprised', onClick: (c) => c.setEmotion('surprised') },
];

const HEAD_BTNS: Btn[] = [
  { label: 'Blink', onClick: (c) => c.blinkNow() },
  { label: 'Look Left', onClick: (c) => c.setLook('left') },
  { label: 'Look Right', onClick: (c) => c.setLook('right') },
  { label: 'Look Up', onClick: (c) => c.setLook('up') },
  { label: 'Look Down', onClick: (c) => c.setLook('down') },
  { label: 'Look At User', onClick: (c) => c.setLook('user') },
  { label: 'Nod', onClick: (c) => c.nod() },
];

const GESTURE_BTNS: Btn[] = [
  { label: 'Idle', onClick: (c) => c.setGesture('idle') },
  { label: 'Wave', onClick: (c) => c.setGesture('wave') },
  { label: 'Explain', onClick: (c) => c.setGesture('explain') },
  { label: 'Thinking Pose', onClick: (c) => c.setGesture('thinkingPose') },
  { label: 'Encouraging Gesture', onClick: (c) => c.setGesture('encouraging') },
];

const DEMO_BTNS: Btn[] = [
  { label: 'Talk Demo', onClick: (c) => c.playTalk() },
  { label: 'Run Demo', onClick: (c) => c.runDemo(), kind: 'primary' },
  { label: 'Stop All', onClick: (c) => c.stopAll() },
];

export function ControlPanel({ controller, caps, logs }: Props) {
  return (
    <aside className="panel">
      <h1 className="panel-title">AI 教师 · 统一控制 Demo</h1>
      <p className="panel-sub">
        AvatarController.execute({'emotion / gesture / lookAt / intensity'}) 统一调度
      </p>

      <section className="ctrl-group">
        <h2>表情 Emotion（插值过渡）</h2>
        <div className="ctrl-grid">
          {EMOTION_BTNS.map((b) => (
            <Button key={b.label} b={b} c={controller} />
          ))}
        </div>
      </section>

      <section className="ctrl-group">
        <h2>头部 Head</h2>
        <div className="ctrl-grid">
          {HEAD_BTNS.map((b) => (
            <Button key={b.label} b={b} c={controller} />
          ))}
        </div>
      </section>

      <section className="ctrl-group">
        <h2>肢体 Gesture（与表情/口型并行）</h2>
        <div className="ctrl-grid">
          {GESTURE_BTNS.map((b) => (
            <Button key={b.label} b={b} c={controller} />
          ))}
        </div>
      </section>

      <section className="ctrl-group">
        <h2>演示 Demo</h2>
        <div className="ctrl-grid">
          {DEMO_BTNS.map((b) => (
            <Button key={b.label} b={b} c={controller} />
          ))}
        </div>
      </section>

      <section className="ctrl-group caps">
        <h2>模型能力（自动探测）</h2>
        {caps ? (
          <ul className="caps-list">
            <li>人物类型：{caps.isVrm ? 'VRM（表情预设体系）' : 'GLB（MorphTarget 体系）'}</li>
            <li>骨骼关节（统一骨位）：{caps.boneParts.length}</li>
            <li>{caps.isVrm ? '表情预设' : 'MorphTarget'}：{caps.morphNames.length}</li>
            <li>口型（A/I/U/E/O）：{caps.hasFallbackVisemes ? '✓ 可用' : '✗ 缺失'}</li>
            <li>AnimationClip：{caps.animationNames.length > 0 ? caps.animationNames.join(', ') : '无（程序化驱动）'}</li>
          </ul>
        ) : (
          <p className="muted">模型加载后显示…</p>
        )}
      </section>

      <section className="ctrl-group log">
        <h2>事件日志</h2>
        <div className="log-area">
          {logs.length === 0 ? (
            <p className="muted">暂无事件，点击按钮触发动作。</p>
          ) : (
            logs.map((l, i) => (
              <div key={i} className="log-line">
                {l}
              </div>
            ))
          )}
        </div>
      </section>
    </aside>
  );
}
