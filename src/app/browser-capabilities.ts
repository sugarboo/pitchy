export type BrowserCapabilityId =
  | "secure-context"
  | "microphone"
  | "web-audio"
  | "audio-worklet"
  | "web-worker"
  | "indexed-db"
  | "service-worker";

export interface BrowserCapability {
  id: BrowserCapabilityId;
  requiredForPractice: boolean;
  supported: boolean;
}

export interface BrowserSupportSnapshot {
  capabilities: BrowserCapability[];
  canStartPractice: boolean;
  missingRequiredIds: BrowserCapabilityId[];
}

export interface BrowserCapabilityScope {
  isSecureContext?: boolean;
  navigator?: {
    mediaDevices?: {
      getUserMedia?: unknown;
    };
    serviceWorker?: unknown;
  };
  AudioContext?: unknown;
  webkitAudioContext?: unknown;
  AudioWorkletNode?: unknown;
  Worker?: unknown;
  indexedDB?: unknown;
}

interface CapabilityDefinition {
  id: BrowserCapabilityId;
  requiredForPractice: boolean;
  detect: (scope: BrowserCapabilityScope) => boolean;
}

const isFunction = (value: unknown): boolean => typeof value === "function";

const CAPABILITY_DEFINITIONS: CapabilityDefinition[] = [
  {
    id: "secure-context",
    requiredForPractice: true,
    detect: (scope) => scope.isSecureContext === true,
  },
  {
    id: "microphone",
    requiredForPractice: true,
    detect: (scope) => isFunction(scope.navigator?.mediaDevices?.getUserMedia),
  },
  {
    id: "web-audio",
    requiredForPractice: true,
    detect: (scope) => isFunction(scope.AudioContext) || isFunction(scope.webkitAudioContext),
  },
  {
    id: "audio-worklet",
    requiredForPractice: true,
    detect: (scope) => isFunction(scope.AudioWorkletNode),
  },
  {
    id: "web-worker",
    requiredForPractice: true,
    detect: (scope) => isFunction(scope.Worker),
  },
  {
    id: "indexed-db",
    requiredForPractice: false,
    detect: (scope) => scope.indexedDB !== undefined,
  },
  {
    id: "service-worker",
    requiredForPractice: false,
    detect: (scope) => scope.navigator?.serviceWorker !== undefined,
  },
];

export function detectBrowserCapabilities(
  scope: BrowserCapabilityScope = globalThis as unknown as BrowserCapabilityScope,
): BrowserSupportSnapshot {
  const capabilities = CAPABILITY_DEFINITIONS.map((definition) => ({
    id: definition.id,
    requiredForPractice: definition.requiredForPractice,
    supported: definition.detect(scope),
  }));

  const missingRequiredIds = capabilities
    .filter((capability) => capability.requiredForPractice && !capability.supported)
    .map((capability) => capability.id);

  return {
    capabilities,
    canStartPractice: missingRequiredIds.length === 0,
    missingRequiredIds,
  };
}
