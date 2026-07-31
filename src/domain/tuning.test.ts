import { describe, expect, it } from "vitest";
import {
  assertValidTuningA4Hz,
  DEFAULT_TUNING_A4_HZ,
  frequencyHzToMidi,
  MAX_TUNING_A4_HZ,
  MIN_TUNING_A4_HZ,
  midiToFrequencyHz,
} from "./tuning";

describe("12-TET frequency and MIDI conversion", () => {
  it("uses A4 = 440 Hz by default", () => {
    expect(DEFAULT_TUNING_A4_HZ).toBe(440);
    expect(MIN_TUNING_A4_HZ).toBe(415);
    expect(MAX_TUNING_A4_HZ).toBe(466);
    expect(frequencyHzToMidi(440)).toBe(69);
    expect(midiToFrequencyHz(69)).toBe(440);
  });

  it("matches the independent C4 reference at A4 = 440 Hz", () => {
    const c4FrequencyHz = 261.625_565_300_598_6;

    expect(frequencyHzToMidi(c4FrequencyHz)).toBeCloseTo(60, 10);
    expect(midiToFrequencyHz(60)).toBeCloseTo(c4FrequencyHz, 10);
  });

  it.each([415, 432.5, 440, 466])(
    "anchors octaves around MIDI 69 at an A4 tuning of %s Hz",
    (tuningA4Hz) => {
      expect(frequencyHzToMidi(tuningA4Hz, tuningA4Hz)).toBeCloseTo(69, 12);
      expect(frequencyHzToMidi(tuningA4Hz / 2, tuningA4Hz)).toBeCloseTo(57, 12);
      expect(frequencyHzToMidi(tuningA4Hz * 2, tuningA4Hz)).toBeCloseTo(81, 12);
      expect(midiToFrequencyHz(57, tuningA4Hz)).toBeCloseTo(tuningA4Hz / 2, 12);
      expect(midiToFrequencyHz(69, tuningA4Hz)).toBeCloseTo(tuningA4Hz, 12);
      expect(midiToFrequencyHz(81, tuningA4Hz)).toBeCloseTo(tuningA4Hz * 2, 12);
    },
  );

  it.each([-12, 0, 21, 60, 69, 69.37, 81, 127])(
    "round-trips the continuous MIDI coordinate %s",
    (midi) => {
      const roundTrippedMidi = frequencyHzToMidi(midiToFrequencyHz(midi));

      expect(Math.abs(roundTrippedMidi - midi)).toBeLessThan(1e-10);
    },
  );

  it.each([65, 110, 261.625_565_300_598_6, 440, 1200])(
    "round-trips the frequency %s Hz",
    (frequencyHz) => {
      const roundTrippedFrequency = midiToFrequencyHz(frequencyHzToMidi(frequencyHz));
      const relativeError = Math.abs(roundTrippedFrequency - frequencyHz) / frequencyHz;

      expect(relativeError).toBeLessThan(1e-12);
    },
  );

  it.each([MIN_TUNING_A4_HZ, MAX_TUNING_A4_HZ])(
    "accepts the inclusive A4 tuning boundary %s Hz",
    (tuningA4Hz) => {
      expect(() => assertValidTuningA4Hz(tuningA4Hz)).not.toThrow();
    },
  );

  it.each([
    414.999,
    466.001,
    0,
    -440,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])("rejects the invalid A4 tuning %s", (tuningA4Hz) => {
    expect(() => assertValidTuningA4Hz(tuningA4Hz)).toThrow(RangeError);
    expect(() => frequencyHzToMidi(440, tuningA4Hz)).toThrow(RangeError);
    expect(() => midiToFrequencyHz(69, tuningA4Hz)).toThrow(RangeError);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects a frequency that cannot produce a finite MIDI coordinate (%s)",
    (frequencyHz) => {
      expect(() => frequencyHzToMidi(frequencyHz)).toThrow(RangeError);
    },
  );

  it.each([Number.MIN_VALUE, 1e-320, Number.MAX_VALUE])(
    "keeps the extreme positive finite frequency %s representable",
    (frequencyHz) => {
      const midi = frequencyHzToMidi(frequencyHz);
      const roundTrippedFrequency = midiToFrequencyHz(midi);
      const relativeError = Math.abs(roundTrippedFrequency - frequencyHz) / frequencyHz;

      expect(Number.isFinite(midi)).toBe(true);
      expect(roundTrippedFrequency).toBeGreaterThan(0);
      expect(Number.isFinite(roundTrippedFrequency)).toBe(true);
      expect(relativeError).toBeLessThan(1e-12);
    },
  );

  it("round-trips a fractional MIDI coordinate with a custom nonstandard tuning", () => {
    const midi = 64.375;
    const tuningA4Hz = 432.5;

    expect(frequencyHzToMidi(midiToFrequencyHz(midi, tuningA4Hz), tuningA4Hz)).toBeCloseTo(
      midi,
      10,
    );
  });

  it.each([-12, 0, 69.25])("accepts the continuous MIDI coordinate %s", (midi) => {
    const frequencyHz = midiToFrequencyHz(midi);

    expect(Number.isFinite(frequencyHz)).toBe(true);
    expect(frequencyHz).toBeGreaterThan(0);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1_000_000, -1_000_000])(
    "rejects MIDI coordinates outside the finite frequency range (%s)",
    (midi) => {
      expect(() => midiToFrequencyHz(midi)).toThrow(RangeError);
    },
  );
});
