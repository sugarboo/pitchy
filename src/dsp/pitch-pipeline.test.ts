import { describe, expect, it } from "vitest";
import { DEFAULT_YIN_CONFIG } from "./dsp-config";
import {
  advancePitchPipeline,
  createPitchPipelineState,
  type PitchPipelineState,
} from "./pitch-pipeline";

function createSineFrame(frequencyHz: number, startSample: number, amplitude = 0.6): Float32Array {
  return Float32Array.from({ length: DEFAULT_YIN_CONFIG.frameSize }, (_, index) =>
    Math.fround(amplitude * Math.sin((2 * Math.PI * frequencyHz * (startSample + index)) / 48_000)),
  );
}

function advanceTone(
  state: PitchPipelineState,
  frequencyHz: number,
  sequence: number,
): ReturnType<typeof advancePitchPipeline> {
  return advancePitchPipeline(
    state,
    createSineFrame(frequencyHz, sequence * DEFAULT_YIN_CONFIG.hopSize),
    48_000,
  );
}

describe("stateful pitch pipeline", () => {
  it("combines pitch tracking with one-second stability and sustained-note state", () => {
    let state = createPitchPipelineState();
    const midi: number[] = [];
    let finalStep: ReturnType<typeof advancePitchPipeline> | null = null;

    for (let sequence = 0; sequence < 12; sequence += 1) {
      const step = advanceTone(state, 440, sequence);
      state = step.state;
      finalStep = step;
      expect(step.estimate.voiced).toBe(true);
      expect(step.estimate.frequencyHz).toBeCloseTo(440, 0);
      expect(step.estimate.confidence).toBeGreaterThan(0.9);
      expect(step.estimate.rms).toBeGreaterThan(0);
      expect(step.estimate.rmsDbfs).toBeGreaterThan(DEFAULT_YIN_CONFIG.minRmsDbfs);
      if (step.estimate.midi !== null) {
        midi.push(step.estimate.midi);
      }
    }

    expect(midi).toHaveLength(12);
    expect(midi.every((value) => Math.abs(value - 69) < 0.05)).toBe(true);
    expect(finalStep?.estimate.validFrameRatio).toBe(1);
    expect(finalStep?.estimate.state).toBe("stable");
    expect(finalStep?.estimate.stabilityScore).toBeGreaterThan(99.9);
    expect(finalStep?.estimate.pitchSpreadCents).toBeLessThan(0.01);
    expect(Math.abs(finalStep?.estimate.trendCentsPerSecond ?? 1)).toBeLessThan(0.01);
    expect(finalStep?.estimate.continuousVoicedDurationMs).toBeCloseTo(512, 10);
    expect(finalStep?.estimate.currentStableDurationMs).toBeGreaterThan(0);
    expect(finalStep?.estimate.minStableMidi).toBeCloseTo(69, 1);
    expect(finalStep?.estimate.maxStableMidi).toBeCloseTo(69, 1);
  });

  it("withholds a large jump until confirmation, then resets smoothing before accepting it", () => {
    let state = createPitchPipelineState();
    for (let sequence = 0; sequence < 5; sequence += 1) {
      const step = advanceTone(state, 440, sequence);
      state = step.state;
    }

    const firstJump = advanceTone(state, 880, 5);
    const secondJump = advanceTone(firstJump.state, 880, 6);
    const confirmedJump = advanceTone(secondJump.state, 880, 7);

    expect(firstJump.estimate.voiced).toBe(true);
    expect(firstJump.estimate.midi).toBeNull();
    expect(firstJump.estimate.state).toBe("onset");
    expect(firstJump.state.stability.observations.at(-1)?.midi).toBeNull();
    expect(secondJump.estimate.midi).toBeNull();
    expect(confirmedJump.estimate.midi).toBeCloseTo(81, 1);
    expect(confirmedJump.estimate.stabilityScore).toBeNull();
    expect(confirmedJump.estimate.state).toBe("onset");
    expect(confirmedJump.state.smoothing.recentMidi).toHaveLength(1);
    expect(confirmedJump.state.stability.observations).toHaveLength(1);
    expect(confirmedJump.state.stability.observations[0]?.midi).toBeCloseTo(81, 1);
  });

  it("emits a gap and clears temporal state at silence before accepting a new onset", () => {
    const tone = advanceTone(createPitchPipelineState(), 440, 0);
    const silence = advancePitchPipeline(
      tone.state,
      new Float32Array(DEFAULT_YIN_CONFIG.frameSize),
      48_000,
    );
    const newOnset = advanceTone(silence.state, 220, 2);

    expect(silence.estimate).toMatchObject({
      frequencyHz: null,
      confidence: 0,
      voiced: false,
      midi: null,
    });
    expect(silence.state.octaveGuard.lastAcceptedMidi).toBeNull();
    expect(silence.state.smoothing.recentMidi).toEqual([]);
    expect(silence.state.stability.observations).toEqual([]);
    expect(silence.estimate).toMatchObject({
      stabilityScore: null,
      validFrameRatio: 0,
      continuousVoicedDurationMs: 0,
      currentStableDurationMs: 0,
      state: "silent",
    });
    expect(newOnset.estimate.midi).toBeCloseTo(57, 1);
    expect(newOnset.estimate.state).toBe("onset");
  });

  it("does not mutate caller-owned state or PCM", () => {
    const state = createPitchPipelineState();
    const stateBefore = structuredClone(state);
    const frame = createSineFrame(440, 0);
    const frameBefore = frame.slice();

    const step = advancePitchPipeline(state, frame, 48_000);

    expect(state).toEqual(stateBefore);
    expect(frame).toEqual(frameBefore);
    expect(step.state).not.toBe(state);
  });

  it("rejects invalid or regressing timing without mutating inputs", () => {
    const state = createPitchPipelineState();
    const frame = createSineFrame(440, 0);

    expect(() =>
      advancePitchPipeline(state, frame, 48_000, DEFAULT_YIN_CONFIG, {
        elapsedMs: 0,
        timestampMs: 10,
      }),
    ).toThrow(RangeError);

    const first = advancePitchPipeline(state, frame, 48_000, DEFAULT_YIN_CONFIG, {
      elapsedMs: 40,
      timestampMs: 100,
    });
    expect(() =>
      advancePitchPipeline(first.state, frame, 48_000, DEFAULT_YIN_CONFIG, {
        elapsedMs: 40,
        timestampMs: 99,
      }),
    ).toThrow(RangeError);
  });
});
