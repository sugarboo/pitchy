# AGENTS.md — 实时练声 PWA MVP

> 本文件是本仓库的项目约束、产品规划、技术设计和编码代理执行规范。任何人类开发者或 Coding Agent 在修改代码前都必须先阅读本文件。
>
> 工作项目名：`pitchy`（临时名，可在产品定名后统一替换）  
> 规划版本：v0.1 MVP  
> 更新日期：2026-07-22

---

## 1. 项目使命

构建一个 **TypeScript 前端完全本地运行** 的实时练声 PWA：

- 用户授权麦克风后，立即看到实时音高、音名、频率和音分偏差；
- 提供低延迟的音高轨迹、输入电平和长音稳定度反馈；
- 练习结束后，在本机生成简洁报告；
- 默认不上传、不保存原始录音，不依赖后端，不依赖机器学习；
- 后续可在相同架构上加入基于传统 DSP、人工规则和个人校准的发声状态倾向分析。

核心价值不是“又一个调音器”，而是：

> 用可解释、低延迟、隐私优先的方式，为声乐练习提供实时反馈。

---

## 2. 不可违背的原则

### 2.1 技术边界

1. 生产运行时必须完全位于浏览器本地。
2. MVP 不得引入后端 API、云函数、远程数据库或远程音频分析。
3. MVP 不得使用机器学习、神经网络、ONNX、TensorFlow.js 或远程 AI 服务。
4. 音高检测采用传统 DSP，首选自研 YIN。
5. 不得为了图表或状态管理引入重量级框架。
6. 不得在主线程执行持续的高计算量 DSP。
7. 不得把未经验证的经验阈值包装成科学结论。

### 2.2 产品表达

1. 不得声称本产品能够诊断声带状态或替代声乐老师、医生、EGG、喉镜等专业检查。
2. 在没有目标音的自由练声模式中，不得把“距离最近十二平均律半音的偏差”直接命名为“唱准率”。
3. 后续发声模式功能统一使用“倾向”“参考”“实验性”“置信度”等措辞。
4. MVP 不显示“弱混”“强混”“假声鉴定”等确定性结论。
5. 音频输入质量不足时必须显示“无法稳定检测”，不得硬给结果。

### 2.3 隐私原则

1. 默认不保存原始 PCM 或录音。
2. 默认不发出任何跨域请求。
3. 不集成第三方分析、广告、字体 CDN、错误跟踪或热更新 SDK。
4. 用户练习数据仅保存在 IndexedDB；必须提供清空入口。
5. 未来若增加录音保存，必须默认关闭，并明确显示“仅保存在本设备”。

### 2.4 主题与国际化原则

1. 所有用户界面必须同时支持暗色和亮色主题，并提供用户可见的显式切换入口。
2. 首次打开时可跟随系统主题；用户明确选择后必须优先使用并仅在本地持久化，不得在练习过程中自动改变主题。
3. 所有面向用户的文案必须通过本地、类型安全的国际化词典提供，不得散落硬编码在组件中。
4. MVP 至少支持简体中文（`zh-CN`）和英文（`en`）即时切换；切换不得刷新页面、丢失练习状态或触发网络请求。
5. 缺失翻译必须在开发或测试阶段暴露，不得在生产 UI 中显示翻译键或空字符串。

---

## 3. MVP 范围

### 3.1 必须交付

#### A. 麦克风与运行状态

- 由明确的用户点击触发麦克风授权；
- 支持开始、暂停、恢复、停止练习；
- 授权后支持麦克风设备选择；
- 显示实际采样率、输入设备和输入处理能力；
- 正确处理拒绝授权、设备断开、页面隐藏和 AudioContext 挂起。

#### B. 实时音高

- 显示当前音名，例如 `F4`；
- 显示频率，例如 `349.2 Hz`；
- 显示相对参考音的 cents 偏差；
- 显示 voiced/unvoiced 状态；
- 显示检测置信度；
- 显示最近 8–10 秒音高轨迹；
- 处理常见倍频和半频跳变；
- 支持 A4 基准频率设置，默认 440 Hz。

#### C. 两种练习模式

**自由练声模式**

- 自动识别当前音名；
- cents 表示相对最近十二平均律音高中心的偏差；
- UI 必须标注“音中心偏差”，不称为“音准得分”。

**目标音模式**

- 用户可选择目标音；
- cents 表示相对目标音的真实偏差；
- 统计目标音命中时间和稳定时间；
- 目标音差距过大时仍显示实际检测音，不伪装为目标音。

#### D. 实时练声指标

- 输入电平：RMS / dBFS 近似值；
- 长音稳定度：基于最近约 1 秒有效帧的稳健离散程度；
- 连续发声时长；
- 当前稳定状态：未发声、起音中、稳定、波动、信号不足；
- 最高稳定音和最低稳定音。

#### E. 练习结束报告

- 练习总时长；
- 有效发声时长；
- 稳定发声占比；
- 最高、最低稳定音；
- 最长稳定长音；
- 音高轨迹概览；
- 目标音模式下的 ±10 / ±20 / ±30 cents 时间占比；
- 本地保存最近练习摘要；
- 提供删除单次记录和清空全部记录。

#### F. PWA

- 可安装；
- 首次加载后，应用壳和必要算法资源可离线打开；
- 新版本使用显式更新提示，不得在练习中强制刷新；
- Service Worker 不缓存或拦截麦克风数据；
- 不承诺锁屏或后台持续检测。

#### G. 主题与语言

- 支持暗色 / 亮色主题显式切换，首次使用默认跟随系统偏好；
- 支持简体中文 / 英文即时切换；
- 主题和语言选择仅保存在本机，刷新和离线打开后仍然生效；
- 主题或语言切换不得重建 AudioContext、Worker 或当前练习会话。

### 3.2 明确不属于 v0.1

- 胸声、混声、头声、假声分类；
- 弱混、强混判断；
- pYIN 全段 Viterbi 精修；
- 上传歌曲或伴奏分离；
- 修音、假唱鉴定；
- 用户账号和跨设备同步；
- 云端备份；
- 社区、排行榜、订阅支付；
- 后台或锁屏录音；
- 医疗或声带健康诊断。

除非产品负责人明确修改范围，否则 Agent 不得偷偷加入以上功能。

---

## 4. 技术选型

### 4.1 基础环境

- Node.js：Active LTS，仓库首版固定为 `>=24`；
- 包管理器：pnpm 11，必须在 `package.json#packageManager` 固定精确版本；
- 单仓库应用，不在 MVP 阶段建立 monorepo；
- 使用 `pnpm-lock.yaml`，CI 必须执行 frozen lockfile 安装。

### 4.2 应用技术栈

| 层级 | 选型 | 说明 |
|---|---|---|
| UI | React + TypeScript | 组件化和后续 React Native 迁移友好 |
| 构建 | Vite | 轻量、适合纯客户端应用和 Worker 构建 |
| PWA | vite-plugin-pwa | 生成 Manifest、Service Worker 和更新流程 |
| 状态 | Zustand | 仅保存低频业务状态，不承载每个音频帧 |
| 本地数据库 | Dexie / IndexedDB | 保存设置和练习摘要 |
| 参数校验 | Zod | 校验持久化数据、导入数据和配置 |
| 代码质量 | Biome | 统一格式化、Lint 和 import 整理 |
| 单元测试 | Vitest | DSP、领域逻辑和纯函数测试 |
| 浏览器测试 | Vitest Browser Mode | 验证浏览器 API 封装和组件 |
| E2E | Playwright | 权限异常、PWA、离线和多浏览器流程 |
| 绘图 | 原生 Canvas 2D | 高频轨迹不进入 React 渲染链 |
| 主题 | CSS 变量 + 本地偏好 | 暗色 / 亮色共用语义 token，不复制组件样式 |
| 国际化 | 类型安全的本地词典 | MVP 仅中英，不引入远程翻译或重量级运行时 |

### 4.3 暂不采用

- Next.js：无 SSR 价值，增加边界和部署复杂度；
- Redux：MVP 状态规模不需要；
- ECharts / Chart.js：实时轨迹使用 Canvas 更轻；
- Tailwind：首版使用 CSS Modules 或普通 CSS 变量，减少依赖和动态类噪声；
- 音频 DSP 第三方黑盒库：YIN 核心先自行实现和测试；
- SharedArrayBuffer：首版不作为硬依赖，避免 COOP/COEP 部署门槛；
- WebAssembly：性能测试证明 TypeScript 不足后再引入。

---

## 5. 总体架构

```text
用户点击开始
   ↓
getUserMedia 获取麦克风
   ↓
AudioContext + MediaStreamAudioSourceNode
   ↓
AudioWorklet：采集、单声道化、分帧
   ↓ Float32Array，可转移
主线程转发
   ↓
Dedicated Web Worker
   ├─ DC 移除
   ├─ RMS / dBFS
   ├─ 自适应噪声门
   ├─ YIN F0 检测
   ├─ voiced/confidence
   ├─ 倍频跳变抑制
   └─ 时间平滑
   ↓ 小型 PitchFrame 消息
应用控制器
   ├─ 高频环形缓冲区 → Canvas
   ├─ 降采样状态 → Zustand / React
   └─ 会话聚合器 → IndexedDB
```

### 5.1 线程责任

#### AudioWorklet

只负责：

- 获取 PCM；
- 转为单声道；
- 累积窗口；
- 按 hop 输出帧；
- 不做 YIN；
- 不做 JSON 序列化；
- 不访问 React、DOM、IndexedDB。

#### Dedicated Worker

负责：

- 所有实时 DSP；
- 返回小型结构化结果；
- 不直接访问 UI；
- 不持久化数据；
- 不依赖浏览器布局或 React。

#### 主线程

负责：

- 权限和 AudioContext 生命周期；
- 转发可转移缓冲；
- UI 和用户操作；
- Canvas 调度；
- 会话聚合和持久化；
- 错误提示。

### 5.2 音频图连接

为了避免麦克风回放和反馈：

```text
MediaStreamSource
  → AudioWorkletNode
  → GainNode(gain = 0)
  → AudioContext.destination
```

不得把未经静音的麦克风信号接入扬声器。

---

## 6. 建议目录结构

```text
pitchy/
├─ AGENTS.md
├─ README.md
├─ package.json
├─ pnpm-lock.yaml
├─ vite.config.ts
├─ vitest.config.ts
├─ playwright.config.ts
├─ biome.json
├─ tsconfig.json
├─ public/
│  ├─ icons/
│  └─ samples/                # 仅允许自生成或明确可用测试音
├─ src/
│  ├─ app/
│  │  ├─ App.tsx
│  │  ├─ routes.tsx
│  │  ├─ app-state.ts
│  │  ├─ i18n.ts
│  │  └─ preferences.tsx
│  ├─ audio/
│  │  ├─ audio-engine.ts      # AudioContext 生命周期
│  │  ├─ media-devices.ts
│  │  ├─ audio-types.ts
│  │  ├─ worklets/
│  │  │  └─ pcm-capture.worklet.ts
│  │  └─ workers/
│  │     ├─ pitch.worker.ts
│  │     └─ worker-protocol.ts
│  ├─ dsp/
│  │  ├─ yin.ts
│  │  ├─ rms.ts
│  │  ├─ noise-gate.ts
│  │  ├─ smoothing.ts
│  │  ├─ octave-guard.ts
│  │  ├─ ring-buffer.ts
│  │  └─ dsp-config.ts
│  ├─ domain/
│  │  ├─ pitch.ts
│  │  ├─ notes.ts
│  │  ├─ tuning.ts
│  │  ├─ stability.ts
│  │  ├─ session.ts
│  │  └─ session-aggregator.ts
│  ├─ db/
│  │  ├─ database.ts
│  │  ├─ schema.ts
│  │  └─ repositories.ts
│  ├─ features/
│  │  ├─ practice/
│  │  ├─ summary/
│  │  ├─ history/
│  │  └─ settings/
│  ├─ components/
│  │  ├─ PitchReadout.tsx
│  │  ├─ CentsGauge.tsx
│  │  ├─ PitchCanvas.tsx
│  │  ├─ LevelMeter.tsx
│  │  └─ StatusBanner.tsx
│  ├─ styles/
│  │  ├─ tokens.css
│  │  └─ global.css
│  ├─ test/
│  │  ├─ signal-generators.ts
│  │  ├─ fixtures.ts
│  │  └─ assertions.ts
│  └─ main.tsx
└─ tests/
   ├─ e2e/
   └─ browser/
```

### 6.1 模块边界

- `dsp/` 必须是无 DOM、无 React、无 IndexedDB 的纯 TypeScript；
- `domain/` 不得依赖 React；
- `components/` 不得直接操作 AudioContext；
- `audio/` 不得持久化业务数据；
- `db/` 不得引用音频线程代码；
- 不允许跨层循环依赖。

---

## 7. 核心数据协议

### 7.1 音频引擎状态

```ts
export type AudioEngineStatus =
  | "idle"
  | "requesting-permission"
  | "starting"
  | "running"
  | "suspended"
  | "stopping"
  | "error";
```

### 7.2 YIN 配置

```ts
export interface YinConfig {
  minFrequencyHz: number;
  maxFrequencyHz: number;
  threshold: number;
  frameSize: number;
  hopSize: number;
  minRmsDbfs: number;
}
```

初始建议值：

```ts
export const DEFAULT_YIN_CONFIG: YinConfig = {
  minFrequencyHz: 65,
  maxFrequencyHz: 1200,
  threshold: 0.12,
  frameSize: 4096,
  hopSize: 2048,
  minRmsDbfs: -55,
};
```

这些值是可调参数，不是永恒真理。任何修改必须附带基准测试结果。

### 7.3 Worker 输出

```ts
export interface RawPitchEstimate {
  timestampMs: number;
  frequencyHz: number | null;
  confidence: number;
  rmsDbfs: number;
  voiced: boolean;
}

export interface PitchFrame extends RawPitchEstimate {
  midi: number | null;
  noteName: string | null;
  centsFromNearest: number | null;
  centsFromTarget: number | null;
  stabilityScore: number | null;
  state: "silent" | "onset" | "stable" | "unstable" | "low-confidence";
}
```

### 7.4 练习摘要

```ts
export interface PracticeSessionSummary {
  id: string;
  startedAt: string;
  endedAt: string;
  mode: "free" | "target";
  targetMidi: number | null;
  tuningA4Hz: number;
  durationMs: number;
  voicedDurationMs: number;
  stableDurationMs: number;
  longestStableDurationMs: number;
  minStableMidi: number | null;
  maxStableMidi: number | null;
  medianStabilityScore: number | null;
  within10CentsRatio: number | null;
  within20CentsRatio: number | null;
  within30CentsRatio: number | null;
  inputDeviceLabel: string | null;
  actualSampleRate: number;
  schemaVersion: 1;
}
```

音准比例仅在 `mode === "target"` 时有意义，否则必须为 `null`。

---

## 8. 音高算法规范

### 8.1 YIN 实现步骤

`estimatePitchYin()` 必须按可测试的阶段实现：

1. 校验帧长和采样率；
2. 去除直流偏置；
3. 计算 RMS / dBFS；
4. 低于噪声门时直接返回 unvoiced；
5. 计算差分函数；
6. 计算累积均值归一化差分；
7. 在合法 tau 范围内寻找第一个低于阈值的局部谷值；
8. 进行抛物线插值；
9. 转换为 `frequencyHz = sampleRate / refinedTau`；
10. 根据谷值深度生成 `[0, 1]` 置信度；
11. 对非法值、NaN、Infinity 和越界结果返回 unvoiced。

推荐函数签名：

```ts
export function estimatePitchYin(
  frame: Float32Array,
  sampleRate: number,
  config: YinConfig,
): RawPitchEstimate;
```

### 8.2 音名换算

```ts
midi = 69 + 12 * log2(frequencyHz / tuningA4Hz)
nearestMidi = round(midi)
cents = 100 * (midi - nearestMidi)
```

- 必须支持 A4 基准频率 415–466 Hz；
- 音名内部统一使用 MIDI number；
- 显示层可选择升号或降号，内部不得混用字符串作为主键；
- 不得通过硬编码频率表计算 cents。

### 8.3 voiced 判定

voiced 不是只看 RMS。初始规则需同时满足：

- RMS 高于自适应或最低噪声门；
- YIN 找到合法候选；
- confidence 高于最低阈值；
- 频率位于配置范围内。

必须保留独立的：

- `rmsDbfs`；
- `confidence`；
- `voiced`。

UI 不得把低音量和低置信度混为一谈。

### 8.4 时间平滑

使用有限状态和稳健统计，不使用简单的无限指数平滑掩盖真实变化。

建议：

- 最近 5 个有效 MIDI 值做中值滤波；
- 沉默后第一个有效帧标记为 onset；
- 超过 7 个半音的瞬时跳变，至少连续 2–3 帧后才接受；
- 发生沉默边界后允许立即接受大跳；
- 不对用户真实滑音强行量化到固定半音；
- React 显示值更新约 15–30 Hz；
- Canvas 轨迹可保持更高内部采样率。

所有“2–3 帧”“7 个半音”等常量集中存放在 `dsp-config.ts`。

### 8.5 稳定度

稳定度基于最近约 1 秒有效音高帧计算，优先使用 cents 域的中位绝对偏差（MAD），避免少量异常值破坏结果。

不得仅以相邻帧变化量判断稳定度，因为自然颤音和缓慢漂移需要分别呈现。

初版输出：

- `stabilityScore: 0–100`；
- `pitchSpreadCents`；
- `trendCentsPerSecond`；
- `validFrameRatio`。

评分函数必须：

- 单调；
- 有边界；
- 参数集中配置；
- 使用合成信号测试；
- 在 UI 中称为“稳定度”，不称为“唱功”。

---

## 9. 麦克风和 Web Audio 规范

### 9.1 获取输入

优先请求：

```ts
const constraints: MediaStreamConstraints = {
  audio: {
    channelCount: { ideal: 1 },
    echoCancellation: { ideal: false },
    noiseSuppression: { ideal: false },
    autoGainControl: { ideal: false },
    sampleRate: { ideal: 48_000 },
  },
};
```

注意：浏览器和设备可以忽略这些约束。必须读取并记录实际 `MediaTrackSettings` 和 `AudioContext.sampleRate`。

### 9.2 生命周期

- AudioContext 只能在用户手势后创建或恢复；
- 停止练习时必须停止 MediaStreamTrack；
- 切换设备前先关闭旧轨道；
- 页面进入隐藏状态时，显示暂停提示并记录状态；
- 页面恢复后不得假定 AudioContext 仍为 running；
- 组件卸载必须释放 Worklet、Worker、MediaStream 和事件监听。

### 9.3 Worklet 构建

优先模式：

```ts
import workletUrl from "./worklets/pcm-capture.worklet.ts?worker&url";
await audioContext.audioWorklet.addModule(workletUrl);
```

必须用生产构建集成测试确认最终产物是可加载的 JavaScript。若当前 Vite 版本行为变化，允许改为独立 Rollup input，但仍需保留 TypeScript 源码；不得把未编译 TypeScript 直接放进 `public/`。

---

## 10. UI / UX 规划

### 10.1 页面状态

#### 欢迎页

- 产品一句话说明；
- “开始练声”主按钮；
- 本地隐私说明；
- 浏览器不支持时显示明确原因。

#### 实时练声页

优先级从高到低：

1. 当前音名；
2. cents 指针；
3. Hz 和置信度；
4. 最近音高曲线；
5. 输入电平；
6. 稳定度和连续时长；
7. 模式和目标音；
8. 停止按钮。

#### 总结页

- 只展示本次真正计算出的指标；
- 空值显示“数据不足”，不得自动填 0；
- 支持保存摘要、删除摘要、返回练习。

### 10.2 视觉原则

- 核心读数在手机单手范围内；
- 必须提供暗色 / 亮色显式切换；首次可跟随系统主题，用户选择后以用户偏好为准；
- 两套主题必须共用语义化 CSS token，并分别满足 WCAG 对比要求；
- cents 指针不应剧烈闪烁，使用显示层插值但不篡改原始数据；
- 高置信度和低置信度通过透明度/状态文字区分，不能只靠颜色；
- 色彩符合 WCAG 对比要求；
- 所有关键状态同时有文本和图形表达；
- Canvas 必须适配 devicePixelRatio，避免模糊。

### 10.3 国际化原则

- MVP 支持 `zh-CN` 与 `en`，默认根据浏览器语言选择，无法识别时回退到简体中文；
- 所有按钮、状态、错误、指标说明、PWA 更新提示和无障碍名称必须纳入词典；
- 音名、Hz、cents、dBFS 等领域值保持统一内部表示，仅在显示层格式化；
- 切换语言只更新低频 UI 状态，不得进入音频帧、DSP 或 Canvas 高频数据链；
- 新增用户可见文案时必须同步补齐中英文并增加缺失键测试。

### 10.4 高频绘制规则

- 音高轨迹使用 Canvas 命令式绘制；
- 不把每个音频帧写入 React state；
- React 只订阅经节流的当前读数和会话状态；
- Canvas 数据保存在固定容量环形缓冲区；
- 页面不可见时暂停绘制，但按实际浏览器能力处理音频状态。

---

## 11. 本地数据设计

### 11.1 数据库表

```text
settings
  key
  value
  updatedAt

sessions
  id
  startedAt
  endedAt
  mode
  summary
  schemaVersion
```

MVP 不保存逐帧完整轨迹到数据库；总结页所需的缩略轨迹可进行时间降采样后存储，建议不超过 300 个点。

`settings` 至少包含主题和语言偏好。M0 可先使用带命名空间的 `localStorage` 保存这两项非敏感 UI 偏好；M4 建立 Dexie 后必须迁移到统一设置仓库并保持向后兼容。

### 11.2 数据迁移

- 每条数据必须有 `schemaVersion`；
- 数据库版本升级必须包含迁移；
- Zod 校验失败的旧数据不得导致应用崩溃；
- 无法迁移的数据应跳过并给出可清理提示。

### 11.3 本地导出

v0.1 可选提供 JSON 导出，但必须：

- 不包含原始音频；
- 带 schemaVersion；
- 导入时严格校验；
- 不执行导入文件中的任何代码或 URL。

---

## 12. PWA 和离线策略

### 12.1 缓存范围

预缓存：

- HTML；
- 编译后的 JS / CSS；
- Manifest；
- 本地图标；
- 必要的静态字体或使用系统字体。

不得预缓存：

- 用户录音；
- IndexedDB 数据；
- 动态生成的导出文件；
- 未经审查的大型测试音频。

### 12.2 更新策略

- 使用显式“有新版本可用”提示；
- 练声进行中不得自动 reload；
- 用户确认后再激活并刷新；
- 新旧数据库 schema 必须兼容更新过程。

### 12.3 离线验收

首次在线加载并完成 Service Worker 安装后：

- 关闭网络仍能打开应用；
- 能进入练声页；
- 能请求本地麦克风；
- 能完成音高分析；
- 能保存本地摘要；
- 不出现因网络失败导致的阻塞错误。

---

## 13. 性能预算

### 13.1 目标

- 输入到主要读数可见的中位延迟：`< 120 ms`；
- P95 延迟：`< 180 ms`；
- 练声时主线程长任务：单次 `< 50 ms`；
- Canvas 平均绘制：目标 30–60 FPS；
- 内存持续运行 20 分钟无明显单调增长；
- DSP Worker 不得造成页面交互明显卡顿；
- 首屏生产压缩资源尽量 `< 500 KB`，不包含 PWA 图标。

这些是 MVP 工程目标，不是对所有设备的绝对承诺。

### 13.2 基准设备

至少覆盖：

- 近三年常见 Windows Chromium 笔记本；
- 近三年主流 Android Chrome；
- 近三年 iPhone Safari / 安装后的 PWA；
- macOS Safari；
- Firefox 作为尽力支持。

通过特性检测而不是 User-Agent 分支实现兼容性。

---

## 14. 测试策略

### 14.1 DSP 单元测试

必须使用确定性合成信号：

- 纯正弦：A2、A3、A4、A5；
- 多谐波人声近似信号；
- 加性白噪声；
- 低音量信号；
- 无声；
- 线性滑音；
- 自然颤音近似；
- 突然八度跳变；
- 直流偏置；
- 44.1 kHz 和 48 kHz。

核心验收：

- 稳态纯音中位误差不超过 ±5 cents；
- A2–A5 范围不得系统性偏差；
- 无声不得产生有效音高；
- 低置信度噪声不得显示稳定音名；
- 连续纯音的错误八度率低于 1%；
- 函数不得返回 NaN / Infinity。

### 14.2 领域逻辑测试

覆盖：

- Hz ↔ MIDI ↔ note name；
- A4 基准频率变更；
- cents 边界；
- 目标音统计；
- 稳定区间聚合；
- 练习暂停和恢复；
- 数据迁移；
- 空数据总结。

### 14.3 浏览器测试

- AudioWorklet 模块能在生产构建加载；
- Worker 消息协议正确；
- Canvas 组件在不同 DPR 正确缩放；
- 权限拒绝有可恢复提示；
- 设备切换释放旧轨道；
- AudioContext suspended 后可由用户手势恢复。
- 暗色 / 亮色切换会更新语义 token、`color-scheme` 和本地偏好；
- 中英切换会更新页面文案、`html[lang]` 和无障碍名称，且不刷新页面。

### 14.4 E2E

真实 CI 很难稳定提供麦克风，因此：

- 抽象 `AudioInputSource`；
- 生产实现使用麦克风；
- E2E 使用合成 PCM 流；
- 不在测试中绕过 DSP 核心；
- 额外保留人工真机麦克风检查清单。

E2E 必测：

- 首次进入；
- 开始/停止练习；
- 自由模式；
- 目标音模式；
- 保存和删除历史；
- 离线打开；
- PWA 更新提示；
- 主题与语言切换及刷新后的偏好恢复；
- 网络请求审计。

### 14.5 本地隐私测试

Playwright 记录所有网络请求：

- 除同源静态资源和浏览器必要请求外，不允许访问第三方域名；
- 练声开始、持续和结束时都不得上传 PCM、Blob、频率轨迹或摘要；
- 发现跨域请求时 CI 失败。

---

## 15. 开发里程碑

### M0 — 仓库和工程骨架（1 天）

交付：

- Vite + React + TypeScript；
- pnpm 版本固定；
- Biome；
- Vitest、Playwright；
- PWA Manifest；
- 基础 CI；
- 响应式页面骨架；
- 暗色 / 亮色主题切换；
- 简体中文 / 英文切换。

验收：`pnpm check && pnpm test && pnpm build` 全部通过。

### M1 — 麦克风和音频线程（1–2 天）

交付：

- 权限流程；
- 设备列表；
- AudioContext 生命周期；
- AudioWorklet 分帧；
- Worker 通信；
- RMS 电平。

验收：可持续运行 20 分钟，无回声、无明显泄漏、可正确停止轨道。

### M2 — YIN 音高引擎（2–3 天）

交付：

- YIN；
- 置信度；
- voiced 判定；
- note/cents 转换；
- 中值平滑；
- 倍频保护；
- 合成信号测试和基准。

验收：满足 DSP 单元测试指标。

### M3 — 实时练声界面（2–3 天）

交付：

- 当前音名、Hz、cents；
- Canvas 音高轨迹；
- 电平；
- 稳定度；
- 自由/目标音模式；
- 响应式移动端布局。

验收：主要读数延迟达到预算，页面交互无明显卡顿。

### M4 — 会话总结和本地数据（1–2 天）

交付：

- 会话聚合；
- 总结页；
- Dexie；
- 历史记录；
- 删除和清空；
- schema 校验。

验收：刷新和离线后历史可读，异常数据不致崩溃。

### M5 — PWA、兼容性和发布（2–3 天）

交付：

- 离线壳；
- 更新提示；
- Chrome / Safari / Edge 真机测试；
- 错误状态；
- 性能报告；
- 隐私审计；
- README 使用说明。

验收：满足 Definition of Done。

### 预计总量

- 由熟悉 TypeScript/Web Audio 的单人开发：约 10–14 个有效开发日；
- 借助 Coding Agent：编码速度可提升，但音频调试、真机测试和参数标定不可省略；
- 建议按 3 周完成可公开体验版本，第 4 周仅做测试和校准。

---

## 16. MVP Backlog

按顺序执行，不得跨越核心依赖：

- `VT-001` 初始化工程、质量脚本、主题与国际化骨架；
- `VT-002` 建立浏览器能力检测；
- `VT-003` 麦克风权限和错误模型；
- `VT-004` AudioContext 生命周期；
- `VT-005` AudioWorklet PCM 分帧；
- `VT-006` Worker 协议和可转移缓冲；
- `VT-007` RMS / dBFS；
- `VT-008` YIN 差分函数；
- `VT-009` CMND 和候选搜索；
- `VT-010` 抛物线插值和置信度；
- `VT-011` Hz/MIDI/note/cents；
- `VT-012` voiced 和噪声门；
- `VT-013` 时间中值滤波；
- `VT-014` 倍频跳变保护；
- `VT-015` Canvas 轨迹；
- `VT-016` 实时主读数；
- `VT-017` 稳定度和长音状态机；
- `VT-018` 自由模式；
- `VT-019` 目标音模式；
- `VT-020` 会话聚合；
- `VT-021` 本地数据库；
- `VT-022` 总结和历史；
- `VT-023` PWA 离线；
- `VT-024` 更新提示；
- `VT-025` 多浏览器和真机 QA；
- `VT-026` 性能与隐私审计。

---

## 17. 后续路线图

### v0.2 — 精细练声报告

- 音符稳定平台分段；
- 起音、稳定区和收音区分离；
- 颤音频率和幅度；
- 音高趋势；
- 结束后使用 TypeScript 实现短序列概率平滑或 pYIN 研究原型；
- 逐帧数据仍默认不持久化。

### v0.3 — 实验性音色特征

传统 DSP 特征：

- H1–H2 近似；
- 频谱斜率；
- 高频能量比例；
- 谐波丰富度；
- HNR / CPP 的可行近似；
- 输入音量和音高耦合。

输出仅使用连续维度：

- 气声倾向；
- 闭合倾向；
- 亮度；
- 厚度；
- 周期稳定性。

### v0.4 — 个人校准的发声状态倾向

- 用户录制明显胸声和明显假声参考；
- 计算个人基线向量；
- 用标准化距离和人工规则显示：
  - 胸声主导倾向；
  - 中间/混合倾向；
  - 假声主导倾向；
- 默认标注“实验性”；
- 不直接显示弱混/强混，除非经过独立数据验证。

即使进入 v0.4，也不得自动引入机器学习。任何 ML 提案必须单独立项和重新评审隐私、体积、性能与解释性。

---

## 18. 风险清单与处理

### 浏览器自动增益无法关闭

- 请求关闭，但读取实际设置；
- UI 提示“设备可能启用自动处理”；
- 不把 dBFS 当作真实声压级 SPL；
- 稳定度尽量依赖音高而不是绝对音量。

### iOS / Safari 音频上下文暂停

- 所有 start/resume 由用户手势触发；
- 监听 `statechange`；
- 页面恢复后显示恢复按钮；
- 不承诺后台持续分析。

### 八度误判

- YIN 阈值调优；
- 时间连续性保护；
- 低置信度不显示确定音名；
- 使用合成多谐波和真人样本持续回归。

### 设备采样率不同

- 永远使用实际 sampleRate；
- 测试 44.1 kHz 和 48 kHz；
- 不在算法内部假设固定采样率。

### 主线程卡顿

- DSP 放 Worker；
- Canvas 命令式绘制；
- 高频数据不进入 React state；
- 通过 PerformanceObserver 和手工 profile 验证。

### Service Worker 缓存旧版本

- 显式更新提示；
- 版本化 schema；
- E2E 覆盖更新路径；
- 不在练声进行中自动刷新。

---

## 19. 代码规范

### TypeScript

- `strict: true`；
- 禁止无理由使用 `any`；
- 跨线程、持久化和用户输入边界必须运行时校验；
- 使用 discriminated union 表达状态；
- 所有 public 函数必须有明确输入输出类型；
- DSP 函数不得静默修改输入数组，除非函数名和注释明确说明；
- 重要算法常量必须集中配置并解释单位。

### React

- 组件只处理展示和用户交互；
- AudioContext 不得放在 React state；
- 高频采样数据使用 ref、外部缓冲或订阅；
- 避免为微小计算滥用 `useMemo`；
- 所有 effect 必须有完整清理函数；
- 不允许在 render 中启动权限请求、Worker 或音频节点。
- 用户可见文案不得直接硬编码在组件中，必须通过类型安全的本地词典读取；
- 主题和语言属于低频 UI 偏好，不得写入逐帧音频状态或触发音频引擎重建。

### 错误处理

错误必须归类：

```ts
export type AppErrorCode =
  | "unsupported-browser"
  | "permission-denied"
  | "permission-dismissed"
  | "device-not-found"
  | "device-disconnected"
  | "audio-context-failed"
  | "worklet-load-failed"
  | "worker-failed"
  | "storage-failed"
  | "unknown";
```

- UI 显示可执行的下一步；
- 控制台可以保留技术细节，但不得记录 PCM；
- 不得吞掉 Promise rejection。

### 注释

- 解释“为什么”，不重复代码；
- DSP 公式必须标单位和来源；
- 临时阈值标记为 `CALIBRATION_REQUIRED`，并附测试依据；
- 不允许无 issue 编号的长期 TODO。

---

## 20. Agent 工作协议

任何 Coding Agent 必须遵守：

1. 开始任务前阅读本文件和相关测试。
2. 先说明将修改的模块和验收方式，再开始大范围改动。
3. 一次任务只解决一个清晰问题，避免顺手重构无关代码。
4. 新增依赖前必须说明：用途、体积、替代方案、是否影响本地隐私。
5. 修改 DSP 时必须新增或更新确定性测试和 benchmark。
6. 修改 Worker 协议时必须同步更新两端类型和协议测试。
7. 修改数据库 schema 时必须提供迁移。
8. 修改 PWA 缓存时必须测试离线和更新路径。
9. 不得伪造真机测试结果；未测试的平台必须明确标注。
10. 不得把“编译通过”当作音频功能正确。
11. 不得删除失败测试来让 CI 通过。
12. 不得将原始音频、真实用户录音或隐私数据提交仓库。
13. 完成前运行：

```bash
pnpm check
pnpm typecheck
pnpm test
pnpm test:browser
pnpm build
pnpm test:e2e
```

若环境无法运行某项，最终说明中必须如实列出。

### 20.1 变更说明模板

```text
目标：

修改：
- 文件/模块

算法或行为变化：

测试：
- 已运行
- 未运行及原因

性能与隐私影响：

剩余风险：
```

---

## 21. Definition of Done

v0.1 只有同时满足以下条件才算完成：

- 核心功能在支持的桌面和移动浏览器可用；
- 用户能完成“开始 → 实时练声 → 停止 → 查看总结”；
- 稳态合成音检测达到测试指标；
- 无声和噪声不会持续显示虚假稳定音高；
- 主要读数延迟达到性能预算或明确记录差距；
- 20 分钟运行无明显资源泄漏；
- 麦克风轨道可正确关闭；
- 离线模式可工作；
- PWA 更新不打断练声；
- 本地数据可删除；
- 暗色 / 亮色主题和中英语言可切换，刷新与离线打开后偏好仍生效；
- 没有第三方跨域请求；
- 不上传原始音频或分析结果；
- 所有 CI 检查通过；
- README 说明浏览器限制、隐私边界和指标含义；
- 所有未完成能力均未被 UI 或文案夸大宣传。

---

## 22. 推荐脚本

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "check": "biome check .",
    "check:fix": "biome check --write .",
    "typecheck": "tsc -b --pretty false",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:browser": "vitest run --project browser",
    "test:e2e": "playwright test",
    "benchmark:dsp": "vitest bench src/dsp"
  }
}
```

CI 建议顺序：

```text
install --frozen-lockfile
→ check
→ typecheck
→ unit test
→ browser test
→ build
→ e2e
→ artifact size check
```

---

## 23. 首次实现顺序

首位 Agent 应严格按以下最小垂直切片推进：

1. 创建工程和质量脚本；
2. 建立 `AudioInputSource` 接口与合成输入实现；
3. 先用合成正弦波跑通 Worker → YIN → UI；
4. 再接入真实麦克风和 AudioWorklet；
5. 完成单个实时音名读数；
6. 加入 cents、置信度和电平；
7. 加入轨迹；
8. 加入稳定度；
9. 加入目标音模式；
10. 最后增加持久化和 PWA。

不要一开始同时开发麦克风、图表、数据库和 PWA。先证明核心音高引擎在可控合成信号上正确，再接真实世界输入。

---

## 24. 技术依据基线

架构以以下公开标准和官方文档为基线：

- Web Audio API、AudioWorklet、MediaDevices、Web Workers、IndexedDB：MDN / Web 标准；
- YIN：de Cheveigné 与 Kawahara 的基频估计算法论文；
- React、Vite、Vite PWA、Vitest、Playwright、Dexie、Zustand、Zod、Biome：各项目官方文档。

依赖版本会变化。升级任何主版本前，必须阅读官方迁移说明，并重新执行音频、PWA、离线和真机回归。
