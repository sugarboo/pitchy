import { bench, describe } from "vitest";
import {
  advanceTemporalMedianFilter,
  createTemporalMedianFilterState,
  type TemporalMedianFilterState,
} from "./smoothing";

const sequenceLength = 4096;
const continuousSequence = Array.from(
  { length: sequenceLength },
  (_, index) => 60 + index * 0.000_5 + 0.25 * Math.sin((2 * Math.PI * 5 * index * 2048) / 48_000),
);
const resetHeavySequence = continuousSequence.map((midi, index) =>
  index % 32 === 31 ? null : midi,
);

function processSequence(sequence: readonly (number | null)[]): number {
  let state: TemporalMedianFilterState = createTemporalMedianFilterState();
  let checksum = 0;

  for (const midi of sequence) {
    const step = advanceTemporalMedianFilter(state, midi);
    checksum += step.smoothedMidi ?? 0;
    state = step.state;
  }

  return checksum + (state.recentMidi.at(-1) ?? 0);
}

describe("temporal MIDI median filter", () => {
  bench("4096-frame fractional vibrato and glissando sequence", () => {
    const checksum = processSequence(continuousSequence);
    if (!Number.isFinite(checksum)) {
      throw new Error("non-finite smoothing benchmark checksum");
    }
  });

  bench("4096-frame sequence with an unvoiced reset every 32 frames", () => {
    const checksum = processSequence(resetHeavySequence);
    if (!Number.isFinite(checksum)) {
      throw new Error("non-finite smoothing benchmark checksum");
    }
  });
});
