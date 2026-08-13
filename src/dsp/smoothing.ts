import {
  assertValidTemporalMedianFilterConfig,
  DEFAULT_TEMPORAL_MEDIAN_FILTER_CONFIG,
  type TemporalMedianFilterConfig,
} from "./dsp-config";

export interface TemporalMedianFilterState {
  readonly recentMidi: readonly number[];
}

export interface TemporalMedianFilterStep {
  readonly smoothedMidi: number | null;
  readonly state: TemporalMedianFilterState;
}

export function createTemporalMedianFilterState(): TemporalMedianFilterState {
  return { recentMidi: [] };
}

/**
 * Smooths continuous MIDI observations without quantizing them to note names.
 * Pass null for an unvoiced frame; the silence boundary clears prior history so
 * the next phrase can begin at any pitch without being pulled toward the old one.
 */
export function advanceTemporalMedianFilter(
  state: TemporalMedianFilterState,
  midi: number | null,
  config: TemporalMedianFilterConfig = DEFAULT_TEMPORAL_MEDIAN_FILTER_CONFIG,
): TemporalMedianFilterStep {
  assertValidTemporalMedianFilterConfig(config);
  assertValidTemporalMedianFilterState(state, config.windowSize);

  if (midi === null || !Number.isFinite(midi)) {
    return {
      smoothedMidi: null,
      state: createTemporalMedianFilterState(),
    };
  }

  const recentMidi = [...state.recentMidi, midi].slice(-config.windowSize);
  return {
    smoothedMidi: calculateMedian(recentMidi),
    state: { recentMidi },
  };
}

function calculateMedian(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middleIndex = Math.floor(sorted.length / 2);
  const upper = sorted[middleIndex] as number;
  const median =
    sorted.length % 2 === 1 ? upper : (sorted[middleIndex - 1] as number) / 2 + upper / 2;

  return median === 0 ? 0 : median;
}

function assertValidTemporalMedianFilterState(
  state: TemporalMedianFilterState,
  windowSize: number,
): void {
  if (
    typeof state !== "object" ||
    state === null ||
    !Array.isArray(state.recentMidi) ||
    state.recentMidi.length > windowSize
  ) {
    throw new RangeError("median-filter state must contain at most windowSize MIDI values");
  }

  for (let index = 0; index < state.recentMidi.length; index += 1) {
    if (!Number.isFinite(state.recentMidi[index])) {
      throw new RangeError("median-filter history must contain only finite MIDI values");
    }
  }
}
