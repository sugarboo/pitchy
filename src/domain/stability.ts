import {
  assertValidStabilityConfig,
  DEFAULT_STABILITY_CONFIG,
  type StabilityConfig,
} from "../dsp/dsp-config";

export interface StabilityObservation {
  readonly timestampMs: number;
  readonly midi: number | null;
}

export interface StabilityWindowState {
  readonly observations: readonly Readonly<StabilityObservation>[];
}

export interface StabilityMetrics {
  readonly stabilityScore: number | null;
  readonly pitchSpreadCents: number | null;
  readonly trendCentsPerSecond: number | null;
  readonly validFrameRatio: number;
}

export interface StabilityWindowStep extends StabilityMetrics {
  readonly state: StabilityWindowState;
}

export const PRACTICE_PITCH_STATES = [
  "silent",
  "onset",
  "stable",
  "unstable",
  "low-confidence",
] as const;

export type PracticePitchState = (typeof PRACTICE_PITCH_STATES)[number];

export interface SustainedNoteState {
  readonly previousState: PracticePitchState;
  readonly voicedStartedAtMs: number | null;
  readonly stableStartedAtMs: number | null;
  readonly minStableMidi: number | null;
  readonly maxStableMidi: number | null;
}

export interface SustainedNoteObservation {
  readonly timestampMs: number;
  readonly frameDurationMs: number;
  readonly rmsDbfs: number;
  readonly voiced: boolean;
  readonly midi: number | null;
  readonly stabilityScore: number | null;
}

export interface SustainedNoteStep {
  readonly state: SustainedNoteState;
  readonly pitchState: PracticePitchState;
  readonly continuousVoicedDurationMs: number;
  readonly currentStableDurationMs: number;
  readonly minStableMidi: number | null;
  readonly maxStableMidi: number | null;
}

export function createStabilityWindowState(): StabilityWindowState {
  return { observations: [] };
}

export function createSustainedNoteState(): SustainedNoteState {
  return {
    previousState: "silent",
    voicedStartedAtMs: null,
    stableStartedAtMs: null,
    minStableMidi: null,
    maxStableMidi: null,
  };
}

export function isPracticePitchState(value: unknown): value is PracticePitchState {
  return PRACTICE_PITCH_STATES.some((state) => state === value);
}

/**
 * Maintains a time-bounded pitch window and derives robust dispersion plus a
 * Theil-Sen trend. Null or non-finite MIDI remains explicit missing evidence.
 */
export function advanceStabilityWindow(
  state: StabilityWindowState,
  observation: StabilityObservation,
  config: StabilityConfig = DEFAULT_STABILITY_CONFIG,
): StabilityWindowStep {
  assertValidStabilityConfig(config);
  assertValidStabilityWindowState(state);
  if (!Number.isFinite(observation.timestampMs) || observation.timestampMs < 0) {
    throw new RangeError("stability timestampMs must be finite and non-negative");
  }

  const previousTimestampMs = state.observations.at(-1)?.timestampMs;
  if (previousTimestampMs !== undefined && observation.timestampMs < previousTimestampMs) {
    throw new RangeError("stability timestamps must be monotonic");
  }

  const midi =
    observation.midi !== null && Number.isFinite(observation.midi)
      ? normalizeZero(observation.midi)
      : null;
  const cutoffMs = observation.timestampMs - config.windowDurationMs;
  const observations = state.observations
    .filter((candidate) => candidate.timestampMs >= cutoffMs)
    .map((candidate) => ({ ...candidate }));
  observations.push({ timestampMs: normalizeZero(observation.timestampMs), midi });

  const validObservations = observations.filter(
    (candidate): candidate is Readonly<{ timestampMs: number; midi: number }> =>
      candidate.midi !== null,
  );
  const validFrameRatio = validObservations.length / observations.length;
  const nextState: StabilityWindowState = { observations };
  if (
    validObservations.length < config.minimumValidFrames ||
    validFrameRatio < config.minimumValidRatio
  ) {
    return {
      state: nextState,
      stabilityScore: null,
      pitchSpreadCents: null,
      trendCentsPerSecond: null,
      validFrameRatio,
    };
  }

  const medianMidi = median(validObservations.map((candidate) => candidate.midi));
  const pitchSpreadCents = normalizeZero(
    median(validObservations.map((candidate) => Math.abs(candidate.midi - medianMidi))) * 100,
  );
  const trendCentsPerSecond = normalizeZero(calculateTheilSenTrend(validObservations));
  const spreadScore = 100 * (1 - Math.min(1, pitchSpreadCents / config.zeroScoreSpreadCents));
  const trendScore =
    100 * (1 - Math.min(1, Math.abs(trendCentsPerSecond) / config.zeroScoreTrendCentsPerSecond));
  const stabilityScore = normalizeZero(Math.min(spreadScore, trendScore));

  return {
    state: nextState,
    stabilityScore,
    pitchSpreadCents,
    trendCentsPerSecond,
    validFrameRatio,
  };
}

/**
 * Classifies silence, onset, stable, unstable, and low-confidence frames while
 * tracking continuous voicing and the observed stable range for this session.
 */
export function advanceSustainedNote(
  state: SustainedNoteState,
  observation: SustainedNoteObservation,
  minRmsDbfs: number,
  config: StabilityConfig = DEFAULT_STABILITY_CONFIG,
): SustainedNoteStep {
  assertValidStabilityConfig(config);
  assertValidSustainedNoteState(state);
  if (!Number.isFinite(minRmsDbfs)) {
    throw new RangeError("sustained-note minRmsDbfs must be finite");
  }
  if (!Number.isFinite(observation.timestampMs) || observation.timestampMs < 0) {
    throw new RangeError("sustained-note timestampMs must be finite and non-negative");
  }
  if (!Number.isFinite(observation.frameDurationMs) || observation.frameDurationMs <= 0) {
    throw new RangeError("sustained-note frameDurationMs must be finite and positive");
  }
  if (!Number.isFinite(observation.rmsDbfs)) {
    throw new RangeError("sustained-note rmsDbfs must be finite");
  }
  if (typeof observation.voiced !== "boolean") {
    throw new RangeError("sustained-note voiced must be boolean");
  }

  const midi =
    observation.midi !== null && Number.isFinite(observation.midi)
      ? normalizeZero(observation.midi)
      : null;
  const stabilityScore =
    observation.stabilityScore !== null &&
    Number.isFinite(observation.stabilityScore) &&
    observation.stabilityScore >= 0 &&
    observation.stabilityScore <= 100
      ? normalizeZero(observation.stabilityScore)
      : null;

  if (!observation.voiced) {
    const pitchState: PracticePitchState =
      observation.rmsDbfs <= minRmsDbfs ? "silent" : "low-confidence";
    const nextState: SustainedNoteState = {
      previousState: pitchState,
      voicedStartedAtMs: null,
      stableStartedAtMs: null,
      minStableMidi: state.minStableMidi,
      maxStableMidi: state.maxStableMidi,
    };
    return createSustainedStep(nextState, pitchState, 0, 0);
  }

  const voicedStartedAtMs =
    state.voicedStartedAtMs ?? observation.timestampMs - observation.frameDurationMs;
  if (voicedStartedAtMs > observation.timestampMs) {
    throw new RangeError("sustained-note state cannot start after the current observation");
  }
  const continuousVoicedDurationMs = normalizeZero(observation.timestampMs - voicedStartedAtMs);

  if (
    midi === null ||
    stabilityScore === null ||
    continuousVoicedDurationMs < config.onsetDurationMs
  ) {
    const nextState: SustainedNoteState = {
      previousState: "onset",
      voicedStartedAtMs,
      stableStartedAtMs: null,
      minStableMidi: state.minStableMidi,
      maxStableMidi: state.maxStableMidi,
    };
    return createSustainedStep(nextState, "onset", continuousVoicedDurationMs, 0);
  }

  const stableThreshold =
    state.previousState === "stable" ? config.stableExitScore : config.stableEnterScore;
  if (stabilityScore < stableThreshold) {
    const nextState: SustainedNoteState = {
      previousState: "unstable",
      voicedStartedAtMs,
      stableStartedAtMs: null,
      minStableMidi: state.minStableMidi,
      maxStableMidi: state.maxStableMidi,
    };
    return createSustainedStep(nextState, "unstable", continuousVoicedDurationMs, 0);
  }

  const stableStartedAtMs =
    state.previousState === "stable" && state.stableStartedAtMs !== null
      ? state.stableStartedAtMs
      : observation.timestampMs - observation.frameDurationMs;
  const minStableMidi = state.minStableMidi === null ? midi : Math.min(state.minStableMidi, midi);
  const maxStableMidi = state.maxStableMidi === null ? midi : Math.max(state.maxStableMidi, midi);
  const nextState: SustainedNoteState = {
    previousState: "stable",
    voicedStartedAtMs,
    stableStartedAtMs,
    minStableMidi,
    maxStableMidi,
  };
  return createSustainedStep(
    nextState,
    "stable",
    continuousVoicedDurationMs,
    observation.timestampMs - stableStartedAtMs,
  );
}

function createSustainedStep(
  state: SustainedNoteState,
  pitchState: PracticePitchState,
  continuousVoicedDurationMs: number,
  currentStableDurationMs: number,
): SustainedNoteStep {
  return {
    state,
    pitchState,
    continuousVoicedDurationMs: normalizeZero(continuousVoicedDurationMs),
    currentStableDurationMs: normalizeZero(currentStableDurationMs),
    minStableMidi: state.minStableMidi,
    maxStableMidi: state.maxStableMidi,
  };
}

function calculateTheilSenTrend(
  observations: readonly Readonly<{ timestampMs: number; midi: number }>[],
): number {
  const slopes: number[] = [];
  for (let leftIndex = 0; leftIndex < observations.length - 1; leftIndex += 1) {
    const left = observations[leftIndex] as Readonly<{ timestampMs: number; midi: number }>;
    for (let rightIndex = leftIndex + 1; rightIndex < observations.length; rightIndex += 1) {
      const right = observations[rightIndex] as Readonly<{ timestampMs: number; midi: number }>;
      const elapsedMs = right.timestampMs - left.timestampMs;
      if (elapsedMs > 0) {
        slopes.push(((right.midi - left.midi) * 100 * 1000) / elapsedMs);
      }
    }
  }

  return slopes.length === 0 ? 0 : median(slopes);
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new RangeError("median requires at least one value");
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middleIndex = Math.floor(sorted.length / 2);
  const upper = sorted[middleIndex] as number;
  return sorted.length % 2 === 1 ? upper : (sorted[middleIndex - 1] as number) / 2 + upper / 2;
}

function assertValidStabilityWindowState(state: StabilityWindowState): void {
  if (typeof state !== "object" || state === null || !Array.isArray(state.observations)) {
    throw new RangeError("stability state must contain an observation array");
  }

  let previousTimestampMs = Number.NEGATIVE_INFINITY;
  for (const observation of state.observations) {
    if (
      typeof observation !== "object" ||
      observation === null ||
      !Number.isFinite(observation.timestampMs) ||
      observation.timestampMs < 0 ||
      observation.timestampMs < previousTimestampMs ||
      (observation.midi !== null && !Number.isFinite(observation.midi))
    ) {
      throw new RangeError("stability history must contain monotonic finite observations");
    }
    previousTimestampMs = observation.timestampMs;
  }
}

function assertValidSustainedNoteState(state: SustainedNoteState): void {
  if (
    typeof state !== "object" ||
    state === null ||
    !isPracticePitchState(state.previousState) ||
    (state.voicedStartedAtMs !== null && !Number.isFinite(state.voicedStartedAtMs)) ||
    (state.stableStartedAtMs !== null && !Number.isFinite(state.stableStartedAtMs)) ||
    (state.minStableMidi !== null && !Number.isFinite(state.minStableMidi)) ||
    (state.maxStableMidi !== null && !Number.isFinite(state.maxStableMidi)) ||
    (state.minStableMidi === null) !== (state.maxStableMidi === null) ||
    (state.minStableMidi !== null &&
      state.maxStableMidi !== null &&
      state.minStableMidi > state.maxStableMidi) ||
    (state.stableStartedAtMs !== null && state.voicedStartedAtMs === null)
  ) {
    throw new RangeError("sustained-note state is malformed");
  }
}

function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}
