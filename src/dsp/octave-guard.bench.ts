import { bench, describe } from "vitest";
import {
  advanceOctaveJumpGuard,
  createOctaveJumpGuardState,
  type OctaveJumpGuardState,
} from "./octave-guard";

const sequenceLength = 4096;
const stableSequenceWithErrors = Array.from({ length: sequenceLength }, (_, index) => {
  const midi = 69 + 0.2 * Math.sin((2 * Math.PI * index) / 37);
  const burstIndex = index % 64;
  if (burstIndex === 20 || burstIndex === 21) {
    return midi + (Math.floor(index / 64) % 2 === 0 ? 12 : -12);
  }
  return midi;
});
const mixedSequence = Array.from({ length: sequenceLength }, (_, index) => {
  const cycleIndex = index % 64;
  if (cycleIndex === 0) {
    return null;
  }
  if (cycleIndex <= 20) {
    return 60 + cycleIndex * 0.05;
  }
  if (cycleIndex === 21) {
    return 72;
  }
  if (cycleIndex === 22) {
    return 73.5;
  }
  if (cycleIndex === 23) {
    return 72.2;
  }
  if (cycleIndex <= 40) {
    return 72.2 + (cycleIndex - 23) * 0.025;
  }
  return cycleIndex % 2 === 0 ? 84 : 60;
});

function processSequence(sequence: readonly (number | null)[]): number {
  let state: OctaveJumpGuardState = createOctaveJumpGuardState();
  let checksum = 0;

  for (const midi of sequence) {
    const step = advanceOctaveJumpGuard(state, midi);
    checksum += step.guardedMidi ?? 0;
    checksum += step.observationAccepted ? 1 : 0;
    state = step.state;
  }

  return checksum + (state.lastAcceptedMidi ?? 0) + (state.pendingJump?.consecutiveFrames ?? 0);
}

describe("octave jump guard", () => {
  bench("4096-frame vibrato with isolated octave-error bursts", () => {
    const checksum = processSequence(stableSequenceWithErrors);
    if (!Number.isFinite(checksum)) {
      throw new Error("non-finite octave-guard benchmark checksum");
    }
  });

  bench("4096-frame mixed jumps, reversals, glides, and unvoiced resets", () => {
    const checksum = processSequence(mixedSequence);
    if (!Number.isFinite(checksum)) {
      throw new Error("non-finite octave-guard benchmark checksum");
    }
  });
});
