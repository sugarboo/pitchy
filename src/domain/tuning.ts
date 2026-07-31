export const DEFAULT_TUNING_A4_HZ = 440;
export const MIN_TUNING_A4_HZ = 415;
export const MAX_TUNING_A4_HZ = 466;

const MIDI_A4 = 69;
const SEMITONES_PER_OCTAVE = 12;

export function assertValidTuningA4Hz(tuningA4Hz: number): void {
  if (
    !Number.isFinite(tuningA4Hz) ||
    tuningA4Hz < MIN_TUNING_A4_HZ ||
    tuningA4Hz > MAX_TUNING_A4_HZ
  ) {
    throw new RangeError(
      `tuningA4Hz must be finite and between ${MIN_TUNING_A4_HZ} and ${MAX_TUNING_A4_HZ} Hz`,
    );
  }
}

/**
 * Converts a positive frequency in hertz to a continuous 12-TET MIDI coordinate.
 */
export function frequencyHzToMidi(frequencyHz: number, tuningA4Hz = DEFAULT_TUNING_A4_HZ): number {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) {
    throw new RangeError("frequencyHz must be finite and greater than zero");
  }
  assertValidTuningA4Hz(tuningA4Hz);

  const midi = MIDI_A4 + SEMITONES_PER_OCTAVE * (Math.log2(frequencyHz) - Math.log2(tuningA4Hz));
  if (!Number.isFinite(midi)) {
    throw new RangeError("frequencyHz is outside the finite MIDI conversion range");
  }

  return midi;
}

/**
 * Converts a continuous 12-TET MIDI coordinate to a positive frequency in hertz.
 */
export function midiToFrequencyHz(midi: number, tuningA4Hz = DEFAULT_TUNING_A4_HZ): number {
  if (!Number.isFinite(midi)) {
    throw new RangeError("midi must be finite");
  }
  assertValidTuningA4Hz(tuningA4Hz);

  const octaveOffset = (midi - MIDI_A4) / SEMITONES_PER_OCTAVE;
  // A subnormal power can underflow before multiplication by A4. Combining
  // exponents preserves the final representable frequency in that low range.
  const frequencyHz =
    octaveOffset < -1022
      ? 2 ** (Math.log2(tuningA4Hz) + octaveOffset)
      : tuningA4Hz * 2 ** octaveOffset;
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) {
    throw new RangeError("midi is outside the finite frequency conversion range");
  }

  return frequencyHz;
}
