#!/usr/bin/env node
/**
 * download-avatar.mjs
 * ------------------------------------------------------------------
 * 自动下载一个合法免费、适合测试的 Humanoid GLB 测试资产，
 * 并遍历打印 Mesh / Bone / Skeleton / MorphTargetDictionary / AnimationClip。
 *
 * 默认模型：Ready Player Me 示例头像 brunette.glb
 *   - 来源：https://github.com/streamoji-sdk/TalkingHead （该仓库随源码分发此示例资产）
 *   - 许可：CC BY-NC 4.0（非商业用途，署名 Ready Player Me）——详见仓库 LICENSE-NOTICE
 *   - 能力：Humanoid Skeleton（67 关节，含手指）、72 个 MorphTarget
 *           （完整 Oculus Viseme 15 个 + ARKit 表情集）、无内嵌动画
 *
 * 用途说明：本资产仅用于验证"表情/口型/头部/肢体统一控制链路"，
 * 不代表最终人物美术方案。许可证禁止再分发，故模型文件已被 .gitignore 排除，
 * 仓库只提交本下载脚本。
 *
 * 用法：npm run download-avatar
 * 输出：public/models/avatar.glb
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'models');
const OUT_FILE = path.join(OUT_DIR, 'avatar.glb');

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** 候选源：按优先级排列，逐个尝试，直到下载到一个合法 GLB */
const SOURCES = [
  {
    name: 'Ready Player Me 示例头像 brunette.glb（TalkingHead 仓库）',
    url: 'https://raw.githubusercontent.com/streamoji-sdk/TalkingHead/main/avatars/brunette.glb',
    license: 'CC BY-NC 4.0（非商业；署名 Ready Player Me）',
  },
  {
    name: 'Ready Player Me 示例头像 avatar.glb（TalkingHead 仓库，备用）',
    url: 'https://raw.githubusercontent.com/streamoji-sdk/TalkingHead/main/avatars/avatar.glb',
    license: 'CC BY-NC 4.0（非商业；署名 Ready Player Me）',
  },
];

async function download(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 12) throw new Error('文件过小，不是合法 GLB');
  if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error('魔数校验失败：不是 glTF 二进制文件');
  return buf;
}

/** 解析 GLB JSON chunk（不依赖 DOM，可在 Node 中确定性运行） */
function parseGlb(buffer) {
  const magic = buffer.toString('ascii', 0, 4);
  if (magic !== 'glTF') throw new Error('不是合法 GLB 文件');
  const jsonLength = buffer.readUInt32LE(12);
  const jsonChunk = buffer.subarray(20, 20 + jsonLength).toString('utf8');
  return JSON.parse(jsonChunk);
}

/** 遍历并打印模型能力报告 */
function printReport(gltf, fileName, license) {
  const lines = [];
  lines.push('');
  lines.push('==========================================================');
  lines.push(' 模型能力报告');
  lines.push('==========================================================');
  lines.push(` 文件        : ${fileName}`);
  lines.push(` 许可证      : ${license}`);
  lines.push(` Nodes       : ${gltf.nodes?.length ?? 0}`);
  lines.push(` Meshes      : ${gltf.meshes?.length ?? 0}`);
  lines.push(` Skins       : ${gltf.skins?.length ?? 0}`);
  lines.push(` Animations  : ${gltf.animations?.length ?? 0}`);
  lines.push('');

  // --- Mesh + MorphTargetDictionary ---
  lines.push('--- Mesh ---');
  for (const mesh of gltf.meshes ?? []) {
    const prim = mesh.primitives?.[0];
    const targetCount = prim?.targets?.length ?? 0;
    const targetNames = prim?.extras?.targetNames ?? mesh.extras?.targetNames ?? [];
    lines.push(
      `  [${mesh.name ?? '(unnamed)'}] primitives=${mesh.primitives?.length ?? 0} morphTargets=${targetCount}`,
    );
    if (targetNames.length > 0) {
      lines.push(`      MorphTargetDictionary(${targetNames.length}): ${targetNames.join(', ')}`);
    }
  }

  // --- Bone / Skeleton ---
  lines.push('');
  lines.push('--- Bone / Skeleton ---');
  for (const skin of gltf.skins ?? []) {
    const names = (skin.joints ?? []).map((j) => gltf.nodes?.[j]?.name ?? `node#${j}`);
    lines.push(
      `  [${skin.name ?? '(unnamed skin)'}] joints=${names.length} skeletonNode=${skin.skeleton ?? '-'}`,
    );
    lines.push(`      ${names.join(', ')}`);
  }

  // --- AnimationClip ---
  lines.push('');
  lines.push('--- AnimationClip ---');
  if ((gltf.animations ?? []).length === 0) {
    lines.push('  （无内嵌动画，肢体动作由 AvatarController 程序化驱动）');
  } else {
    for (const anim of gltf.animations ?? []) {
      lines.push(`  [${anim.name ?? '(unnamed)'}]`);
    }
  }

  // --- 控制链路可用性速判 ---
  lines.push('');
  lines.push('--- 统一控制链路可用性速判 ---');
  const allNames = (gltf.meshes ?? []).flatMap((m) => {
    const prim = m.primitives?.[0];
    return prim?.extras?.targetNames ?? m.extras?.targetNames ?? [];
  });
  const check = (label, candidates) => {
    const hit = candidates.filter((c) => allNames.includes(c));
    lines.push(`  ${label.padEnd(14)}: ${hit.length > 0 ? '✓ ' + hit.join(', ') : '✗ 缺失'}`);
  };
  check('Blink', ['eyeBlinkLeft', 'eyeBlinkRight', 'blink']);
  check('Smile', ['mouthSmile', 'smile']);
  check('JawOpen', ['jawOpen', 'mouthOpen']);
  check('Oculus Viseme', ['viseme_aa', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U']);
  check('Fallback 口型', ['A', 'I', 'U', 'E', 'O', 'aa', 'ih', 'ou', 'ee', 'oh']);
  check('LookUp/Down', ['eyeLookUp', 'eyeLookDown', 'eyesLookUp', 'eyesLookDown']);

  lines.push('');
  lines.push('==========================================================');
  return lines.join('\n');
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let lastError = null;
  for (const src of SOURCES) {
    try {
      console.log(`\n[下载] ${src.name}`);
      console.log(`  ${src.url}`);
      const buf = await download(src.url);
      fs.writeFileSync(OUT_FILE, buf);
      const gltf = parseGlb(buf);
      console.log(`  已保存 ${OUT_FILE} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
      console.log(printReport(gltf, 'avatar.glb', src.license));
      console.log('[完成] 模型下载并校验成功。');
      return;
    } catch (err) {
      lastError = err;
      console.warn(`  ✗ 失败：${err.message}`);
    }
  }

  console.error('\n[错误] 所有候选源均下载失败。');
  console.error(`  最后错误：${lastError?.message}`);
  console.error('  请检查网络后重试：npm run download-avatar');
  process.exit(1);
}

main().catch((err) => {
  console.error('[错误]', err);
  process.exit(1);
});
