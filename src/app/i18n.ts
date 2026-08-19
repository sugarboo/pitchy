import type { AppErrorCode } from "../audio/audio-types";
import type { BrowserCapabilityId } from "./browser-capabilities";

export type Locale = "zh-CN" | "en";
export type PitchReadoutState = "waiting" | "detected" | "silent" | "stabilizing" | "unstable";

export interface ErrorMessage {
  title: string;
  detail: string;
  action: string;
}

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
  requestingMicrophone: string;
  requestingMicrophoneDetail: string;
  startingAudio: string;
  startingAudioDetail: string;
  pausePractice: string;
  pausePracticeDetail: string;
  resumePractice: string;
  resumePracticeDetail: string;
  stopPractice: string;
  stoppingAudio: string;
  stoppingAudioDetail: string;
  audioRunning: string;
  audioRunningDetail: (sampleRate: number | null) => string;
  audioSuspended: string;
  audioSuspendedDetail: string;
  retryMicrophone: string;
  retryMicrophoneDetail: string;
  microphonePermissionNote: string;
  readoutPreviewLabel: string;
  pitchTraceLabel: string;
  liveReadout: string;
  deviceOnly: string;
  pitchStates: Record<PitchReadoutState, string>;
  centsFromNearestLabel: string;
  confidenceLabel: string;
  inputLevelLabel: string;
  notAvailable: string;
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
  stages: Record<"foundation" | "audio" | "pitch" | "practice", string>;
  stageStates: Record<"complete" | "active" | "pending", string>;
  scopeNote: string;
  medicalDisclaimer: string;
  privacyFooter: string;
  updateReady: string;
  offlineReady: string;
  updateAndReload: string;
  later: string;
  capabilityLabels: Record<BrowserCapabilityId, string>;
  errorMessages: Record<AppErrorCode, ErrorMessage>;
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
  startPracticePending: "申请权限并在本机启动音频",
  requestingMicrophone: "正在请求麦克风",
  requestingMicrophoneDetail: "请在浏览器提示中完成选择",
  startingAudio: "正在启动音频",
  startingAudioDetail: "正在创建或恢复本地 AudioContext",
  pausePractice: "暂停练声",
  pausePracticeDetail: "暂时释放音频处理资源",
  resumePractice: "恢复练声",
  resumePracticeDetail: "需要由你的点击恢复音频",
  stopPractice: "停止",
  stoppingAudio: "正在停止",
  stoppingAudioDetail: "正在关闭音频环境并释放麦克风",
  audioRunning: "本地音频环境已启动",
  audioRunningDetail: (sampleRate) =>
    sampleRate === null
      ? "实际采样率等待浏览器确认；分析完全在本机进行。"
      : `实际采样率 ${sampleRate.toLocaleString("zh-CN")} Hz；分析完全在本机进行。`,
  audioSuspended: "音频已暂停",
  audioSuspendedDetail: "麦克风轨道仍由本次练习持有；请点击恢复或停止并完全释放。",
  retryMicrophone: "重新开始",
  retryMicrophoneDetail: "解决提示的问题后再次申请权限",
  microphonePermissionNote: "麦克风权限只会由你的明确点击触发",
  readoutPreviewLabel: "实时音高读数",
  pitchTraceLabel: "最近十秒音高轨迹",
  liveReadout: "实时读数",
  deviceOnly: "仅本机",
  pitchStates: {
    waiting: "等待开始",
    detected: "已检测到稳定音高",
    silent: "等待发声",
    stabilizing: "正在确认音高变化",
    unstable: "无法稳定检测",
  },
  centsFromNearestLabel: "音中心偏差",
  confidenceLabel: "检测置信度",
  inputLevelLabel: "输入电平",
  notAvailable: "—",
  previewCaption: "YIN 音高分析、倍频保护与轨迹绘制均在本机完成",
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
    practice: "实时练声界面",
  },
  stageStates: {
    complete: "已完成",
    active: "进行中",
    pending: "待开始",
  },
  scopeNote: "音频线程、音高引擎、实时轨迹与主读数已接通；稳定度和练习模式正在按依赖顺序推进。",
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
  errorMessages: {
    "unsupported-browser": {
      title: "当前环境无法请求麦克风",
      detail: "麦克风访问需要受支持的现代浏览器和安全上下文。",
      action: "请使用最新版浏览器，并通过 HTTPS 或 localhost 打开。",
    },
    "permission-denied": {
      title: "麦克风权限已被拒绝",
      detail: "Pitchy 无法在没有麦克风权限时开始练声。",
      action: "请在浏览器的网站设置中允许麦克风，然后重试。",
    },
    "permission-dismissed": {
      title: "尚未完成麦克风授权",
      detail: "浏览器仍显示为待询问，授权提示可能被关闭或尚未完成选择。",
      action: "准备好后再次点击，并在浏览器提示中选择允许。",
    },
    "device-not-found": {
      title: "没有找到可用麦克风",
      detail: "浏览器没有检测到符合请求条件的音频输入设备。",
      action: "请连接或启用麦克风，然后重试。",
    },
    "device-disconnected": {
      title: "麦克风当前不可用",
      detail: "设备可能已断开、被系统停用，或正被其他程序独占。",
      action: "请重新连接或释放麦克风，然后重试。",
    },
    "audio-context-failed": {
      title: "无法启动音频环境",
      detail: "浏览器未能创建或恢复本地音频处理环境。",
      action: "请再次点击开始；若仍失败，请重新加载页面。",
    },
    "worklet-load-failed": {
      title: "无法加载音频处理模块",
      detail: "浏览器未能启动本地 AudioWorklet。",
      action: "请重新加载页面，或改用受支持的最新版浏览器。",
    },
    "worker-failed": {
      title: "音高处理线程已停止",
      detail: "本地分析线程未能正常运行。",
      action: "请停止本次练习并重新开始。",
    },
    "storage-failed": {
      title: "无法保存本地数据",
      detail: "浏览器拒绝或无法写入本机存储。",
      action: "请检查隐私设置和可用空间，或继续本次练习但不保存。",
    },
    unknown: {
      title: "无法访问麦克风",
      detail: "浏览器返回了未识别的错误。",
      action: "请重试；若仍失败，请重新加载页面并检查系统麦克风设置。",
    },
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
  startPracticePending: "Request access and start local audio",
  requestingMicrophone: "Requesting microphone",
  requestingMicrophoneDetail: "Complete the choice in the browser prompt",
  startingAudio: "Starting audio",
  startingAudioDetail: "Creating or resuming the local AudioContext",
  pausePractice: "Pause practice",
  pausePracticeDetail: "Temporarily release audio processing resources",
  resumePractice: "Resume practice",
  resumePracticeDetail: "Your click is required to resume audio",
  stopPractice: "Stop",
  stoppingAudio: "Stopping",
  stoppingAudioDetail: "Closing audio and releasing the microphone",
  audioRunning: "Local audio is running",
  audioRunningDetail: (sampleRate) =>
    sampleRate === null
      ? "The actual sample rate is awaiting browser confirmation; analysis stays on-device."
      : `Actual sample rate: ${sampleRate.toLocaleString("en")} Hz; analysis stays on-device.`,
  audioSuspended: "Audio is paused",
  audioSuspendedDetail:
    "This session still owns the microphone tracks; resume with a click or stop to release them fully.",
  retryMicrophone: "Start again",
  retryMicrophoneDetail: "Resolve the issue shown below, then request access again",
  microphonePermissionNote: "Microphone access will only follow an explicit click",
  readoutPreviewLabel: "Live pitch readout",
  pitchTraceLabel: "Pitch trace for the last ten seconds",
  liveReadout: "Live readout",
  deviceOnly: "On-device",
  pitchStates: {
    waiting: "Waiting to start",
    detected: "Stable pitch detected",
    silent: "Waiting for voice",
    stabilizing: "Confirming pitch change",
    unstable: "Unable to detect steadily",
  },
  centsFromNearestLabel: "Note-center deviation",
  confidenceLabel: "Detection confidence",
  inputLevelLabel: "Input level",
  notAvailable: "—",
  previewCaption: "YIN analysis, octave guarding, and trace rendering all stay on-device",
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
    practice: "Live practice interface",
  },
  stageStates: {
    complete: "Complete",
    active: "In progress",
    pending: "Not started",
  },
  scopeNote:
    "Audio threads, the pitch engine, live trace, and primary readings are connected. Stability and practice modes are next.",
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
  errorMessages: {
    "unsupported-browser": {
      title: "This environment cannot request a microphone",
      detail: "Microphone access requires a supported modern browser in a secure context.",
      action: "Use an up-to-date browser over HTTPS or localhost.",
    },
    "permission-denied": {
      title: "Microphone permission was denied",
      detail: "Pitchy cannot start practice without microphone access.",
      action: "Allow the microphone in this site's browser settings, then try again.",
    },
    "permission-dismissed": {
      title: "Microphone permission was not completed",
      detail: "The browser still reports a prompt state, so the prompt may have been closed.",
      action: "Try again when ready and choose Allow in the browser prompt.",
    },
    "device-not-found": {
      title: "No microphone was found",
      detail: "The browser could not find an audio input device matching the request.",
      action: "Connect or enable a microphone, then try again.",
    },
    "device-disconnected": {
      title: "The microphone is unavailable",
      detail: "It may be disconnected, disabled by the system, or locked by another app.",
      action: "Reconnect or release the microphone, then try again.",
    },
    "audio-context-failed": {
      title: "The audio environment could not start",
      detail: "The browser could not create or resume local audio processing.",
      action: "Click start again; reload the page if the problem continues.",
    },
    "worklet-load-failed": {
      title: "The audio processor could not load",
      detail: "The browser could not start the local AudioWorklet.",
      action: "Reload the page or use an up-to-date supported browser.",
    },
    "worker-failed": {
      title: "The pitch processing thread stopped",
      detail: "The local analysis worker could not continue.",
      action: "Stop this practice session and start again.",
    },
    "storage-failed": {
      title: "Local data could not be saved",
      detail: "The browser denied or failed to write on-device storage.",
      action: "Check privacy settings and free space, or continue without saving.",
    },
    unknown: {
      title: "The microphone could not be accessed",
      detail: "The browser returned an unrecognized error.",
      action: "Try again; if it persists, reload and check the system microphone settings.",
    },
  },
};

const MESSAGES: Record<Locale, Messages> = {
  "zh-CN": zhCn,
  en,
};

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale];
}
