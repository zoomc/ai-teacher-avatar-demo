# AI Teacher Avatar Demo

精致半写实女性 AI 教师交互演示（PoC）—— 用 React + Three.js 验证：**表情、口型、头部动作、肢体动作是否能在统一代码系统下同时调度**。

本项目不依赖任何付费 SDK / 商业数字人 SaaS / Live2D。当前模型为**测试资产**，仅用于验证控制链路，不代表最终人物美术方案。

---

## 快速开始

```bash
# 1. 安装依赖（Node 18+）
npm install

# 2. 自动下载测试模型（Ready Player Me 示例头像，CC BY-NC 4.0）
npm run download-avatar
#    下载后自动打印：Mesh / Bone / Skeleton / MorphTargetDictionary / AnimationClip / 控制链路速判

# 3. 启动开发服务器
npm run dev
#    打开 http://localhost:5173

# 4. 生产构建
npm run build   # tsc --noEmit && vite build
npm run preview # 预览构建产物
```

> 若 `npm install` 在默认镜像源（npmmirror）下卡住，可指定官方源重试：
> `npm install --registry=https://registry.npmjs.org`

---

## 目录结构

```
ai-teacher-demo/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── scripts/
│   └── download-avatar.mjs      # 模型自动下载 + 能力遍历报告
├── public/
│   └── models/
│       ├── .gitkeep
│       └── avatar.glb           # 运行 npm run download-avatar 后生成（已 gitignore）
└── src/
    ├── main.tsx / App.tsx / styles.css
    ├── avatar/                  # 统一控制架构（全部业务逻辑）
    │   ├── types.ts             # 统一语义：Emotion / Gesture / LookTarget / VisemeEvent
    │   ├── AvatarAdapter.ts     # 模型适配层：Bone / Morph 名称映射，替换模型不改业务逻辑
    │   ├── AvatarController.ts  # 统一调度器：avatar.execute({emotion, gesture, lookAt, intensity})
    │   ├── VisemeTimeline.ts    # rAF 口型时间轴（Oculus viseme + A/I/U/E/O 回退映射）
    │   ├── animations.ts        # 程序化手势姿态（Idle/Wave/Explain/Thinking/Encouraging）
    │   └── talkDemo.ts          # 预设口型序列（可直接替换为 TTS 的 phoneme/viseme timestamp）
    └── components/
        ├── AvatarScene.tsx      # Three.js 渲染场景（加载 / 灯光 / 取景 / 渲染循环）
        └── ControlPanel.tsx     # 控制面板（14 个控制按钮 + 能力信息 + 事件日志）
```

---

## 统一控制架构

```ts
avatar.execute({
  emotion: "encouraging",
  gesture: "explain",
  lookAt: "user",
  intensity: 0.7,
});
```

| 模块 | 能力 | 说明 |
| --- | --- | --- |
| `AvatarController` | 统一调度入口 | 表情插值、手势插值、眨眼状态机、视线系统、点头、口型时间轴、Run Demo 脚本 |
| `AvatarAdapter` | 模型适配层 | 统一骨位/语义 morph → 具体模型名称的启发式匹配；**无固定名称假设**，全部候选名归一化扫描 |
| `VisemeTimeline` | 口型时间轴 | rAF 驱动，起音/收音包络 + 指数平滑；Oculus viseme 全集优先，缺失时自动降级 A/I/U/E/O 映射 |
| `animations.ts` | 程序化手势 | 骨骼欧拉偏移插值，与表情/口型并行；Idle 含呼吸 + 自然摆动 |

### 控制通道（同时运行，互不干扰）

- **表情通道**：5 种情绪（neutral / happy / thinking / encouraging / surprised）Morph 权重，指数阻尼过渡，不瞬间切换；
- **口型通道**：VisemeTimeline 按时间轴平滑驱动 viseme morph，**不以音量控制嘴张合**；
- **头部系统**：自动随机眨眼、Look Left / Right / User / Up / Down（眼球 + 头部双通道，角度钳制：头 ±0.5/±0.34 rad，眼 ±0.32/±0.24 rad）、点头、轻微抬头/低头；
- **肢体通道**：Idle / Wave / Explain / Thinking Pose / Encouraging，骨骼旋转插值叠加。

### Run Demo 序列

`Idle → Blink → LookAt User → Happy → Talk → Nod → Explain → Encouraging → Return Neutral`

### 接入 TTS

`VisemeTimeline` 的输入是 `VisemeEvent[]`（`{ time, viseme, weight, duration }`）。
正式项目只需把 TTS 返回的 phoneme / viseme timestamp 映射为该结构，替换 `talkDemo.ts` 的预设序列即可，控制链路无需改动。

---

## 验证记录（本机实测）

| 项目 | 结果 |
| --- | --- |
| `npm install` | ✅ 75 包，11s |
| `npm run download-avatar` | ✅ 4.50 MB 下载 + 完整能力报告（78 nodes / 10 meshes / 67 关节 / 72 morph） |
| `npm run build` | ✅ tsc --noEmit + vite build 通过（42 modules，~752 KB JS） |
| `npm run dev` | ✅ http://localhost:5173 正常渲染 |
| 模型加载 | ✅ 无 404 / 无 Console Error / 无 Shader Error |
| 骨骼映射 | ✅ 26/26 统一骨位命中（含双臂五指） |
| MorphTarget | ✅ 72 个，Oculus viseme 全集 ✓ |
| 表情 | ✅ happy→mouthSmile 0.68（=0.85×0.8）、surprised→jawOpen 0.40（=0.5×0.8） |
| 口型 | ✅ viseme_aa 实时权重 0.89~0.98 |
| 眨眼 | ✅ eyeBlinkLeft/Right 峰值 0.59，自动随机 + 手动触发 |
| LookAt | ✅ Look Right 头部骨骼 yaw 0→0.25 rad |
| 肢体 | ✅ Wave/Explain/Encouraging 骨骼偏移 + 手势 morph 同时生效 |
| 多通道并行 | ✅ Run Demo 全程：表情/口型/骨骼/视线同时工作 |

---

## 使用资产与 License

### 测试模型

| 项 | 值 |
| --- | --- |
| 模型 | Ready Player Me 示例头像 `brunette.glb`（来源：[streamoji-sdk/TalkingHead](https://github.com/streamoji-sdk/TalkingHead)） |
| License | **CC BY-NC 4.0**（署名：Ready Player Me；**非商业使用**；**禁止再分发**） |
| 商业使用 | ❌ 不允许。商用需与 Ready Player Me 合作（或使用其付费资产），或更换为 CC0 模型 |
| 放入 Public GitHub | ⚠️ **不建议**。CC BY-NC 4.0 禁止再分发，`public/models/*.glb` 已加入 `.gitignore`，仓库只提交自动下载脚本 |

**因此项目只提交 `npm run download-avatar` 脚本，不提交模型文件本身。** 克隆后运行该脚本即可自动获取测试模型。

### 商用模型替换建议（正式项目）

- **VRoid Studio 官方 β Ver AvatarSample（AvatarSample_D/E/F）为 CC0**，可自由商用与再分发；但 VRoid 模型为 VRM 格式，需在适配层增加 VRM 加载（或导出为 GLB）。
- 高质量半写实女性模型（MetaHuman、自建/商用采购）普遍带 ARKit morph + humanoid 骨骼，本项目适配层（`AvatarAdapter`）已按 ARKit 命名 + 候选名扫描实现，换模型时**无需重写业务逻辑**，只需：
  1. 在 `BONE_PART_CANDIDATES` / `MORPH_ALIASES` 补充新模型命名（如果与 ARKit/RPM 命名不同）；
  2. 在 `animations.ts` 中按新模型 T-Pose 骨骼朝向微调姿态角度；
  3. 确认模型带 morph 名称后（本适配层支持从 `extras.targetNames` 兜底建字典），即可直接运行。

### 依赖 License

React / Vite / TypeScript / Three.js 均为 MIT 许可。

### 凭证安全

`.gitignore` 已排除 `.env*`、`*.pem`、`*.key`；项目不含任何 API Key / Token / Cookie / Credential。

---

## 已知限制

- 测试模型为**卡通风格 RPM 资产**，仅验证控制链路；最终人物美术需替换为精致半写实模型（见上）。
- 当前模型无内嵌 AnimationClip，肢体动作全部为程序化骨骼驱动（这符合需求第二路方案，且保证与表情/口型并行）。
- 中文口型目前按字素→viseme 近似映射；真实语音口型需接入 TTS 的 phoneme/viseme timestamp。
