import type { BrowserCapabilityId } from "./browser-capabilities";

export type Locale = "zh-CN" | "en";

export interface Messages {
  documentTitle: string;
  documentDescription: string;
  brandHomeLabel: string;
  preferenceControlsLabel: string;
  lightTheme: string;
  darkTheme: string;
  switchToLightTheme: string;
  switchToDarkTheme: string;
  switchToEnglish: string;
  switchToChinese: string;
  heroEyebrow: string;
  heroTitle: string;
  heroDescription: string;
  startPractice: string;
  startPracticePending: string;
  microphonePermissionNote: string;
  readoutPreviewLabel: string;
  liveReadout: string;
  deviceOnly: string;
  previewCaption: string;
  foundationStatusLabel: string;
  runtimeEyebrow: string;
  capabilityHeading: string;
  coreAvailable: string;
  capabilityLimited: string;
  supported: string;
  unsupported: string;
  missingCapabilities: (labels: string) => string;
  progressEyebrow: string;
  sliceHeading: string;
  stages: Record<"foundation" | "audio" | "pitch", string>;
  stageStates: Record<"active" | "pending", string>;
  scopeNote: string;
  medicalDisclaimer: string;
  privacyFooter: string;
  updateReady: string;
  offlineReady: string;
  updateAndReload: string;
  later: string;
  capabilityLabels: Record<BrowserCapabilityId, string>;
}

const zhCn: Messages = {
  documentTitle: "Pitchy · 实时练声",
  documentDescription: "Pitchy 是一款隐私优先、完全本地运行的实时练声 PWA。",
  brandHomeLabel: "Pitchy 首页",
  preferenceControlsLabel: "界面偏好",
  lightTheme: "亮色",
  darkTheme: "暗色",
  switchToLightTheme: "切换到亮色主题",
  switchToDarkTheme: "切换到暗色主题",
  switchToEnglish: "切换到英文",
  switchToChinese: "切换到简体中文",
  heroEyebrow: "实时练声 · 本地 DSP · 隐私优先",
  heroTitle: "听见每一次发声的变化",
  heroDescription:
    "Pitchy 将在浏览器本地分析音高、音分偏差、输入电平和长音稳定度。原始音频默认不保存，也不上传。",
  startPractice: "开始练声",
  startPracticePending: "将在 M1 接入音频链路",
  microphonePermissionNote: "麦克风权限只会由你的明确点击触发",
  readoutPreviewLabel: "实时读数界面预览",
  liveReadout: "实时读数",
  deviceOnly: "仅本机",
  previewCaption: "界面预览 · 尚未读取麦克风",
  foundationStatusLabel: "第一阶段状态",
  runtimeEyebrow: "运行环境",
  capabilityHeading: "浏览器能力检测",
  coreAvailable: "核心能力可用",
  capabilityLimited: "能力受限",
  supported: "可用",
  unsupported: "不可用",
  missingCapabilities: (labels) =>
    `当前缺少：${labels}。请使用最新版浏览器并通过 HTTPS 或 localhost 打开。`,
  progressEyebrow: "开发进度",
  sliceHeading: "最小垂直切片",
  stages: {
    foundation: "工程骨架",
    audio: "音频线程",
    pitch: "YIN 音高引擎",
  },
  stageStates: {
    active: "进行中",
    pending: "待开始",
  },
  scopeNote: "当前只交付工程与界面骨架。音高读数、练习报告和历史记录会按依赖顺序逐步接入。",
  medicalDisclaimer: "不用于医疗诊断，也不能替代声乐老师或专业检查。",
  privacyFooter: "默认无第三方分析、广告或云端音频处理。",
  updateReady: "新版本已准备好，确认后再刷新。",
  offlineReady: "应用已可离线打开。",
  updateAndReload: "更新并刷新",
  later: "稍后",
  capabilityLabels: {
    "secure-context": "安全上下文",
    microphone: "麦克风输入",
    "web-audio": "Web Audio",
    "audio-worklet": "AudioWorklet",
    "web-worker": "Web Worker",
    "indexed-db": "本地数据存储",
    "service-worker": "离线应用能力",
  },
};

const en: Messages = {
  documentTitle: "Pitchy · Live vocal practice",
  documentDescription: "Pitchy is a privacy-first vocal practice PWA that runs entirely on-device.",
  brandHomeLabel: "Pitchy home",
  preferenceControlsLabel: "Display preferences",
  lightTheme: "Light",
  darkTheme: "Dark",
  switchToLightTheme: "Switch to light theme",
  switchToDarkTheme: "Switch to dark theme",
  switchToEnglish: "Switch to English",
  switchToChinese: "Switch to Simplified Chinese",
  heroEyebrow: "Live practice · Local DSP · Privacy first",
  heroTitle: "Hear every change in your voice",
  heroDescription:
    "Pitchy will analyze pitch, cents deviation, input level, and sustained-note stability in your browser. Raw audio is not saved or uploaded by default.",
  startPractice: "Start practicing",
  startPracticePending: "Audio pipeline arrives in M1",
  microphonePermissionNote: "Microphone access will only follow an explicit click",
  readoutPreviewLabel: "Live readout interface preview",
  liveReadout: "Live readout",
  deviceOnly: "On-device",
  previewCaption: "Interface preview · Microphone is not active",
  foundationStatusLabel: "Foundation stage status",
  runtimeEyebrow: "Runtime",
  capabilityHeading: "Browser capabilities",
  coreAvailable: "Core features available",
  capabilityLimited: "Limited support",
  supported: "Ready",
  unsupported: "Missing",
  missingCapabilities: (labels) =>
    `Missing: ${labels}. Use an up-to-date browser over HTTPS or localhost.`,
  progressEyebrow: "Development progress",
  sliceHeading: "Minimum vertical slice",
  stages: {
    foundation: "Foundation",
    audio: "Audio threads",
    pitch: "YIN pitch engine",
  },
  stageStates: {
    active: "In progress",
    pending: "Not started",
  },
  scopeNote:
    "This stage only delivers the project and interface foundation. Pitch readings, summaries, and history will follow dependency order.",
  medicalDisclaimer:
    "Not for medical diagnosis and not a substitute for a teacher or clinical exam.",
  privacyFooter: "No third-party analytics, advertising, or cloud audio processing by default.",
  updateReady: "A new version is ready. Refresh only when you confirm.",
  offlineReady: "The app is ready to open offline.",
  updateAndReload: "Update and reload",
  later: "Later",
  capabilityLabels: {
    "secure-context": "Secure context",
    microphone: "Microphone input",
    "web-audio": "Web Audio",
    "audio-worklet": "AudioWorklet",
    "web-worker": "Web Worker",
    "indexed-db": "Local data storage",
    "service-worker": "Offline app support",
  },
};

const MESSAGES: Record<Locale, Messages> = {
  "zh-CN": zhCn,
  en,
};

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale];
}
