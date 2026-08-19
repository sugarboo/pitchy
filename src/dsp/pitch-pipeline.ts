import { frequencyHzToMidi } from "../domain/tuning";
import { DEFAULT_YIN_CONFIG, type YinConfig } from "./dsp-config";
import {
  type AdaptiveNoiseGateState,
  advanceAdaptiveNoiseGate,
  calculateNoiseGateThreshold,
  createAdaptiveNoiseGateState,
} from "./noise-gate";
import {
  advanceOctaveJumpGuard,
  createOctaveJumpGuardState,
  type OctaveJumpGuardState,
} from "./octave-guard";
import { estimatePitchYin } from "./pitch-estimator";
import {
  advanceTemporalMedianFilter,
  createTemporalMedianFilterState,
  type TemporalMedianFilterState,
} from "./smoothing";

export interface PitchPipelineState {
  readonly noiseGate: AdaptiveNoiseGateState;
  readonly octaveGuard: OctaveJumpGuardState;
  readonly smoothing: TemporalMedianFilterState;
}

export interface PitchPipelineEstimate {
  readonly frequencyHz: number | null;
  readonly confidence: number;
  readonly rms: number;
  readonly rmsDbfs: number;
  readonly voiced: boolean;
  /** A continuous, guarded, median-filtered MIDI observation, or null while withheld. */
  readonly midi: number | null;
}

export interface PitchPipelineStep {
  readonly estimate: PitchPipelineEstimate;
  readonly state: PitchPipelineState;
}

export function createPitchPipelineState(): PitchPipelineState {
  return {
    noiseGate: createAdaptiveNoiseGateState(),
    octaveGuard: createOctaveJumpGuardState(),
    smoothing: createTemporalMedianFilterState(),
  };
}

/**
 * Advances the complete stateful pitch path owned by one Worker session.
 * Pending octave jumps deliberately emit a null MIDI observation so neither
 * Canvas nor later practice metrics treat held history as fresh evidence.
 */
export function advancePitchPipeline(
  state: PitchPipelineState,
  frame: Float32Array,
  sampleRate: number,
  config: YinConfig = DEFAULT_YIN_CONFIG,
  elapsedMs = (config.hopSize / sampleRate) * 1000,
): PitchPipelineStep {
  const thresholdDbfs = calculateNoiseGateThreshold(state.noiseGate, config.minRmsDbfs);
  const rawEstimate = estimatePitchYin(frame, sampleRate, config, {
    noiseGateDbfs: thresholdDbfs,
  });
  const noiseGateStep = advanceAdaptiveNoiseGate(
    state.noiseGate,
    {
      rmsDbfs: rawEstimate.rmsDbfs,
      periodicCandidateFound: rawEstimate.periodicCandidateFound,
    },
    elapsedMs,
    config.minRmsDbfs,
  );
  const observedMidi =
    rawEstimate.voiced && rawEstimate.frequencyHz !== null
      ? frequencyHzToMidi(rawEstimate.frequencyHz)
      : null;
  const octaveGuardStep = advanceOctaveJumpGuard(state.octaveGuard, observedMidi);
  let smoothingState = octaveGuardStep.resetSmoothing
    ? createTemporalMedianFilterState()
    : state.smoothing;
  let midi: number | null = null;

  if (octaveGuardStep.observationAccepted) {
    const smoothingStep = advanceTemporalMedianFilter(smoothingState, octaveGuardStep.guardedMidi);
    smoothingState = smoothingStep.state;
    midi = smoothingStep.smoothedMidi;
  }

  return {
    estimate: {
      frequencyHz: rawEstimate.frequencyHz,
      confidence: rawEstimate.confidence,
      rms: rawEstimate.rms,
      rmsDbfs: rawEstimate.rmsDbfs,
      voiced: rawEstimate.voiced,
      midi,
    },
    state: {
      noiseGate: noiseGateStep.state,
      octaveGuard: octaveGuardStep.state,
      smoothing: smoothingState,
    },
  };
}
