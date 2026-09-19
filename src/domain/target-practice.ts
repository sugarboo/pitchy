import { centsFromTargetMidi } from "./pitch";
import { assertValidTuningA4Hz } from "./tuning";

export type PracticeMode = "free" | "target";
// D2–C6 stays inside the detector's 65–1200 Hz range for every supported tuning.
export const MIN_TARGET_MIDI = 38;
export const MAX_TARGET_MIDI = 84;
export const DEFAULT_TARGET_MIDI = 69;
// Product tolerance, not a scientific assessment of singing quality.
export const TARGET_HIT_CENTS = 20;

export interface PracticeConfiguration {
  readonly mode: PracticeMode;
  readonly targetMidi: number | null;
  readonly tuningA4Hz: number;
}

export function assertPracticeConfiguration(config: PracticeConfiguration): void {
  assertValidTuningA4Hz(config.tuningA4Hz);
  if (config.mode === "free" && config.targetMidi === null) return;
  if (
    config.mode === "target" &&
    Number.isInteger(config.targetMidi) &&
    config.targetMidi !== null &&
    config.targetMidi >= MIN_TARGET_MIDI &&
    config.targetMidi <= MAX_TARGET_MIDI
  )
    return;
  throw new RangeError("Invalid practice mode or target note");
}

export function targetDeviation(midi: number | null, targetMidi: number): number | null {
  if (
    !Number.isInteger(targetMidi) ||
    targetMidi < MIN_TARGET_MIDI ||
    targetMidi > MAX_TARGET_MIDI
  ) {
    throw new RangeError("Target note is outside supported range");
  }
  return midi === null || !Number.isFinite(midi) ? null : centsFromTargetMidi(midi, targetMidi);
}

export interface TargetObservation {
  readonly sequence: number;
  readonly timestampMs: number;
  readonly cents: number | null;
  readonly stable: boolean;
}

export interface TargetProgress {
  readonly hitDurationMs: number;
  readonly stableHitDurationMs: number;
}

export interface TargetProgressState extends TargetProgress {
  readonly previous: TargetObservation | null;
}

export function createTargetProgress(): TargetProgressState {
  return { hitDurationMs: 0, stableHitDurationMs: 0, previous: null };
}

function isHit(cents: number | null): boolean {
  // Absorb MIDI subtraction roundoff only, not perceptible out-of-band pitch.
  return cents !== null && Number.isFinite(cents) && Math.abs(cents) <= TARGET_HIT_CENTS + 1e-9;
}

/** Count only adjacent observed intervals with both endpoints in the tolerance band. */
export function advanceTargetProgress(
  state: TargetProgressState,
  observation: TargetObservation,
): TargetProgressState {
  if (
    !Number.isSafeInteger(observation.sequence) ||
    observation.sequence < 0 ||
    !Number.isFinite(observation.timestampMs) ||
    observation.timestampMs < 0
  ) {
    throw new RangeError("Invalid target observation timing");
  }
  const previous = state.previous;
  if (
    previous !== null &&
    (observation.sequence <= previous.sequence || observation.timestampMs <= previous.timestampMs)
  ) {
    return state;
  }
  const elapsed =
    previous !== null && observation.sequence === previous.sequence + 1
      ? observation.timestampMs - previous.timestampMs
      : 0;
  const hit = previous !== null && isHit(previous.cents) && isHit(observation.cents);
  return {
    hitDurationMs: state.hitDurationMs + (hit ? elapsed : 0),
    stableHitDurationMs:
      state.stableHitDurationMs + (hit && previous.stable && observation.stable ? elapsed : 0),
    previous: { ...observation },
  };
}
