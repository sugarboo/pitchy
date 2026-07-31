import { describe, expect, it } from "vitest";
import { midiToNoteName } from "./notes";
import { centsFromNearestMidi, centsFromTargetMidi, nearestMidi } from "./pitch";
import { frequencyHzToMidi, midiToFrequencyHz } from "./tuning";

describe("nearest MIDI note and cents", () => {
  it.each([
    { midi: 69, expectedNearest: 69, expectedCents: 0 },
    { midi: 69.1, expectedNearest: 69, expectedCents: 10 },
    { midi: 68.9, expectedNearest: 69, expectedCents: -10 },
    { midi: 69.5 - 1e-9, expectedNearest: 69, expectedCents: 49.999_999_9 },
    { midi: 69.5, expectedNearest: 70, expectedCents: -50 },
    { midi: 69.5 + 1e-9, expectedNearest: 70, expectedCents: -49.999_999_9 },
    { midi: -0.5, expectedNearest: 0, expectedCents: -50 },
    { midi: -0.5 - 1e-9, expectedNearest: -1, expectedCents: 49.999_999_9 },
    { midi: -1.5, expectedNearest: -1, expectedCents: -50 },
  ])(
    "maps MIDI $midi to $expectedNearest at $expectedCents cents",
    ({ midi, expectedNearest, expectedCents }) => {
      expect(nearestMidi(midi)).toBe(expectedNearest);
      expect(centsFromNearestMidi(midi)).toBeCloseTo(expectedCents, 7);
    },
  );

  it("canonicalizes the negative-zero midpoint result", () => {
    const nearest = nearestMidi(-0.5);

    expect(nearest).toBe(0);
    expect(Object.is(nearest, -0)).toBe(false);
    expect(Object.is(centsFromNearestMidi(0), -0)).toBe(false);
    expect(Object.is(centsFromTargetMidi(0, 0), -0)).toBe(false);
  });

  it.each([-12.75, -0.5, 0, 36.125, 69.499, 69.5, 127.25])(
    "keeps nearest cents bounded and reconstructs MIDI %s",
    (midi) => {
      const nearest = nearestMidi(midi);
      const cents = centsFromNearestMidi(midi);

      expect(cents).toBeGreaterThanOrEqual(-50);
      expect(cents).toBeLessThan(50);
      expect(nearest + cents / 100).toBeCloseTo(midi, 12);
    },
  );

  it.each([
    { midi: 69.5, targetMidi: 69, expectedCents: 50 },
    { midi: 68.5, targetMidi: 69, expectedCents: -50 },
    { midi: 69.25, targetMidi: 69, expectedCents: 25 },
    { midi: 68.75, targetMidi: 69, expectedCents: -25 },
    { midi: 81, targetMidi: 69, expectedCents: 1200 },
    { midi: 57, targetMidi: 69, expectedCents: -1200 },
  ])(
    "keeps MIDI $midi at $expectedCents cents from target $targetMidi",
    ({ midi, targetMidi, expectedCents }) => {
      expect(centsFromTargetMidi(midi, targetMidi)).toBe(expectedCents);
    },
  );

  it("composes tuned frequency, MIDI, nearest cents, and note formatting", () => {
    const tuningA4Hz = 442;
    const frequencyHz = midiToFrequencyHz(69.25, tuningA4Hz);
    const midi = frequencyHzToMidi(frequencyHz, tuningA4Hz);
    const nearest = nearestMidi(midi);

    expect(midi).toBeCloseTo(69.25, 12);
    expect(nearest).toBe(69);
    expect(centsFromNearestMidi(midi)).toBeCloseTo(25, 10);
    expect(midiToNoteName(nearest)).toBe("A4");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_VALUE])(
    "rejects an invalid MIDI value (%s)",
    (midi) => {
      expect(() => nearestMidi(midi)).toThrow(RangeError);
      expect(() => centsFromNearestMidi(midi)).toThrow(RangeError);
      expect(() => centsFromTargetMidi(midi, 69)).toThrow(RangeError);
    },
  );

  it.each([
    69.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects the invalid target MIDI note %s", (targetMidi) => {
    expect(() => centsFromTargetMidi(69, targetMidi)).toThrow(RangeError);
  });
});
