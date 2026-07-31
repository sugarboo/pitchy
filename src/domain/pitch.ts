export function nearestMidi(midi: number): number {
  assertFiniteMidi(midi);

  // Math.round resolves exact half-semitone ties toward the higher note.
  const nearest = Math.round(midi);
  if (!Number.isSafeInteger(nearest)) {
    throw new RangeError("nearest MIDI note must be a safe integer");
  }

  return nearest === 0 ? 0 : nearest;
}

export function centsFromNearestMidi(midi: number): number {
  const cents = 100 * (midi - nearestMidi(midi));
  return assertFiniteCents(cents);
}

export function centsFromTargetMidi(midi: number, targetMidi: number): number {
  assertFiniteMidi(midi);
  if (!Number.isSafeInteger(targetMidi)) {
    throw new RangeError("targetMidi must be a safe integer");
  }

  const cents = 100 * (midi - targetMidi);
  return assertFiniteCents(cents);
}

function assertFiniteMidi(midi: number): void {
  if (!Number.isFinite(midi)) {
    throw new RangeError("midi must be finite");
  }
}

function assertFiniteCents(cents: number): number {
  if (!Number.isFinite(cents)) {
    throw new RangeError("cents result must be finite");
  }

  return cents === 0 ? 0 : cents;
}
