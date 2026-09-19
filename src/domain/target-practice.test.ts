import { describe, expect, it } from "vitest";
import { getFreePitchFeedback } from "../features/practice/free-practice";
import {
  advanceTargetProgress,
  assertPracticeConfiguration,
  createTargetProgress,
  MAX_TARGET_MIDI,
  MIN_TARGET_MIDI,
  targetDeviation,
} from "./target-practice";
import { midiToFrequencyHz } from "./tuning";

describe("target-note practice", () => {
  it("preserves octave distance and changes cents reference without changing detected pitch", () => {
    const detected = getFreePitchFeedback(69, 440);
    expect(detected?.noteName).toBe("A4");
    expect(targetDeviation(detected?.midi ?? null, 57)).toBe(1200);
    expect(targetDeviation(57, 69)).toBe(-1200);
    expect(targetDeviation(null, 69)).toBeNull();
    expect(targetDeviation(Number.NaN, 69)).toBeNull();
    expect(targetDeviation(getFreePitchFeedback(69, 415)?.midi ?? null, 70)).toBeCloseTo(1.27, 1);
  });

  it("keeps every offered target inside the detector range at both tuning limits", () => {
    for (const tuning of [415, 466]) {
      for (let midi = MIN_TARGET_MIDI; midi <= MAX_TARGET_MIDI; midi++) {
        expect(midiToFrequencyHz(midi, tuning)).toBeGreaterThanOrEqual(65);
        expect(midiToFrequencyHz(midi, tuning)).toBeLessThanOrEqual(1200);
      }
    }
  });

  it.each([37, 85, 69.5, Number.NaN, null])(
    "rejects invalid target configuration %s",
    (targetMidi) => {
      expect(() =>
        assertPracticeConfiguration({ mode: "target", targetMidi, tuningA4Hz: 440 }),
      ).toThrow(RangeError);
    },
  );

  it("requires free-mode target to be null and validates tuning", () => {
    expect(() =>
      assertPracticeConfiguration({ mode: "free", targetMidi: null, tuningA4Hz: 415 }),
    ).not.toThrow();
    expect(() =>
      assertPracticeConfiguration({ mode: "free", targetMidi: 69, tuningA4Hz: 440 }),
    ).toThrow();
    expect(() =>
      assertPracticeConfiguration({ mode: "target", targetMidi: 69, tuningA4Hz: 467 }),
    ).toThrow();
  });

  it.each([-20, 20, 0])(
    "counts the inclusive %s-cent boundary and separates stable time",
    (cents) => {
      const first = advanceTargetProgress(createTargetProgress(), {
        sequence: 0,
        timestampMs: 85,
        cents,
        stable: false,
      });
      const second = advanceTargetProgress(first, {
        sequence: 1,
        timestampMs: 128,
        cents,
        stable: true,
      });
      const third = advanceTargetProgress(second, {
        sequence: 2,
        timestampMs: 171,
        cents,
        stable: true,
      });
      expect(first.hitDurationMs).toBe(0);
      expect(second.hitDurationMs).toBe(43);
      expect(second.stableHitDurationMs).toBe(0);
      expect(third.hitDurationMs).toBe(86);
      expect(third.stableHitDurationMs).toBe(43);
      expect(first.previous?.stable).toBe(false);
    },
  );

  it.each([20.001, -20.001, 1200, null, Number.NaN])(
    "does not count an interval with missing or out-of-band evidence %s",
    (cents) => {
      let state = advanceTargetProgress(createTargetProgress(), {
        sequence: 0,
        timestampMs: 85,
        cents: 0,
        stable: true,
      });
      state = advanceTargetProgress(state, { sequence: 1, timestampMs: 128, cents, stable: true });
      state = advanceTargetProgress(state, {
        sequence: 2,
        timestampMs: 171,
        cents: 0,
        stable: true,
      });
      expect(state.hitDurationMs).toBe(0);
      expect(state.stableHitDurationMs).toBe(0);
    },
  );

  it("does not fill sequence gaps or replay duplicate and older frames", () => {
    const first = advanceTargetProgress(createTargetProgress(), {
      sequence: 0,
      timestampMs: 85,
      cents: 0,
      stable: true,
    });
    const gap = advanceTargetProgress(first, {
      sequence: 5,
      timestampMs: 300,
      cents: 0,
      stable: true,
    });
    expect(gap.hitDurationMs).toBe(0);
    expect(
      advanceTargetProgress(gap, { sequence: 5, timestampMs: 300, cents: 0, stable: true }),
    ).toBe(gap);
    expect(
      advanceTargetProgress(gap, { sequence: 4, timestampMs: 257, cents: 0, stable: true }),
    ).toBe(gap);
    expect(
      advanceTargetProgress(gap, { sequence: 6, timestampMs: 343, cents: 0, stable: true })
        .hitDurationMs,
    ).toBe(43);
  });
});
