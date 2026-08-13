import {
  type AdaptiveNoiseGateConfig,
  assertValidAdaptiveNoiseGateConfig,
  DEFAULT_ADAPTIVE_NOISE_GATE_CONFIG,
} from "./dsp-config";
import { SILENCE_DBFS } from "./rms";

export interface AdaptiveNoiseGateState {
  readonly noiseFloorDbfs: number | null;
}

export interface NoiseGateObservation {
  readonly rmsDbfs: number;
  readonly periodicCandidateFound: boolean;
}

export interface NoiseGateStep {
  readonly thresholdDbfs: number;
  readonly open: boolean;
  readonly state: AdaptiveNoiseGateState;
}

const INITIAL_NOISE_GATE_STATE: Readonly<AdaptiveNoiseGateState> = Object.freeze({
  noiseFloorDbfs: null,
});

export function createAdaptiveNoiseGateState(): AdaptiveNoiseGateState {
  return { ...INITIAL_NOISE_GATE_STATE };
}

export function calculateNoiseGateThreshold(
  state: AdaptiveNoiseGateState,
  minRmsDbfs: number,
  config: AdaptiveNoiseGateConfig = DEFAULT_ADAPTIVE_NOISE_GATE_CONFIG,
): number {
  assertValidNoiseGateInputs(state, minRmsDbfs, config);
  if (state.noiseFloorDbfs === null) {
    return minRmsDbfs;
  }

  const adaptiveThreshold = state.noiseFloorDbfs + config.marginDb;
  if (!Number.isFinite(adaptiveThreshold)) {
    throw new RangeError("adaptive noise-gate threshold must remain finite");
  }

  return Math.max(minRmsDbfs, adaptiveThreshold);
}

/** A signal must be strictly above the gate; equality remains unvoiced. */
export function isAboveNoiseGate(rmsDbfs: number, thresholdDbfs: number): boolean {
  return Number.isFinite(rmsDbfs) && Number.isFinite(thresholdDbfs) && rmsDbfs > thresholdDbfs;
}

/**
 * Advances the adaptive floor without consulting wall-clock time. The current
 * frame is classified with the previous floor, so learning cannot retroactively
 * change that frame's gate result.
 */
export function advanceAdaptiveNoiseGate(
  state: AdaptiveNoiseGateState,
  observation: NoiseGateObservation,
  elapsedMs: number,
  minRmsDbfs: number,
  config: AdaptiveNoiseGateConfig = DEFAULT_ADAPTIVE_NOISE_GATE_CONFIG,
): NoiseGateStep {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    throw new RangeError("noise-gate elapsedMs must be finite and positive");
  }

  const thresholdDbfs = calculateNoiseGateThreshold(state, minRmsDbfs, config);
  const open = isAboveNoiseGate(observation.rmsDbfs, thresholdDbfs);
  const baselineNoiseFloorDbfs = minRmsDbfs - config.marginDb;
  if (!Number.isFinite(baselineNoiseFloorDbfs)) {
    throw new RangeError("noise-gate baseline floor must remain finite");
  }

  if (!Number.isFinite(observation.rmsDbfs)) {
    return { thresholdDbfs, open, state: { ...state } };
  }

  if (observation.rmsDbfs <= SILENCE_DBFS && state.noiseFloorDbfs === null) {
    return { thresholdDbfs, open, state: { ...state } };
  }

  // Silence is a transport sentinel rather than a measured floor. A periodic
  // candidate below an elevated gate is also recovery evidence: without this
  // leak, the learned floor could permanently classify a quieter tone as noise.
  const targetNoiseFloorDbfs =
    observation.rmsDbfs <= SILENCE_DBFS || observation.periodicCandidateFound
      ? baselineNoiseFloorDbfs
      : observation.rmsDbfs;
  const currentNoiseFloorDbfs = state.noiseFloorDbfs ?? baselineNoiseFloorDbfs;

  if (observation.periodicCandidateFound && open) {
    return { thresholdDbfs, open, state: { ...state } };
  }
  const timeConstantMs =
    targetNoiseFloorDbfs > currentNoiseFloorDbfs ? config.riseTimeMs : config.fallTimeMs;
  const weight = -Math.expm1(-elapsedMs / timeConstantMs);
  const nextNoiseFloorDbfs =
    currentNoiseFloorDbfs + weight * (targetNoiseFloorDbfs - currentNoiseFloorDbfs);

  if (!Number.isFinite(nextNoiseFloorDbfs)) {
    throw new RangeError("adaptive noise floor must remain finite");
  }

  return {
    thresholdDbfs,
    open,
    state: { noiseFloorDbfs: nextNoiseFloorDbfs },
  };
}

function assertValidNoiseGateInputs(
  state: AdaptiveNoiseGateState,
  minRmsDbfs: number,
  config: AdaptiveNoiseGateConfig,
): void {
  assertValidAdaptiveNoiseGateConfig(config);
  if (!Number.isFinite(minRmsDbfs)) {
    throw new RangeError("noise-gate minRmsDbfs must be finite");
  }
  if (state.noiseFloorDbfs !== null && !Number.isFinite(state.noiseFloorDbfs)) {
    throw new RangeError("noiseFloorDbfs must be null or finite");
  }
}
