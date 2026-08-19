import { isPracticePitchState, type PracticePitchState } from "../../domain/stability";
import { isSignalLevel } from "../../dsp/rms";

export const PITCH_WORKER_PROTOCOL_VERSION = 4;
export const PITCH_WORKER_NAME = "pitchy-pitch-worker";

export interface PitchWorkerConfig {
  sampleRate: number;
  frameSize: number;
  hopSize: number;
}

export interface ConfigurePitchWorkerMessage extends PitchWorkerConfig {
  type: "configure";
  protocolVersion: typeof PITCH_WORKER_PROTOCOL_VERSION;
}

export interface ProcessPitchFrameMessage {
  type: "process-frame";
  protocolVersion: typeof PITCH_WORKER_PROTOCOL_VERSION;
  sequence: number;
  samples: Float32Array;
}

export type PitchWorkerRequest = ConfigurePitchWorkerMessage | ProcessPitchFrameMessage;

export interface PitchWorkerReadyMessage extends PitchWorkerConfig {
  type: "worker-ready";
  protocolVersion: typeof PITCH_WORKER_PROTOCOL_VERSION;
}

export interface PitchFrameProcessedMessage {
  type: "frame-processed";
  protocolVersion: typeof PITCH_WORKER_PROTOCOL_VERSION;
  sequence: number;
  timestampMs: number;
  rms: number;
  rmsDbfs: number;
  frequencyHz: number | null;
  confidence: number;
  voiced: boolean;
  midi: number | null;
  stabilityScore: number | null;
  pitchSpreadCents: number | null;
  trendCentsPerSecond: number | null;
  validFrameRatio: number;
  continuousVoicedDurationMs: number;
  currentStableDurationMs: number;
  minStableMidi: number | null;
  maxStableMidi: number | null;
  state: PracticePitchState;
}

export type PitchWorkerResponse = PitchWorkerReadyMessage | PitchFrameProcessedMessage;

const CONFIGURE_MESSAGE_KEYS: ReadonlySet<string> = new Set([
  "type",
  "protocolVersion",
  "sampleRate",
  "frameSize",
  "hopSize",
]);
const PROCESS_FRAME_MESSAGE_KEYS: ReadonlySet<string> = new Set([
  "type",
  "protocolVersion",
  "sequence",
  "samples",
]);
const READY_MESSAGE_KEYS: ReadonlySet<string> = CONFIGURE_MESSAGE_KEYS;
const PROCESSED_MESSAGE_KEYS: ReadonlySet<string> = new Set([
  "type",
  "protocolVersion",
  "sequence",
  "timestampMs",
  "rms",
  "rmsDbfs",
  "frequencyHz",
  "confidence",
  "voiced",
  "midi",
  "stabilityScore",
  "pitchSpreadCents",
  "trendCentsPerSecond",
  "validFrameRatio",
  "continuousVoicedDurationMs",
  "currentStableDurationMs",
  "minStableMidi",
  "maxStableMidi",
  "state",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: ReadonlySet<string>): boolean {
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === expectedKeys.size && actualKeys.every((key) => expectedKeys.has(key))
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isSequence(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isSampleRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNullablePositiveFinite(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value > 0);
}

function isNullableFinite(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isUnitInterval(value: unknown): value is number {
  return isFiniteNonNegative(value) && value <= 1;
}

function isNullableBoundedScore(value: unknown): value is number | null {
  return value === null || (isFiniteNonNegative(value) && value <= 100);
}

function isFiniteSampleFrame(samples: Float32Array): boolean {
  for (const sample of samples) {
    if (!Number.isFinite(sample)) {
      return false;
    }
  }

  return true;
}

function hasCurrentProtocolVersion(value: Record<string, unknown>): boolean {
  return value.protocolVersion === PITCH_WORKER_PROTOCOL_VERSION;
}

export function isConfigurePitchWorkerMessage(
  value: unknown,
): value is ConfigurePitchWorkerMessage {
  return (
    isRecord(value) &&
    hasExactKeys(value, CONFIGURE_MESSAGE_KEYS) &&
    value.type === "configure" &&
    hasCurrentProtocolVersion(value) &&
    isSampleRate(value.sampleRate) &&
    isPositiveInteger(value.frameSize) &&
    isPositiveInteger(value.hopSize) &&
    value.hopSize <= value.frameSize
  );
}

export function isProcessPitchFrameMessage(
  value: unknown,
  expectedFrameSize: number,
): value is ProcessPitchFrameMessage {
  return (
    isRecord(value) &&
    hasExactKeys(value, PROCESS_FRAME_MESSAGE_KEYS) &&
    value.type === "process-frame" &&
    hasCurrentProtocolVersion(value) &&
    isSequence(value.sequence) &&
    value.samples instanceof Float32Array &&
    value.samples.length === expectedFrameSize &&
    isFiniteSampleFrame(value.samples)
  );
}

export function isPitchWorkerReadyMessage(value: unknown): value is PitchWorkerReadyMessage {
  return (
    isRecord(value) &&
    hasExactKeys(value, READY_MESSAGE_KEYS) &&
    value.type === "worker-ready" &&
    hasCurrentProtocolVersion(value) &&
    isSampleRate(value.sampleRate) &&
    isPositiveInteger(value.frameSize) &&
    isPositiveInteger(value.hopSize) &&
    value.hopSize <= value.frameSize
  );
}

export function isPitchFrameProcessedMessage(value: unknown): value is PitchFrameProcessedMessage {
  if (!isRecord(value)) {
    return false;
  }
  if (
    !(
      hasExactKeys(value, PROCESSED_MESSAGE_KEYS) &&
      value.type === "frame-processed" &&
      hasCurrentProtocolVersion(value) &&
      isSequence(value.sequence) &&
      isFiniteNonNegative(value.timestampMs) &&
      isSignalLevel(value) &&
      isNullablePositiveFinite(value.frequencyHz) &&
      isFiniteNonNegative(value.confidence) &&
      value.confidence <= 1 &&
      typeof value.voiced === "boolean" &&
      isNullableFinite(value.midi) &&
      isNullableBoundedScore(value.stabilityScore) &&
      (value.pitchSpreadCents === null || isFiniteNonNegative(value.pitchSpreadCents)) &&
      isNullableFinite(value.trendCentsPerSecond) &&
      isUnitInterval(value.validFrameRatio) &&
      isFiniteNonNegative(value.continuousVoicedDurationMs) &&
      isFiniteNonNegative(value.currentStableDurationMs) &&
      isNullableFinite(value.minStableMidi) &&
      isNullableFinite(value.maxStableMidi) &&
      isPracticePitchState(value.state) &&
      (value.voiced
        ? value.frequencyHz !== null
        : value.frequencyHz === null && value.midi === null) &&
      (value.midi === null || value.voiced) &&
      ((value.stabilityScore === null &&
        value.pitchSpreadCents === null &&
        value.trendCentsPerSecond === null) ||
        (value.stabilityScore !== null &&
          value.pitchSpreadCents !== null &&
          value.trendCentsPerSecond !== null)) &&
      ((value.minStableMidi === null && value.maxStableMidi === null) ||
        (value.minStableMidi !== null &&
          value.maxStableMidi !== null &&
          value.minStableMidi <= value.maxStableMidi))
    )
  ) {
    return false;
  }

  const isUnvoicedState = value.state === "silent" || value.state === "low-confidence";
  const hasClassifiedStability = value.state === "stable" || value.state === "unstable";
  return (
    value.voiced !== isUnvoicedState &&
    (!isUnvoicedState ||
      (value.continuousVoicedDurationMs === 0 &&
        value.currentStableDurationMs === 0 &&
        value.validFrameRatio === 0 &&
        value.stabilityScore === null)) &&
    (!hasClassifiedStability || (value.midi !== null && value.stabilityScore !== null)) &&
    (value.state === "stable"
      ? value.currentStableDurationMs > 0 && value.minStableMidi !== null
      : value.currentStableDurationMs === 0) &&
    value.currentStableDurationMs <= value.continuousVoicedDurationMs
  );
}

export function isPitchWorkerResponse(value: unknown): value is PitchWorkerResponse {
  return isPitchWorkerReadyMessage(value) || isPitchFrameProcessedMessage(value);
}
