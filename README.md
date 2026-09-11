# AI Teacher Avatar Demo

精致半写实女性 AI 教师交互演示（PoC）—— 用 React + Three.js 验证：**表情、口型、头部动作、肢体动作是否能在统一代码系统下同时调度**。

本项目不依赖任何付费 SDK / 商业数字人 SaaS / Live2D。当前模型为**测试资产**（VRM 官方示例女性模型），仅用于验证控制链路，不代表最终人物美术方案。

---

## 快速开始

```bash
# 1. 安装依赖（Node 18+）
npm install

# 2. 自动下载测试模型（VRM 官方女性示例 AvatarSample_A，Apache-2.0）
npm run download-avatar
#    下载后自动打印：Mesh / Bone / Skeleton / MorphTargetDictionary / 表情 preset / humanBones / AnimationClip / 控制链路速判

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
│   └── download-avatar.mjs      # 模型自动下载（VRM 主源 + GLB 回退）+ 能力遍历报告
├── public/
│   └── models/
│       ├── .gitkeep
│       └── avatar.vrm           # 运行 npm run download-avatar 后生成（已 gitignore）
└── src/
    ├── main.tsx / App.tsx / styles.css
    ├── avatar/                  # 统一控制架构（全部业务逻辑）
    │   ├── types.ts             # 统一语义：Emotion / Gesture / LookTarget / VisemeEvent
    │   ├── AvatarAdapter.ts     # 模型适配层：VRM / GLB 双模式，Bone / Morph 名称映射，替换模型不改业务逻辑
    │   ├── AvatarController.ts  # 统一调度器：avatar.execute({emotion, gesture, lookAt, intensity})
    │   ├── VisemeTimeline.ts    # rAF 口型时间轴（Oculus viseme + A/I/U/E/O 回退映射）
    │   ├── animations.ts        # 程序化手势姿态（GLTF 表 + VRM 表，Idle/Wave/Explain/Thinking/Encouraging）
    │   └── talkDemo.ts          # 预设口型序列（可直接替换为 TTS 的 phoneme/viseme timestamp）
    └── components/
        ├── AvatarScene.tsx      # Three.js 渲染场景（VRM 加载 / 灯光 / 取景 / 渲染循环 / lookAt 接管）
        └── ControlPanel.tsx     # 控制面板（控制按钮 + 能力信息 + 事件日志）
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
| `AvatarController` | 统一调度入口 | 表情插值、手势插值、眨眼状态机、视线系统、点头、口型时间轴、Run Demo 脚本；按 `poseSet: 'gltf' \| 'vrm'` 选择姿势表 |
| `AvatarAdapter` | 模型适配层 | **VRM / GLB 双模式**：统一骨位/语义 morph → 具体模型名称的启发式匹配；**无固定名称假设**，全部候选名归一化扫描；VRM 走 `humanoid.getNormalizedBoneNode()`（避免被 autoUpdateHumanBones 覆盖） |
| `VisemeTimeline` | 口型时间轴 | rAF 驱动，起音/收音包络 + 指数平滑；Oculus viseme 全集优先，缺失时自动降级 A/I/U/E/O 映射（VRM 预设 aa/ih/ou/ee/oh） |
| `animations.ts` | 程序化手势 | 骨骼欧拉偏移插值，与表情/口型并行；Idle 含呼吸 + 自然摆动；GLTF / VRM 两套姿势表（VRM 绕局部 Z 抬臂） |

### 控制通道（同时运行，互不干扰）

- **表情通道**：5 种情绪（neutral / happy / thinking / encouraging / surprised）Morph 权重，指数阻尼过渡，不瞬间切换；
- **口型通道**：VisemeTimeline 按时间轴平滑驱动 viseme morph，**不以音量控制嘴张合**；
- **头部系统**：自动随机眨眼、Look Left / Right / User / Up / Down（VRM 眼球由 lookAt.target 接管 + 头部骨骼双通道，角度钳制：头 ±0.5/±0.34 rad，眼 ±0.32/±0.24 rad）、点头、轻微抬头/低头；
- **肢体通道**：Idle / Wave / Explain / Thinking Pose / Encouraging，骨骼旋转插值叠加。

### Run Demo 序列

`Idle → Blink → LookAt User → Happy → Talk → Nod → Explain → Encouraging → Return Neutral`

### 接入 TTS

`VisemeTimeline` 的输入是 `VisemeEvent[]`（`{ time, viseme, weight, duration }`）。
正式项目只需把 TTS 返回的 phoneme / viseme timestamp 映射为该结构，替换 `talkDemo.ts` 的预设序列即可，控制链路无需改动。

---

## 验证记录（本机实测，VRM 模型）

| 项目 | 结果 |
| --- | --- |
| `npm install` | ✅ 通过（含 @pixiv/three-vrm@3.5.5） |
| `npm run download-avatar` | ✅ 15.1 MB 下载 + 完整能力报告（humanBones 54 根 / 表情 preset 15 个 / morphTargets） |
| `npm run build` | ✅ tsc --noEmit + vite build 通过 |
| `npm run dev` | ✅ http://localhost:5199 正常渲染 |
| 模型加载 | ✅ VRM 正面渲染，无 404 / 无 Console Error / 无 Shader Error |
| 骨骼映射 | ✅ 26/26 统一骨位命中（VRM normalized bones，含双臂五指） |
| 表情 | ✅ 25 表情预设，happy→expressionManager 'happy'=1.0、surprised 正常；指数插值过渡 |
| 口型 | ✅ VRM 预设 aa 实时权重 0.98（微笑+说话可见） |
| 眨眼 | ✅ blink 预设，自动随机 + 手动触发 |
| LookAt | ✅ Look Right 头部 yaw ≈ -0.5 rad（世界基向量解算）；VRM 眼球随相机 |
| 肢体 | ✅ Wave（挥手）/ Explain（双臂高举摊开）/ Thinking（右臂抬起）/ Encouraging（右臂握拳抬起）全部骨骼驱动生效 |
| 多通道并行 | ✅ Run Demo 全程：表情/口型/骨骼/视线同时工作，0 console error |

> 注：VRM0 模型必须对全部 Bone 开启 `matrixAutoUpdate` 且每帧 `scene.updateMatrixWorld(true)`，否则蒙皮不随骨骼更新（已修复并验证）。

---

## 使用资产与 License

### 测试模型

| 项 | 值 |
| --- | --- |
| 模型 | VRM 官方女性示例 `AvatarSample_A`（来源：[simahanfeng007-lgtm/Tiangongzaowu-V3](https://github.com/simahanfeng007-lgtm/Tiangongzaowu-V3)，app/assets/avatars/imported/AvatarSample_A.vrm，GitHub API 确认 license=Apache-2.0） |
| License | **Apache-2.0**（仓库级授权） |
| 商业使用 | ✅ 允许 |
| 再分发 | ✅ 允许（Apache-2.0） |
| 放入 Public GitHub | ✅ 允许；但为控制仓库体积，仍沿用 `.gitignore` 排除 `public/models/*.vrm|*.glb`，CI/本地运行 `npm run download-avatar` 现场下载 |

**因此项目只提交 `npm run download-avatar` 脚本，不提交模型文件本身。** 克隆后运行该脚本即可自动获取测试模型。

> 备用源（脚本内已配置）：[mondradiko](https://github.com/mondradiko/mondradiko) 的 Arisu.vrm / Alicia.vrm（仓库 LGPL-3.0，模型自身授权未单独声明，仅作脚本备用）。
> GLB 回退源：streamoji-sdk/TalkingHead `brunette.glb`（CC BY-NC 4.0，禁商用/禁再分发，仅作加载链路兜底验证，不会进入仓库）。

### 高质量模型替换（正式项目）

本适配层已实现 **VRM + GLB 双模式**（`@pixiv/three-vrm`），换用任意 VRM 半写实模型时：

1. `npm run download-avatar` 的模型 URL 换成目标模型即可（VRM 0.x 直接可用；VRM 1.x 仅需将 `avatar.vrm` 换名，加载逻辑兼容）；
2. VRM 模型的动作方向差异只需改 `animations.ts` 的 `GESTURE_POSES_VRM` 表；
3. ARKit 风格 GLB（MetaHuman 等）走既有 GLB 分支，骨骼/morph 命名按候选名扫描自动命中。

**替换模型时无需重写 AvatarController / VisemeTimeline / 业务逻辑。**

### 依赖 License

React / Vite / TypeScript / Three.js 均为 MIT 许可；@pixiv/three-vrm 为 MIT 许可。

### 凭证安全

`.gitignore` 已排除 `.env*`、`*.pem`、`*.key`；项目不含任何 API Key / Token / Cookie / Credential。

---

## 已知限制

- 当前测试模型为 **VRoid 系二次元风格**（VRM 官方示例），仅验证控制链路；最终人物美术需替换为精致半写实女性模型（VRM 或 ARKit GLB 均可，见上）。
- 当前模型无内嵌 AnimationClip，肢体动作全部为程序化骨骼驱动（这符合需求第二路方案，且保证与表情/口型并行）。
- 中文口型目前按字素→viseme 近似映射；真实语音口型需接入 TTS 的 phoneme/viseme timestamp。
