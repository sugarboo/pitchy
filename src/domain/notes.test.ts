import { describe, expect, it } from "vitest";
import { midiToNoteName, type NoteSpelling } from "./notes";

describe("MIDI note name formatting", () => {
  it.each([
    { midi: -13, expected: "B-3" },
    { midi: -12, expected: "C-2" },
    { midi: -1, expected: "B-2" },
    { midi: 0, expected: "C-1" },
    { midi: 11, expected: "B-1" },
    { midi: 12, expected: "C0" },
    { midi: 59, expected: "B3" },
    { midi: 60, expected: "C4" },
    { midi: 69, expected: "A4" },
    { midi: 71, expected: "B4" },
    { midi: 72, expected: "C5" },
    { midi: 127, expected: "G9" },
  ])("formats MIDI $midi as $expected across octave boundaries", ({ midi, expected }) => {
    expect(midiToNoteName(midi)).toBe(expected);
  });

  it.each([
    { midi: -11, sharp: "C#-2", flat: "Db-2" },
    { midi: 61, sharp: "C#4", flat: "Db4" },
    { midi: 63, sharp: "D#4", flat: "Eb4" },
    { midi: 66, sharp: "F#4", flat: "Gb4" },
    { midi: 68, sharp: "G#4", flat: "Ab4" },
    { midi: 70, sharp: "A#4", flat: "Bb4" },
  ])("formats MIDI $midi using either enharmonic spelling", ({ midi, sharp, flat }) => {
    expect(midiToNoteName(midi, "sharp")).toBe(sharp);
    expect(midiToNoteName(midi, "flat")).toBe(flat);
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    60.5,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects the invalid discrete MIDI note %s", (midi) => {
    expect(() => midiToNoteName(midi)).toThrow(RangeError);
  });

  it("rejects an invalid spelling at runtime", () => {
    expect(() => midiToNoteName(60, "natural" as NoteSpelling)).toThrow(RangeError);
  });
});
