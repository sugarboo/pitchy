import { midiToNoteName } from "../../domain/notes";
import { centsFromNearestMidi, nearestMidi } from "../../domain/pitch";
import {
  assertValidTuningA4Hz,
  DEFAULT_TUNING_A4_HZ,
  midiToFrequencyHz,
} from "../../domain/tuning";

/** Worker/trace MIDI remains anchored to 440 Hz; tuning is a display coordinate shift. */
export function tuningMidiOffset(tuningA4Hz: number): number {
  assertValidTuningA4Hz(tuningA4Hz);
  return 12 * Math.log2(DEFAULT_TUNING_A4_HZ / tuningA4Hz);
}

export interface FreePitchFeedback {
  readonly mode: "free";
  readonly midi: number;
  readonly noteName: string;
  readonly frequencyHz: number;
  readonly centsFromNearest: number;
  readonly centsFromTarget: null;
}

export function getFreePitchFeedback(
  canonicalMidi: number | null,
  tuningA4Hz = DEFAULT_TUNING_A4_HZ,
): FreePitchFeedback | null {
  const offset = tuningMidiOffset(tuningA4Hz);
  if (canonicalMidi === null || !Number.isFinite(canonicalMidi)) return null;
  const midi = canonicalMidi + offset;
  return {
    mode: "free",
    midi,
    noteName: midiToNoteName(nearestMidi(midi)),
    frequencyHz: midiToFrequencyHz(canonicalMidi),
    centsFromNearest: centsFromNearestMidi(midi),
    centsFromTarget: null,
  };
}
