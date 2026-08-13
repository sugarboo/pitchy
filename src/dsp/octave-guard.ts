import {
  assertValidOctaveJumpGuardConfig,
  DEFAULT_OCTAVE_JUMP_GUARD_CONFIG,
  type OctaveJumpGuardConfig,
} from "./dsp-config";

export type OctaveJumpDirection = -1 | 1;

export interface PendingOctaveJump {
  readonly lastCandidateMidi: number;
  readonly direction: OctaveJumpDirection;
  readonly consecutiveFrames: number;
}

export interface OctaveJumpGuardState {
  readonly lastAcceptedMidi: number | null;
  readonly pendingJump: Readonly<PendingOctaveJump> | null;
}

export type OctaveJumpGuardDecision = "unvoiced" | "accepted" | "pending-jump" | "confirmed-jump";

export interface OctaveJumpGuardStep {
  readonly decision: OctaveJumpGuardDecision;
  readonly guardedMidi: number | null;
  /** Pending or unvoiced observations must not advance smoothing or stability evidence. */
  readonly observationAccepted: boolean;
  /** Reset the downstream median before inserting guardedMidi when it is non-null. */
  readonly resetSmoothing: boolean;
  readonly state: OctaveJumpGuardState;
}

export function createOctaveJumpGuardState(): OctaveJumpGuardState {
  return { lastAcceptedMidi: null, pendingJump: null };
}

/**
 * Holds an isolated large MIDI jump until a nearby, same-direction candidate
 * persists. It never folds an octave or quantizes a real observation.
 */
export function advanceOctaveJumpGuard(
  state: OctaveJumpGuardState,
  midi: number | null,
  config: OctaveJumpGuardConfig = DEFAULT_OCTAVE_JUMP_GUARD_CONFIG,
): OctaveJumpGuardStep {
  assertValidOctaveJumpGuardConfig(config);
  assertValidOctaveJumpGuardState(state, config);

  if (midi === null || !Number.isFinite(midi)) {
    return {
      decision: "unvoiced",
      guardedMidi: null,
      observationAccepted: false,
      resetSmoothing: true,
      state: createOctaveJumpGuardState(),
    };
  }

  const observedMidi = midi === 0 ? 0 : midi;
  if (state.lastAcceptedMidi === null) {
    return createAcceptedStep(observedMidi, "accepted", true);
  }

  const lastAcceptedMidi = state.lastAcceptedMidi === 0 ? 0 : state.lastAcceptedMidi;
  const jumpDelta = observedMidi - lastAcceptedMidi;
  if (Math.abs(jumpDelta) <= config.jumpThresholdSemitones) {
    return createAcceptedStep(observedMidi, "accepted", false);
  }

  const direction: OctaveJumpDirection = jumpDelta > 0 ? 1 : -1;
  const continuesPendingJump =
    state.pendingJump !== null &&
    state.pendingJump.direction === direction &&
    Math.abs(observedMidi - state.pendingJump.lastCandidateMidi) <=
      config.maxCandidateStepSemitones;
  const consecutiveFrames = continuesPendingJump ? state.pendingJump.consecutiveFrames + 1 : 1;

  if (consecutiveFrames >= config.requiredConsecutiveFrames) {
    return createAcceptedStep(observedMidi, "confirmed-jump", true);
  }

  return {
    decision: "pending-jump",
    guardedMidi: lastAcceptedMidi,
    observationAccepted: false,
    resetSmoothing: false,
    state: {
      lastAcceptedMidi,
      pendingJump: {
        lastCandidateMidi: observedMidi,
        direction,
        consecutiveFrames,
      },
    },
  };
}

function createAcceptedStep(
  midi: number,
  decision: "accepted" | "confirmed-jump",
  resetSmoothing: boolean,
): OctaveJumpGuardStep {
  return {
    decision,
    guardedMidi: midi,
    observationAccepted: true,
    resetSmoothing,
    state: { lastAcceptedMidi: midi, pendingJump: null },
  };
}

function assertValidOctaveJumpGuardState(
  state: OctaveJumpGuardState,
  config: OctaveJumpGuardConfig,
): void {
  if (typeof state !== "object" || state === null) {
    throw new RangeError("octave-guard state must be an object");
  }
  if (state.lastAcceptedMidi !== null && !Number.isFinite(state.lastAcceptedMidi)) {
    throw new RangeError("octave-guard lastAcceptedMidi must be null or finite");
  }
  if (state.pendingJump === null) {
    return;
  }
  if (state.lastAcceptedMidi === null) {
    throw new RangeError("octave-guard pending state requires an accepted MIDI reference");
  }

  const pendingJump = state.pendingJump;
  if (
    typeof pendingJump !== "object" ||
    !Number.isFinite(pendingJump.lastCandidateMidi) ||
    (pendingJump.direction !== -1 && pendingJump.direction !== 1) ||
    !Number.isSafeInteger(pendingJump.consecutiveFrames) ||
    pendingJump.consecutiveFrames < 1 ||
    pendingJump.consecutiveFrames >= config.requiredConsecutiveFrames
  ) {
    throw new RangeError("octave-guard pending jump is malformed");
  }

  const pendingDelta = pendingJump.lastCandidateMidi - state.lastAcceptedMidi;
  const pendingDirection: OctaveJumpDirection = pendingDelta > 0 ? 1 : -1;
  if (
    Math.abs(pendingDelta) <= config.jumpThresholdSemitones ||
    pendingDirection !== pendingJump.direction
  ) {
    throw new RangeError("octave-guard pending jump must remain beyond the guarded boundary");
  }
}
