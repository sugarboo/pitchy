export interface YinConfig {
  readonly minFrequencyHz: number;
  readonly maxFrequencyHz: number;
  readonly threshold: number;
  readonly frameSize: number;
  readonly hopSize: number;
  readonly minRmsDbfs: number;
}

export const DEFAULT_YIN_CONFIG: Readonly<YinConfig> = Object.freeze({
  minFrequencyHz: 65,
  maxFrequencyHz: 1200,
  threshold: 0.12,
  frameSize: 4096,
  hopSize: 2048,
  minRmsDbfs: -55,
});

export interface VoicedDecisionConfig {
  readonly minFrequencyHz: number;
  readonly maxFrequencyHz: number;
  readonly minConfidence: number;
}

/**
 * CALIBRATION_REQUIRED (VT-025): 0.9 rejects the bounded YIN fallback while
 * retaining the deterministic periodic fixtures. It has not been calibrated
 * against real voices, microphones, or rooms.
 */
export const DEFAULT_MIN_CONFIDENCE = 0.9;

export interface AdaptiveNoiseGateConfig {
  readonly marginDb: number;
  readonly riseTimeMs: number;
  readonly fallTimeMs: number;
}

/**
 * CALIBRATION_REQUIRED (VT-025): these time constants and the 6 dB margin are
 * engineering starting points covered by deterministic invariants, not claims
 * about a universal acoustic noise floor.
 */
export const DEFAULT_ADAPTIVE_NOISE_GATE_CONFIG: Readonly<AdaptiveNoiseGateConfig> = Object.freeze({
  marginDb: 6,
  riseTimeMs: 2000,
  fallTimeMs: 500,
});

export interface YinTauBounds {
  readonly minTau: number;
  readonly maxTau: number;
  readonly differenceMaxTau: number;
}

export function assertValidYinConfig(config: YinConfig): void {
  if (
    !Number.isFinite(config.minFrequencyHz) ||
    !Number.isFinite(config.maxFrequencyHz) ||
    config.minFrequencyHz <= 0 ||
    config.maxFrequencyHz <= config.minFrequencyHz
  ) {
    throw new RangeError(
      "YIN frequencies must be finite and satisfy 0 < minFrequencyHz < maxFrequencyHz",
    );
  }
  if (!Number.isFinite(config.threshold) || config.threshold <= 0 || config.threshold >= 1) {
    throw new RangeError("YIN threshold must be finite and between zero and one");
  }
  if (!Number.isSafeInteger(config.frameSize) || config.frameSize < 4) {
    throw new RangeError("YIN frameSize must be a safe integer of at least four samples");
  }
  if (
    !Number.isSafeInteger(config.hopSize) ||
    config.hopSize < 1 ||
    config.hopSize > config.frameSize
  ) {
    throw new RangeError("YIN hopSize must be a positive safe integer no larger than frameSize");
  }
  if (!Number.isFinite(config.minRmsDbfs)) {
    throw new RangeError("YIN minRmsDbfs must be finite");
  }
}

export function resolveYinTauBounds(sampleRate: number, config: YinConfig): YinTauBounds {
  assertValidYinConfig(config);
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError("sampleRate must be finite and positive");
  }
  if (config.maxFrequencyHz >= sampleRate / 2) {
    throw new RangeError("YIN maxFrequencyHz must stay below the Nyquist frequency");
  }

  const minTau = Math.ceil(sampleRate / config.maxFrequencyHz);
  const maxTau = Math.floor(sampleRate / config.minFrequencyHz);
  const differenceMaxTau = maxTau + 1;
  const availableMaxTau = Math.floor(config.frameSize / 2);

  if (
    !Number.isSafeInteger(minTau) ||
    !Number.isSafeInteger(maxTau) ||
    minTau < 2 ||
    minTau > maxTau ||
    differenceMaxTau > availableMaxTau
  ) {
    throw new RangeError(
      "YIN frameSize and sampleRate cannot represent the configured frequency range with a guard lag",
    );
  }

  return { minTau, maxTau, differenceMaxTau };
}

export function assertValidVoicedDecisionConfig(config: VoicedDecisionConfig): void {
  if (
    !Number.isFinite(config.minFrequencyHz) ||
    !Number.isFinite(config.maxFrequencyHz) ||
    config.minFrequencyHz <= 0 ||
    config.maxFrequencyHz <= config.minFrequencyHz
  ) {
    throw new RangeError(
      "voiced frequencies must be finite and satisfy 0 < minFrequencyHz < maxFrequencyHz",
    );
  }
  if (
    !Number.isFinite(config.minConfidence) ||
    config.minConfidence <= 0 ||
    config.minConfidence >= 1
  ) {
    throw new RangeError("minConfidence must be finite and between zero and one");
  }
}

export function assertValidAdaptiveNoiseGateConfig(config: AdaptiveNoiseGateConfig): void {
  if (!Number.isFinite(config.marginDb) || config.marginDb < 0) {
    throw new RangeError("noise-gate marginDb must be finite and non-negative");
  }
  if (!Number.isFinite(config.riseTimeMs) || config.riseTimeMs <= 0) {
    throw new RangeError("noise-gate riseTimeMs must be finite and positive");
  }
  if (!Number.isFinite(config.fallTimeMs) || config.fallTimeMs <= 0) {
    throw new RangeError("noise-gate fallTimeMs must be finite and positive");
  }
}
