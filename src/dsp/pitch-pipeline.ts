import {
  advanceStabilityWindow,
  advanceSustainedNote,
  createStabilityWindowState,
  createSustainedNoteState,
  type PracticePitchState,
  type StabilityWindowState,
  type SustainedNoteState,
} from "../domain/stability";
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
  readonly stability: StabilityWindowState;
  readonly sustainedNote: SustainedNoteState;
  readonly lastTimestampMs: number | null;
}

export interface PitchPipelineEstimate {
  readonly frequencyHz: number | null;
  readonly confidence: number;
  readonly rms: number;
  readonly rmsDbfs: number;
  readonly voiced: boolean;
  /** A continuous, guarded, median-filtered MIDI observation, or null while withheld. */
  readonly midi: number | null;
  readonly stabilityScore: number | null;
  readonly pitchSpreadCents: number | null;
  readonly trendCentsPerSecond: number | null;
  readonly validFrameRatio: number;
  readonly continuousVoicedDurationMs: number;
  readonly currentStableDurationMs: number;
  readonly minStableMidi: number | null;
  readonly maxStableMidi: number | null;
  readonly state: PracticePitchState;
}

export interface PitchPipelineStep {
  readonly estimate: PitchPipelineEstimate;
  readonly state: PitchPipelineState;
}

export interface PitchPipelineTiming {
  readonly elapsedMs: number;
  readonly timestampMs: number;
}

export function createPitchPipelineState(): PitchPipelineState {
  return {
    noiseGate: createAdaptiveNoiseGateState(),
    octaveGuard: createOctaveJumpGuardState(),
    smoothing: createTemporalMedianFilterState(),
    stability: createStabilityWindowState(),
    sustainedNote: createSustainedNoteState(),
    lastTimestampMs: null,
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
  timing: PitchPipelineTiming = createDefaultTiming(state, sampleRate, config),
): PitchPipelineStep {
  assertValidTiming(state, timing);
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
    timing.elapsedMs,
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

  let stabilityState =
    !rawEstimate.voiced || octaveGuardStep.resetSmoothing
      ? createStabilityWindowState()
      : state.stability;
  const stabilityStep = rawEstimate.voiced
    ? advanceStabilityWindow(stabilityState, {
        timestampMs: timing.timestampMs,
        midi,
      })
    : {
        state: stabilityState,
        stabilityScore: null,
        pitchSpreadCents: null,
        trendCentsPerSecond: null,
        validFrameRatio: 0,
      };
  stabilityState = stabilityStep.state;
  const sustainedNoteStep = advanceSustainedNote(
    state.sustainedNote,
    {
      timestampMs: timing.timestampMs,
      frameDurationMs: timing.elapsedMs,
      rmsDbfs: rawEstimate.rmsDbfs,
      voiced: rawEstimate.voiced,
      midi,
      stabilityScore: stabilityStep.stabilityScore,
    },
    config.minRmsDbfs,
  );

  return {
    estimate: {
      frequencyHz: rawEstimate.frequencyHz,
      confidence: rawEstimate.confidence,
      rms: rawEstimate.rms,
      rmsDbfs: rawEstimate.rmsDbfs,
      voiced: rawEstimate.voiced,
      midi,
      stabilityScore: stabilityStep.stabilityScore,
      pitchSpreadCents: stabilityStep.pitchSpreadCents,
      trendCentsPerSecond: stabilityStep.trendCentsPerSecond,
      validFrameRatio: stabilityStep.validFrameRatio,
      continuousVoicedDurationMs: sustainedNoteStep.continuousVoicedDurationMs,
      currentStableDurationMs: sustainedNoteStep.currentStableDurationMs,
      minStableMidi: sustainedNoteStep.minStableMidi,
      maxStableMidi: sustainedNoteStep.maxStableMidi,
      state: sustainedNoteStep.pitchState,
    },
    state: {
      noiseGate: noiseGateStep.state,
      octaveGuard: octaveGuardStep.state,
      smoothing: smoothingState,
      stability: stabilityState,
      sustainedNote: sustainedNoteStep.state,
      lastTimestampMs: timing.timestampMs,
    },
  };
}

function createDefaultTiming(
  state: PitchPipelineState,
  sampleRate: number,
  config: YinConfig,
): PitchPipelineTiming {
  const elapsedMs = (config.hopSize / sampleRate) * 1000;
  return {
    elapsedMs,
    timestampMs: (state.lastTimestampMs ?? 0) + elapsedMs,
  };
}

function assertValidTiming(state: PitchPipelineState, timing: PitchPipelineTiming): void {
  if (!Number.isFinite(timing.elapsedMs) || timing.elapsedMs <= 0) {
    throw new RangeError("pitch pipeline elapsedMs must be finite and positive");
  }
  if (
    (state.lastTimestampMs !== null && !Number.isFinite(state.lastTimestampMs)) ||
    !Number.isFinite(timing.timestampMs) ||
    timing.timestampMs < 0 ||
    (state.lastTimestampMs !== null && timing.timestampMs < state.lastTimestampMs)
  ) {
    throw new RangeError("pitch pipeline timestampMs must be finite, non-negative, and monotonic");
  }
}
