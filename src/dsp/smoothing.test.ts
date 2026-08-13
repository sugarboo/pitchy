import { describe, expect, it } from "vitest";
import {
  advanceTemporalMedianFilter,
  createTemporalMedianFilterState,
  type TemporalMedianFilterState,
} from "./smoothing";

function runSequence(values: readonly (number | null)[]): {
  readonly outputs: readonly (number | null)[];
  readonly state: TemporalMedianFilterState;
} {
  let state = createTemporalMedianFilterState();
  const outputs: (number | null)[] = [];

  for (const value of values) {
    const step = advanceTemporalMedianFilter(state, value);
    outputs.push(step.smoothedMidi);
    state = step.state;
  }

  return { outputs, state };
}

describe("temporal MIDI median filter", () => {
  it("smooths during warm-up and evicts the oldest value at the window boundary", () => {
    const result = runSequence([60, 61, 62, 63, 64, 65]);

    expect(result.outputs).toEqual([60, 60.5, 61, 61.5, 62, 63]);
    expect(result.state).toEqual({ recentMidi: [61, 62, 63, 64, 65] });
  });

  it("keeps a fixed pitch unchanged", () => {
    expect(runSequence([69, 69, 69, 69, 69, 69]).outputs).toEqual([69, 69, 69, 69, 69, 69]);
  });

  it("rejects one statistical outlier without implementing an octave guard", () => {
    const result = runSequence([69, 69, 69, 74, 69]);

    expect(result.outputs.at(-1)).toBe(69);
  });

  it("preserves fractional, monotonic motion through a linear glissando", () => {
    const input = Array.from({ length: 13 }, (_, index) => 60 + index * 0.125);
    const { outputs } = runSequence(input);

    for (let index = 4; index < outputs.length; index += 1) {
      expect(outputs[index]).toBe(input[index - 2]);
    }
    expect(
      outputs.every((value, index) => {
        const previous = outputs[index - 1];
        return (
          index === 0 ||
          (typeof value === "number" && typeof previous === "number" && value >= previous)
        );
      }),
    ).toBe(true);
    expect(outputs.some((value) => value !== null && !Number.isInteger(value))).toBe(true);
  });

  it("keeps deterministic vibrato finite and within each causal window", () => {
    const sampleRate = 48_000;
    const hopSize = 2048;
    const input = Array.from(
      { length: 32 },
      (_, index) => 69 + 0.25 * Math.sin((2 * Math.PI * 5 * index * hopSize) / sampleRate),
    );
    const { outputs } = runSequence(input);

    for (let index = 0; index < outputs.length; index += 1) {
      const output = outputs[index] as number;
      const window = input.slice(Math.max(0, index - 4), index + 1);
      expect(Number.isFinite(output)).toBe(true);
      expect(output).toBeGreaterThanOrEqual(Math.min(...window));
      expect(output).toBeLessThanOrEqual(Math.max(...window));
    }
    expect(outputs.slice(4).some((value) => (value as number) < 68.95)).toBe(true);
    expect(outputs.slice(4).some((value) => (value as number) > 69.05)).toBe(true);
    expect(outputs.some((value) => value !== null && !Number.isInteger(value))).toBe(true);
  });

  it("clears history at an unvoiced boundary and accepts the next pitch immediately", () => {
    const result = runSequence([69, 69.1, 69.2, null, 72]);

    expect(result.outputs).toEqual([69, 69.05, 69.1, null, 72]);
    expect(result.state).toEqual({ recentMidi: [72] });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "fails closed and clears history for non-finite observation %s",
    (midi) => {
      const state = { recentMidi: [69, 69.1] };
      const result = advanceTemporalMedianFilter(state, midi);

      expect(result).toEqual({ smoothedMidi: null, state: { recentMidi: [] } });
      expect(state).toEqual({ recentMidi: [69, 69.1] });
    },
  );

  it("does not mutate or reuse input state", () => {
    const state = { recentMidi: [60, 61] };
    const originalHistory = state.recentMidi;
    const first = advanceTemporalMedianFilter(state, 62);
    const second = createTemporalMedianFilterState();

    expect(state).toEqual({ recentMidi: [60, 61] });
    expect(first.state).not.toBe(state);
    expect(first.state.recentMidi).not.toBe(originalHistory);
    expect(second).not.toBe(createTemporalMedianFilterState());
    expect(second.recentMidi).not.toBe(createTemporalMedianFilterState().recentMidi);
  });

  it("rejects malformed state or configuration", () => {
    expect(() => advanceTemporalMedianFilter({ recentMidi: [Number.NaN] }, 69)).toThrow(RangeError);
    expect(() => advanceTemporalMedianFilter({ recentMidi: [60, 61, 62, 63, 64, 65] }, 69)).toThrow(
      RangeError,
    );
    expect(() =>
      advanceTemporalMedianFilter(createTemporalMedianFilterState(), 69, { windowSize: 4 }),
    ).toThrow(RangeError);
  });
});
