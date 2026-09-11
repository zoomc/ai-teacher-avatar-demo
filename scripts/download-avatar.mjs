#!/usr/bin/env node
/**
 * download-avatar.mjs
 * ------------------------------------------------------------------
 * 自动下载一个合法免费、适合测试的女性 Humanoid 数字人资产（优先 VRM），
 * 并遍历打印 Mesh / Bone / Skeleton / 表情预设（MorphTarget）/ AnimationClip。
 *
 * 默认模型：VRM 官方女性示例 AvatarSample_A（pixiv/UniVRM 系）
 *   - 来源：https://github.com/simahanfeng007-lgtm/Tiangongzaowu-V3
 *           （仓库 Apache-2.0，内嵌 VRM 官方示例模型，可商用、可再分发）
 *   - 能力：VRM 0.x，表情预设 neutral/a/i/u/e/o/blink/blink_l/blink_r/
 *           angry/fun/joy/sorrow/unknown（A/I/U/E/O 即可驱动口型），
 *           Humanoid 骨骼（含左右眼、全指骨），无内嵌动画
 *
 * 用途说明：本资产用于验证"表情/口型/头部/肢体统一控制链路"，
 * 不代表最终人物美术方案。VRM 模型文件体积较大，已由 .gitignore 排除，
 * 仓库只提交本下载脚本（CI 部署时现场下载）。
 *
 * 用法：npm run download-avatar
 * 输出：public/models/avatar.vrm（VRM 优先）；若 VRM 全部失败，
 *       回退下载 GLB 输出 public/models/avatar.glb（旧测试资产，仅验证链路）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'models');
const OUT_VRM = path.join(OUT_DIR, 'avatar.vrm');
const OUT_GLB = path.join(OUT_DIR, 'avatar.glb');

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** 候选源（按优先级）：
 *  1. VRM 官方女性示例 AvatarSample_A（Apache-2.0 仓库，可商用再分发）——主模型
 *  2. mondradiko 仓库内 VRM 示例（Arisu / Alicia，仓库 LGPL-3.0；仅作备用源）
 *  3. 旧 GLB 测试资产（CC BY-NC，禁止再分发）——仅回退验证控制链路
 */
const VRM_SOURCES = [
  {
    name: 'VRM 官方女性示例 AvatarSample_A（Tiangongzaowu-V3 仓库，Apache-2.0）',
    url: 'https://media.githubusercontent.com/media/simahanfeng007-lgtm/Tiangongzaowu-V3/main/app/assets/avatars/imported/AvatarSample_A.vrm',
    license: 'Apache-2.0（仓库许可；VRM 官方示例模型，可商用 / 再分发 / 放 Public GitHub）',
  },
  {
    name: 'VRM 示例 Arisu（mondradiko 仓库，LGPL-3.0）',
    url: 'https://media.githubusercontent.com/media/mondradiko/mondradiko/main/examples/assets/models/Arisu/Arisu.vrm',
    license: '仓库 LGPL-3.0（模型自身授权未单独声明，仅作备用）',
  },
  {
    name: 'VRM 示例 Alicia（mondradiko 仓库，LGPL-3.0）',
    url: 'https://media.githubusercontent.com/media/mondradiko/mondradiko/main/examples/assets/models/Alicia/Alicia.vrm',
    license: '仓库 LGPL-3.0（模型自身授权未单独声明，仅作备用）',
  },
];

const GLB_SOURCES = [
  {
    name: 'Ready Player Me 示例头像 brunette.glb（TalkingHead 仓库，CC BY-NC）',
    url: 'https://raw.githubusercontent.com/streamoji-sdk/TalkingHead/main/avatars/brunette.glb',
    license: 'CC BY-NC 4.0（非商业；署名 Ready Player Me；禁止再分发）',
  },
];

async function download(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 20) throw new Error('文件过小，不是合法 glTF 二进制');
  if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error('魔数校验失败：不是 glTF 二进制文件');
  return buf;
}

/** 解析 GLB JSON chunk（不依赖 DOM，可在 Node 中确定性运行） */
function parseGlb(buffer) {
  const jsonLength = buffer.readUInt32LE(12);
  const jsonChunk = buffer.subarray(20, 20 + jsonLength).toString('utf8');
  return JSON.parse(jsonChunk);
}

// ---------------------------------------------------------------- VRM 报告

function printVrmReport(gltf, fileName, license) {
  const lines = [];
  lines.push('');
  lines.push('==========================================================');
  lines.push(' 模型能力报告（VRM）');
  lines.push('==========================================================');
  lines.push(` 文件        : ${fileName}`);
  lines.push(` 许可证      : ${license}`);
  lines.push(` Nodes       : ${gltf.nodes?.length ?? 0}`);
  lines.push(` Meshes      : ${gltf.meshes?.length ?? 0}`);
  lines.push(` Skins       : ${gltf.skins?.length ?? 0}`);
  lines.push(` Animations  : ${gltf.animations?.length ?? 0}`);
  lines.push('');

  const vrm = gltf.extensions?.VRM;
  const isVrm1 = !!gltf.extensions?.VRMC_vrm;
  lines.push(` VRM 版本    : ${isVrm1 ? '1.0 (VRMC_vrm)' : vrm ? '0.x (extensions.VRM)' : '未知'}`);
  const vrmName = vrm?.meta?.name ?? gltf.extensions?.VRMC_vrm?.meta?.name ?? '(unnamed)';
  lines.push(` 人物名      : ${vrmName}`);

  // --- Mesh + MorphTarget ---
  lines.push('');
  lines.push('--- Mesh + MorphTarget ---');
  for (const mesh of gltf.meshes ?? []) {
    const prim = mesh.primitives?.[0];
    const targetCount = prim?.targets?.length ?? 0;
    const targetNames = prim?.extras?.targetNames ?? mesh.extras?.targetNames ?? [];
    lines.push(`  [${mesh.name ?? '(unnamed)'}] primitives=${mesh.primitives?.length ?? 0} morphTargets=${targetCount}`);
    if (targetNames.length > 0) {
      lines.push(`      MorphTargetDictionary(${targetNames.length}): ${targetNames.join(', ')}`);
    }
  }

  // --- 表情预设（VRM BlendShape）---
  lines.push('');
  lines.push('--- 表情预设 BlendShapeGroups（VRM 驱动入口）---');
  if (vrm?.blendShapeMaster?.blendShapeGroups?.length) {
    const groups = vrm.blendShapeMaster.blendShapeGroups;
    lines.push(`  presets(${groups.length}): ${groups.map((g) => g.presetName).join(', ')}`);
  } else if (gltf.extensions?.VRMC_vrm?.expressions?.preset) {
    const p = gltf.extensions.VRMC_vrm.expressions.preset;
    lines.push(`  presets: ${Object.keys(p).join(', ')}`);
  } else {
    lines.push('  （未发现 VRM 表情预设）');
  }

  // --- Bone / Skeleton ---
  lines.push('');
  lines.push('--- Bone / Skeleton ---');
  const humanBones = vrm?.humanoid?.humanBones ?? gltf.extensions?.VRMC_vrm?.humanoid?.humanBones;
  if (humanBones) {
    const names = Object.entries(humanBones).map(([k, v]) => {
      const node = gltf.nodes?.[v?.node];
      return `${k}(${node?.name ?? `node#${v?.node}`})`;
    });
    lines.push(`  humanBones(${names.length})：`);
    lines.push(`      ${names.join(', ')}`);
  } else {
    for (const skin of gltf.skins ?? []) {
      const names = (skin.joints ?? []).map((j) => gltf.nodes?.[j]?.name ?? `node#${j}`);
      lines.push(`  [${skin.name ?? '(unnamed skin)'}] joints=${names.length}`);
      lines.push(`      ${names.join(', ')}`);
    }
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
  const presetNames = new Set(
    (vrm?.blendShapeMaster?.blendShapeGroups ?? []).map((g) => g.presetName),
  );
  if (presetNames.size > 0) {
    const check = (label, presets) => {
      const hit = presets.filter((p) => presetNames.has(p));
      lines.push(`  ${label.padEnd(14)}: ${hit.length > 0 ? '✓ ' + hit.join(', ') : '✗ 缺失'}`);
    };
    check('Blink', ['blink']);
    check('Smile', ['joy', 'fun']);
    check('Angry', ['angry']);
    check('Sad', ['sorrow']);
    check('口型 A/I/U/E/O', ['a', 'i', 'u', 'e', 'o']);
    check('LookUp/Down', ['lookUp', 'lookDown']);
    check('LookLeft/Right', ['lookLeft', 'lookRight']);
  } else {
    lines.push('  （VRM 表情预设缺失，请检查模型）');
  }

  lines.push('');
  lines.push('==========================================================');
  return lines.join('\n');
}

// ---------------------------------------------------------------- GLB 报告

function printGlbReport(gltf, fileName, license) {
  const lines = [];
  lines.push('');
  lines.push('==========================================================');
  lines.push(' 模型能力报告（GLB · 回退测试资产）');
  lines.push('==========================================================');
  lines.push(` 文件        : ${fileName}`);
  lines.push(` 许可证      : ${license}`);
  lines.push(` Nodes       : ${gltf.nodes?.length ?? 0}`);
  lines.push(` Meshes      : ${gltf.meshes?.length ?? 0}`);
  lines.push(` Skins       : ${gltf.skins?.length ?? 0}`);
  lines.push(` Animations  : ${gltf.animations?.length ?? 0}`);
  lines.push('');

  lines.push('--- Mesh ---');
  for (const mesh of gltf.meshes ?? []) {
    const prim = mesh.primitives?.[0];
    const targetNames = prim?.extras?.targetNames ?? mesh.extras?.targetNames ?? [];
    lines.push(
      `  [${mesh.name ?? '(unnamed)'}] primitives=${mesh.primitives?.length ?? 0} morphTargets=${prim?.targets?.length ?? 0}`,
    );
    if (targetNames.length > 0) {
      lines.push(`      MorphTargetDictionary(${targetNames.length}): ${targetNames.join(', ')}`);
    }
  }

  lines.push('');
  lines.push('--- Bone / Skeleton ---');
  for (const skin of gltf.skins ?? []) {
    const names = (skin.joints ?? []).map((j) => gltf.nodes?.[j]?.name ?? `node#${j}`);
    lines.push(`  [${skin.name ?? '(unnamed skin)'}] joints=${names.length}`);
    lines.push(`      ${names.join(', ')}`);
  }

  lines.push('');
  lines.push('--- AnimationClip ---');
  if ((gltf.animations ?? []).length === 0) {
    lines.push('  （无内嵌动画，肢体动作由 AvatarController 程序化驱动）');
  } else {
    for (const anim of gltf.animations ?? []) {
      lines.push(`  [${anim.name ?? '(unnamed)'}]`);
    }
  }

  lines.push('');
  lines.push('==========================================================');
  return lines.join('\n');
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // ---- 优先下载 VRM ----
  let lastError = null;
  for (const src of VRM_SOURCES) {
    try {
      console.log(`\n[下载] ${src.name}`);
      console.log(`  ${src.url}`);
      const buf = await download(src.url);
      const gltf = parseGlb(buf);
      const isVrm = gltf.extensions?.VRM || gltf.extensions?.VRMC_vrm;
      if (!isVrm) throw new Error('文件不是 VRM（缺少 extensions.VRM / VRMC_vrm）');
      fs.writeFileSync(OUT_VRM, buf);
      // 旧 GLB 回退资产若存在则移除，避免加载器歧义
      if (fs.existsSync(OUT_GLB)) fs.unlinkSync(OUT_GLB);
      console.log(`  已保存 ${OUT_VRM} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
      console.log(printVrmReport(gltf, 'avatar.vrm', src.license));
      console.log('[完成] VRM 模型下载并校验成功。');
      return;
    } catch (err) {
      lastError = err;
      console.warn(`  ✗ 失败：${err.message}`);
    }
  }

  // ---- VRM 全部失败 → 回退 GLB ----
  console.warn('\n[回退] VRM 候选源均不可用，尝试下载 GLB 测试资产（仅验证控制链路）。');
  for (const src of GLB_SOURCES) {
    try {
      console.log(`\n[下载] ${src.name}`);
      console.log(`  ${src.url}`);
      const buf = await download(src.url);
      const gltf = parseGlb(buf);
      fs.writeFileSync(OUT_GLB, buf);
      if (fs.existsSync(OUT_VRM)) fs.unlinkSync(OUT_VRM);
      console.log(`  已保存 ${OUT_GLB} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
      console.log(printGlbReport(gltf, 'avatar.glb', src.license));
      console.log('[完成] GLB 回退模型下载并校验成功。');
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
