export type NoteSpelling = "sharp" | "flat";

const SHARP_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

const FLAT_NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

/**
 * Formats an integer MIDI coordinate using scientific pitch notation (60 = C4).
 *
 * Note strings are display values only; callers keep MIDI numbers as keys.
 */
export function midiToNoteName(midi: number, spelling: NoteSpelling = "sharp"): string {
  if (!Number.isSafeInteger(midi)) {
    throw new RangeError("midi note must be a safe integer");
  }
  if (spelling !== "sharp" && spelling !== "flat") {
    throw new RangeError("note spelling must be sharp or flat");
  }

  const pitchClassIndex = ((midi % 12) + 12) % 12;
  const noteNames = spelling === "sharp" ? SHARP_NOTE_NAMES : FLAT_NOTE_NAMES;
  const noteName = noteNames[pitchClassIndex];
  if (noteName === undefined) {
    throw new RangeError("midi note has an invalid pitch class");
  }

  const octave = Math.floor(midi / 12) - 1;
  return `${noteName}${octave}`;
}
