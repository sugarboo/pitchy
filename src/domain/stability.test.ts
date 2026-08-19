import { describe, expect, it } from "vitest";
import { DEFAULT_STABILITY_CONFIG } from "../dsp/dsp-config";
import {
  advanceStabilityWindow,
  advanceSustainedNote,
  createStabilityWindowState,
  createSustainedNoteState,
  type StabilityWindowState,
  type SustainedNoteObservation,
  type SustainedNoteState,
} from "./stability";

function runStabilitySequence(
  midiAt: (timestampMs: number, index: number) => number | null,
  stepMs = 50,
  endMs = 1000,
) {
  let state = createStabilityWindowState();
  let result: ReturnType<typeof advanceStabilityWindow> | null = null;
  let index = 0;
  for (let timestampMs = 0; timestampMs <= endMs; timestampMs += stepMs) {
    result = advanceStabilityWindow(state, {
      timestampMs,
      midi: midiAt(timestampMs, index),
    });
    state = result.state;
    index += 1;
  }
  if (result === null) {
    throw new Error("stability sequence must contain observations");
  }
  return result;
}

function advanceSustained(
  state: SustainedNoteState,
  overrides: Partial<SustainedNoteObservation> = {},
) {
  return advanceSustainedNote(
    state,
    {
      timestampMs: 40,
      frameDurationMs: 40,
      rmsDbfs: -12,
      voiced: true,
      midi: 69,
      stabilityScore: 100,
      ...overrides,
    },
    -55,
  );
}

describe("stability window", () => {
  it("reports a perfect bounded score for a constant one-second pitch", () => {
    const result = runStabilitySequence(() => 69);

    expect(result.state.observations).toHaveLength(21);
    expect(result.validFrameRatio).toBe(1);
    expect(result.pitchSpreadCents).toBe(0);
    expect(result.trendCentsPerSecond).toBe(0);
    expect(result.stabilityScore).toBe(100);
  });

  it("uses robust medians so one large statistical outlier does not dominate", () => {
    const result = runStabilitySequence((_timestampMs, index) => (index === 10 ? 74 : 69));

    expect(result.pitchSpreadCents).toBe(0);
    expect(result.trendCentsPerSecond).toBe(0);
    expect(result.stabilityScore).toBe(100);
  });

  it("separates deterministic linear drift from robust pitch spread", () => {
    const result = runStabilitySequence((timestampMs) => 69 + timestampMs * 0.0006);

    expect(result.pitchSpreadCents).toBeCloseTo(15, 10);
    expect(result.trendCentsPerSecond).toBeCloseTo(60, 10);
    expect(result.stabilityScore).toBeCloseTo(40, 10);
  });

  it("keeps natural fractional vibrato finite without quantizing it", () => {
    const result = runStabilitySequence(
      (timestampMs) => 69 + 0.25 * Math.sin((2 * Math.PI * 5 * timestampMs) / 1000),
      40,
    );

    expect(result.pitchSpreadCents).toBeGreaterThan(10);
    expect(result.pitchSpreadCents).toBeLessThan(25);
    expect(Math.abs(result.trendCentsPerSecond ?? Number.POSITIVE_INFINITY)).toBeLessThan(5);
    expect(result.stabilityScore).toBeGreaterThan(70);
    expect(result.stabilityScore).toBeLessThanOrEqual(100);
  });

  it("requires enough valid frames and ratio while preserving missing evidence", () => {
    const exactlyEnough = runStabilitySequence((_timestampMs, index) => (index < 8 ? null : 69));
    const insufficientRatio = runStabilitySequence((_timestampMs, index) =>
      index < 9 ? null : 69,
    );

    expect(exactlyEnough.validFrameRatio).toBeCloseTo(13 / 21, 12);
    expect(exactlyEnough.stabilityScore).toBe(100);
    expect(insufficientRatio.validFrameRatio).toBeCloseTo(12 / 21, 12);
    expect(insufficientRatio.stabilityScore).toBeNull();
    expect(insufficientRatio.pitchSpreadCents).toBeNull();
    expect(insufficientRatio.trendCentsPerSecond).toBeNull();
  });

  it("evicts observations outside the configured time window", () => {
    const config = {
      ...DEFAULT_STABILITY_CONFIG,
      windowDurationMs: 100,
      minimumValidFrames: 2,
    };
    let state = createStabilityWindowState();
    for (const timestampMs of [0, 50, 101]) {
      state = advanceStabilityWindow(state, { timestampMs, midi: 69 }, config).state;
    }

    expect(state.observations.map((observation) => observation.timestampMs)).toEqual([50, 101]);
  });

  it("fails non-finite MIDI closed and does not mutate caller-owned history", () => {
    const state: StabilityWindowState = {
      observations: [{ timestampMs: 0, midi: 69 }],
    };
    const before = structuredClone(state);
    const result = advanceStabilityWindow(state, { timestampMs: 50, midi: Number.NaN });

    expect(state).toEqual(before);
    expect(result.state).not.toBe(state);
    expect(result.state.observations[0]).not.toBe(state.observations[0]);
    expect(result.state.observations[1]?.midi).toBeNull();
    expect(result.validFrameRatio).toBe(0.5);
  });

  it("rejects malformed state and non-monotonic or invalid timestamps", () => {
    expect(() =>
      advanceStabilityWindow(
        { observations: [{ timestampMs: 10, midi: Number.POSITIVE_INFINITY }] },
        { timestampMs: 20, midi: 69 },
      ),
    ).toThrow(RangeError);
    expect(() =>
      advanceStabilityWindow(
        { observations: [{ timestampMs: 10, midi: 69 }] },
        { timestampMs: 9, midi: 69 },
      ),
    ).toThrow(RangeError);
    expect(() =>
      advanceStabilityWindow(createStabilityWindowState(), {
        timestampMs: Number.NaN,
        midi: 69,
      }),
    ).toThrow(RangeError);
  });
});

describe("sustained-note state machine", () => {
  it("moves from onset to stable after enough continuous voiced time", () => {
    let state = createSustainedNoteState();
    let step = advanceSustained(state);
    state = step.state;
    expect(step.pitchState).toBe("onset");
    expect(step.continuousVoicedDurationMs).toBe(40);

    for (let timestampMs = 80; timestampMs <= 280; timestampMs += 40) {
      step = advanceSustained(state, { timestampMs });
      state = step.state;
      expect(step.pitchState).toBe("onset");
    }
    step = advanceSustained(state, { timestampMs: 320 });

    expect(step.pitchState).toBe("stable");
    expect(step.continuousVoicedDurationMs).toBe(320);
    expect(step.currentStableDurationMs).toBe(40);
    expect(step.minStableMidi).toBe(69);
    expect(step.maxStableMidi).toBe(69);
  });

  it("uses separate enter and exit scores to avoid boundary flicker", () => {
    const stable: SustainedNoteState = {
      previousState: "stable",
      voicedStartedAtMs: 0,
      stableStartedAtMs: 280,
      minStableMidi: 69,
      maxStableMidi: 69,
    };
    const held = advanceSustained(stable, { timestampMs: 360, stabilityScore: 65 });
    const lost = advanceSustained(held.state, { timestampMs: 400, stabilityScore: 59 });
    const regained = advanceSustained(lost.state, { timestampMs: 440, stabilityScore: 75 });

    expect(held.pitchState).toBe("stable");
    expect(held.currentStableDurationMs).toBe(80);
    expect(lost.pitchState).toBe("unstable");
    expect(lost.currentStableDurationMs).toBe(0);
    expect(regained.pitchState).toBe("stable");
    expect(regained.currentStableDurationMs).toBe(40);
  });

  it("distinguishes silence from above-floor low-confidence input", () => {
    const stableState: SustainedNoteState = {
      previousState: "stable",
      voicedStartedAtMs: 0,
      stableStartedAtMs: 280,
      minStableMidi: 68.8,
      maxStableMidi: 69.2,
    };
    const silence = advanceSustained(stableState, {
      timestampMs: 400,
      rmsDbfs: -80,
      voiced: false,
      midi: null,
      stabilityScore: null,
    });
    const lowConfidence = advanceSustained(stableState, {
      timestampMs: 400,
      rmsDbfs: -20,
      voiced: false,
      midi: null,
      stabilityScore: null,
    });

    expect(silence.pitchState).toBe("silent");
    expect(lowConfidence.pitchState).toBe("low-confidence");
    expect(silence.continuousVoicedDurationMs).toBe(0);
    expect(silence.currentStableDurationMs).toBe(0);
    expect(silence.minStableMidi).toBe(68.8);
    expect(silence.maxStableMidi).toBe(69.2);
  });

  it("keeps continuous voicing through a withheld jump but returns to onset", () => {
    const stableState: SustainedNoteState = {
      previousState: "stable",
      voicedStartedAtMs: 0,
      stableStartedAtMs: 280,
      minStableMidi: 69,
      maxStableMidi: 69,
    };
    const pending = advanceSustained(stableState, {
      timestampMs: 400,
      voiced: true,
      midi: null,
      stabilityScore: null,
    });

    expect(pending.pitchState).toBe("onset");
    expect(pending.continuousVoicedDurationMs).toBe(400);
    expect(pending.currentStableDurationMs).toBe(0);
  });

  it("tracks the stable MIDI range across phrases", () => {
    let state: SustainedNoteState = {
      previousState: "unstable",
      voicedStartedAtMs: 0,
      stableStartedAtMs: null,
      minStableMidi: null,
      maxStableMidi: null,
    };
    const values = [69, 68.75, 69.4];
    for (let index = 0; index < values.length; index += 1) {
      const step = advanceSustained(state, {
        timestampMs: 320 + index * 40,
        midi: values[index] as number,
      });
      state = step.state;
    }

    expect(state.minStableMidi).toBe(68.75);
    expect(state.maxStableMidi).toBe(69.4);
  });

  it("fails non-finite dynamic pitch evidence closed", () => {
    const result = advanceSustained(createSustainedNoteState(), {
      timestampMs: 40,
      midi: Number.NaN,
      stabilityScore: Number.POSITIVE_INFINITY,
    });

    expect(result.pitchState).toBe("onset");
    expect(result.minStableMidi).toBeNull();
    expect(result.maxStableMidi).toBeNull();
  });

  it("does not mutate state and rejects malformed state or timing evidence", () => {
    const state = createSustainedNoteState();
    const before = structuredClone(state);
    const result = advanceSustained(state);
    expect(state).toEqual(before);
    expect(result.state).not.toBe(state);

    expect(() =>
      advanceSustainedNote(
        { ...state, minStableMidi: 70, maxStableMidi: 69 },
        {
          timestampMs: 40,
          frameDurationMs: 40,
          rmsDbfs: -12,
          voiced: true,
          midi: 69,
          stabilityScore: 100,
        },
        -55,
      ),
    ).toThrow(RangeError);
    expect(() => advanceSustained(state, { timestampMs: -1 })).toThrow(RangeError);
    expect(() => advanceSustained(state, { frameDurationMs: 0 })).toThrow(RangeError);
    expect(() => advanceSustained(state, { rmsDbfs: Number.NaN })).toThrow(RangeError);
  });
});
