/**
 * talkDemo.ts —— 演示用 Viseme 序列
 * ------------------------------------------------------------------
 * 用简单的"字素 → viseme"规则生成预设口型时间轴，证明 VisemeTimeline
 * 的驱动链路可用。正式接入 TTS 时，直接用 TTS 返回的
 * phoneme / viseme timestamp 生成 VisemeEvent[] 替换即可。
 */

import { VisemeEvent } from './types';

/** 单字符（拼音近似）→ Oculus viseme */
function charToViseme(ch: string): string {
  const c = ch.toLowerCase();
  if (c === ' ') return 'sil';
  if (/[.,!?，。！？、]/.test(ch)) return 'sil';
  if (/[aeiouü]/.test(c)) {
    if (c === 'a') return 'aa';
    if (c === 'e') return 'E';
    if (c === 'i') return 'I';
    if (c === 'o') return 'O';
    return 'U';
  }
  if (/[mn]/.test(c)) return 'nn';
  if (/[bp]/.test(c)) return 'PP';
  if (/[f]/.test(c)) return 'FF';
  if (/[dt]/.test(c)) return 'DD';
  if (/[gk]/.test(c)) return 'kk';
  if (/[rl]/.test(c)) return 'RR';
  if (/[szxc]/.test(c)) return 'SS';
  if (/[jqhy]/.test(c)) return 'CH';
  return 'aa';
}

/**
 * 文本 → VisemeEvent[]。
 * @param text 演示文本（中文按拼音近似，英文按字母）
 * @param start 起始时间（秒）
 * @param charsPerSecond 语速（字符/秒）
 * @param overlap 相邻事件重叠比例（0~1），越大越连贯
 */
export function textToVisemeEvents(
  text: string,
  start = 0,
  charsPerSecond = 3.1,
  overlap = 0.18,
): VisemeEvent[] {
  const events: VisemeEvent[] = [];
  const dur = 1 / charsPerSecond;
  const step = dur * (1 - overlap);
  let t = start;
  for (const ch of text) {
    const viseme = charToViseme(ch);
    if (viseme === 'sil') {
      t += dur * 0.6;
      continue;
    }
    events.push({ time: t, viseme, weight: 1, duration: dur });
    t += step;
  }
  return events;
}

/** Talk Demo 预设句子 */
export const TALK_DEMO_TEXT = '大家好，我是你们的AI老师，今天我们一起来学习。';

export function createTalkDemo(): VisemeEvent[] {
  return textToVisemeEvents(TALK_DEMO_TEXT);
}
