import { describe, expect, it } from "vitest";
import { frequencyHzToMidi } from "../domain/tuning";
import { createSineFrame } from "../test/signal-generators";
import {
  DEFAULT_OCTAVE_JUMP_GUARD_CONFIG,
  DEFAULT_YIN_CONFIG,
  type OctaveJumpGuardConfig,
} from "./dsp-config";
import {
  advanceOctaveJumpGuard,
  createOctaveJumpGuardState,
  type OctaveJumpGuardState,
  type OctaveJumpGuardStep,
} from "./octave-guard";
import { estimatePitchYin } from "./pitch-estimator";
import {
  advanceTemporalMedianFilter,
  createTemporalMedianFilterState,
  type TemporalMedianFilterState,
} from "./smoothing";

function runSequence(
  values: readonly (number | null)[],
  config: OctaveJumpGuardConfig = DEFAULT_OCTAVE_JUMP_GUARD_CONFIG,
): {
  readonly steps: readonly OctaveJumpGuardStep[];
  readonly state: OctaveJumpGuardState;
} {
  let state = createOctaveJumpGuardState();
  const steps: OctaveJumpGuardStep[] = [];

  for (const value of values) {
    const step = advanceOctaveJumpGuard(state, value, config);
    steps.push(step);
    state = step.state;
  }

  return { steps, state };
}

describe("octave jump guard", () => {
  it("accepts the first pitch and continuous fractional motion without quantizing", () => {
    const input = [69, 69.125, 68.875, 69.25];
    const { steps } = runSequence(input);

    expect(steps.map((step) => step.guardedMidi)).toEqual(input);
    expect(steps.map((step) => step.decision)).toEqual([
      "accepted",
      "accepted",
      "accepted",
      "accepted",
    ]);
    expect(steps[0]?.resetSmoothing).toBe(true);
    expect(steps.slice(1).every((step) => !step.resetSmoothing)).toBe(true);
  });

  it.each([
    { name: "double-frequency", errorMidi: 81 },
    { name: "half-frequency", errorMidi: 57 },
  ])("holds one $name error and clears it when the reference returns", ({ errorMidi }) => {
    const { steps, state } = runSequence([69, errorMidi, 69]);

    expect(steps.map((step) => step.guardedMidi)).toEqual([69, 69, 69]);
    expect(steps.map((step) => step.decision)).toEqual(["accepted", "pending-jump", "accepted"]);
    expect(steps[1]?.observationAccepted).toBe(false);
    expect(steps[1]?.resetSmoothing).toBe(false);
    expect(state).toEqual({ lastAcceptedMidi: 69, pendingJump: null });
  });

  it.each([
    { input: [60, 72, 73.5, 72.2], acceptedMidi: 72.2 },
    { input: [72, 60, 58.5, 59.8], acceptedMidi: 59.8 },
  ])(
    "accepts a persistent large jump on the configured confirmation frame",
    ({ input, acceptedMidi }) => {
      const { steps, state } = runSequence(input);

      expect(steps.slice(1, -1).every((step) => step.decision === "pending-jump")).toBe(true);
      expect(steps.at(-1)).toMatchObject({
        decision: "confirmed-jump",
        guardedMidi: acceptedMidi,
        observationAccepted: true,
        resetSmoothing: true,
      });
      expect(state).toEqual({ lastAcceptedMidi: acceptedMidi, pendingJump: null });
    },
  );

  it("supports the planned two-frame confirmation alternative", () => {
    const config = { ...DEFAULT_OCTAVE_JUMP_GUARD_CONFIG, requiredConsecutiveFrames: 2 };
    const { steps } = runSequence([60, 72, 71.5], config);

    expect(steps.map((step) => step.guardedMidi)).toEqual([60, 60, 71.5]);
    expect(steps.at(-1)?.decision).toBe("confirmed-jump");
  });

  it("restarts confirmation when a candidate leaves the configured cluster", () => {
    const { steps } = runSequence([60, 72, 75, 74, 73.5]);

    expect(steps.slice(1).map((step) => step.state.pendingJump?.consecutiveFrames ?? 0)).toEqual([
      1, 1, 2, 0,
    ]);
    expect(steps.at(-1)).toMatchObject({
      decision: "confirmed-jump",
      guardedMidi: 73.5,
    });
  });

  it("includes the candidate-step boundary but restarts just beyond it", () => {
    const atBoundary = runSequence([60, 72, 74, 76]);
    const beyondBoundary = runSequence([60, 72, 74.001]);

    expect(atBoundary.steps.at(-1)?.decision).toBe("confirmed-jump");
    expect(atBoundary.steps.at(-1)?.guardedMidi).toBe(76);
    expect(beyondBoundary.state.pendingJump?.consecutiveFrames).toBe(1);
  });

  it("does not accumulate confirmations across direction reversals", () => {
    const { steps, state } = runSequence([60, 72, 48, 72, 48]);

    expect(steps.slice(1).every((step) => step.decision === "pending-jump")).toBe(true);
    expect(steps.slice(1).every((step) => step.guardedMidi === 60)).toBe(true);
    expect(state.pendingJump?.consecutiveFrames).toBe(1);
  });

  it("accepts exactly seven semitones but guards values strictly beyond it", () => {
    expect(runSequence([60, 67]).steps.at(-1)?.decision).toBe("accepted");
    expect(runSequence([60, 53]).steps.at(-1)?.decision).toBe("accepted");
    expect(runSequence([60, 67.001]).steps.at(-1)?.decision).toBe("pending-jump");
    expect(runSequence([60, 52.999]).steps.at(-1)?.decision).toBe("pending-jump");
  });

  it("accepts a normal candidate immediately after abandoning a pending jump", () => {
    const { steps, state } = runSequence([60, 72, 65]);

    expect(steps.map((step) => step.guardedMidi)).toEqual([60, 60, 65]);
    expect(steps.at(-1)?.decision).toBe("accepted");
    expect(state).toEqual({ lastAcceptedMidi: 65, pendingJump: null });
  });

  it("resets pending evidence at silence and accepts any new onset immediately", () => {
    const { steps, state } = runSequence([60, 72, 72.1, null, 84]);

    expect(steps.map((step) => step.guardedMidi)).toEqual([60, 60, 60, null, 84]);
    expect(steps[3]).toMatchObject({
      decision: "unvoiced",
      observationAccepted: false,
      resetSmoothing: true,
    });
    expect(steps[4]).toMatchObject({
      decision: "accepted",
      guardedMidi: 84,
      observationAccepted: true,
      resetSmoothing: true,
    });
    expect(state).toEqual({ lastAcceptedMidi: 84, pendingJump: null });
  });

  it("freezes median history while pending and resets it before a confirmed jump", () => {
    let guardState = createOctaveJumpGuardState();
    let medianState: TemporalMedianFilterState = createTemporalMedianFilterState();

    for (let index = 0; index < 5; index += 1) {
      const guardStep = advanceOctaveJumpGuard(guardState, 69);
      if (guardStep.resetSmoothing) {
        medianState = createTemporalMedianFilterState();
      }
      const medianStep = advanceTemporalMedianFilter(medianState, guardStep.guardedMidi);
      guardState = guardStep.state;
      medianState = medianStep.state;
    }

    const filledMedianState = medianState;
    for (const candidateMidi of [81, 81.1]) {
      const pendingStep = advanceOctaveJumpGuard(guardState, candidateMidi);

      expect(pendingStep).toMatchObject({
        decision: "pending-jump",
        observationAccepted: false,
        resetSmoothing: false,
      });
      expect(medianState).toBe(filledMedianState);
      guardState = pendingStep.state;
    }

    const confirmedStep = advanceOctaveJumpGuard(guardState, 80.9);
    expect(confirmedStep).toMatchObject({
      decision: "confirmed-jump",
      guardedMidi: 80.9,
      observationAccepted: true,
      resetSmoothing: true,
    });
    medianState = createTemporalMedianFilterState();
    const restartedMedian = advanceTemporalMedianFilter(medianState, confirmedStep.guardedMidi);
    expect(restartedMedian).toEqual({
      smoothedMidi: 80.9,
      state: { recentMidi: [80.9] },
    });
    medianState = restartedMedian.state;

    const unvoicedStep = advanceOctaveJumpGuard(confirmedStep.state, null);
    if (unvoicedStep.resetSmoothing) {
      medianState = createTemporalMedianFilterState();
    }
    expect(unvoicedStep.guardedMidi).toBeNull();
    expect(unvoicedStep.state).toEqual(createOctaveJumpGuardState());
    expect(medianState).toEqual(createTemporalMedianFilterState());
  });

  it("passes a gradual two-octave glissando as continuous MIDI", () => {
    const input = Array.from({ length: 97 }, (_, index) => 60 + index * 0.25);
    const { steps } = runSequence(input);

    expect(steps.map((step) => step.guardedMidi)).toEqual(input);
    expect(steps.every((step) => Number.isFinite(step.guardedMidi))).toBe(true);
    expect(steps.every((step) => step.decision === "accepted")).toBe(true);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "fails closed and resets for non-finite observation %s",
    (midi) => {
      const pendingState = runSequence([69, 81, 81.1]).state;
      const reset = advanceOctaveJumpGuard(pendingState, midi);
      const resumed = advanceOctaveJumpGuard(reset.state, 84);

      expect(reset).toEqual({
        decision: "unvoiced",
        guardedMidi: null,
        observationAccepted: false,
        resetSmoothing: true,
        state: createOctaveJumpGuardState(),
      });
      expect(resumed).toMatchObject({ decision: "accepted", guardedMidi: 84 });
    },
  );

  it("keeps every output finite across the largest finite MIDI jump", () => {
    const { steps } = runSequence([
      Number.MAX_VALUE,
      -Number.MAX_VALUE,
      -Number.MAX_VALUE,
      -Number.MAX_VALUE,
    ]);

    expect(steps.every((step) => Number.isFinite(step.guardedMidi))).toBe(true);
    expect(steps.at(-1)).toMatchObject({
      decision: "confirmed-jump",
      guardedMidi: -Number.MAX_VALUE,
    });
  });

  it("keeps the guarded octave-error rate below one percent", () => {
    const expected = Array.from(
      { length: 4096 },
      (_, index) => 69 + 0.2 * Math.sin((2 * Math.PI * index) / 37),
    );
    const observed = expected.map((midi, index) => {
      const burstIndex = index % 64;
      if (burstIndex === 20 || burstIndex === 21) {
        return midi + (Math.floor(index / 64) % 2 === 0 ? 12 : -12);
      }
      return midi;
    });
    const { steps } = runSequence(observed);
    const erroneousFrames = steps.filter((step, index) => {
      const guardedMidi = step.guardedMidi;
      return guardedMidi === null || Math.abs(guardedMidi - (expected[index] as number)) >= 6;
    }).length;

    expect(erroneousFrames / expected.length).toBeLessThan(0.01);
  });

  it.each([
    { sampleRate: 44_100, frequencyHz: 110 },
    { sampleRate: 44_100, frequencyHz: 220 },
    { sampleRate: 44_100, frequencyHz: 440 },
    { sampleRate: 44_100, frequencyHz: 880 },
    { sampleRate: 48_000, frequencyHz: 110 },
    { sampleRate: 48_000, frequencyHz: 220 },
    { sampleRate: 48_000, frequencyHz: 440 },
    { sampleRate: 48_000, frequencyHz: 880 },
  ])(
    "keeps 128 continuous $frequencyHz Hz YIN frames below one percent octave errors at $sampleRate Hz",
    ({ sampleRate, frequencyHz }) => {
      const expectedMidi = frequencyHzToMidi(frequencyHz);
      let state = createOctaveJumpGuardState();
      let erroneousFrames = 0;

      for (let frameIndex = 0; frameIndex < 128; frameIndex += 1) {
        const estimate = estimatePitchYin(
          createSineFrame({
            sampleRate,
            frequencyHz,
            startSample: frameIndex * DEFAULT_YIN_CONFIG.hopSize,
          }),
          sampleRate,
          DEFAULT_YIN_CONFIG,
        );
        if (!estimate.voiced || estimate.frequencyHz === null) {
          erroneousFrames += 1;
          state = advanceOctaveJumpGuard(state, null).state;
          continue;
        }

        const step = advanceOctaveJumpGuard(state, frequencyHzToMidi(estimate.frequencyHz));
        if (step.guardedMidi === null || Math.abs(step.guardedMidi - expectedMidi) >= 6) {
          erroneousFrames += 1;
        }
        state = step.state;
      }

      expect(erroneousFrames / 128).toBeLessThan(0.01);
    },
  );

  it("does not mutate input state or share pending objects", () => {
    const pendingJump = Object.freeze({
      lastCandidateMidi: 81,
      direction: 1 as const,
      consecutiveFrames: 1,
    });
    const state = Object.freeze({ lastAcceptedMidi: 69, pendingJump });
    const step = advanceOctaveJumpGuard(state, 81.2);
    const firstInitial = createOctaveJumpGuardState();
    const secondInitial = createOctaveJumpGuardState();

    expect(state).toEqual({ lastAcceptedMidi: 69, pendingJump });
    expect(step.state).not.toBe(state);
    expect(step.state.pendingJump).not.toBe(pendingJump);
    expect(firstInitial).not.toBe(secondInitial);
  });

  it("rejects malformed state", () => {
    const invalidStates = [
      { lastAcceptedMidi: Number.NaN, pendingJump: null },
      {
        lastAcceptedMidi: null,
        pendingJump: { lastCandidateMidi: 81, direction: 1, consecutiveFrames: 1 },
      },
      {
        lastAcceptedMidi: 69,
        pendingJump: { lastCandidateMidi: 81, direction: 0, consecutiveFrames: 1 },
      },
      {
        lastAcceptedMidi: 69,
        pendingJump: { lastCandidateMidi: 81, direction: 1, consecutiveFrames: 3 },
      },
      {
        lastAcceptedMidi: 69,
        pendingJump: { lastCandidateMidi: 70, direction: 1, consecutiveFrames: 1 },
      },
    ];

    for (const state of invalidStates) {
      expect(() => advanceOctaveJumpGuard(state as OctaveJumpGuardState, 69)).toThrow(RangeError);
    }
  });
});
