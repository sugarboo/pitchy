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
  it("combines YIN, gate, octave guard, and median smoothing for a stable tone", () => {
    let state = createPitchPipelineState();
    const midi: number[] = [];

    for (let sequence = 0; sequence < 7; sequence += 1) {
      const step = advanceTone(state, 440, sequence);
      state = step.state;
      expect(step.estimate.voiced).toBe(true);
      expect(step.estimate.frequencyHz).toBeCloseTo(440, 0);
      expect(step.estimate.confidence).toBeGreaterThan(0.9);
      expect(step.estimate.rms).toBeGreaterThan(0);
      expect(step.estimate.rmsDbfs).toBeGreaterThan(DEFAULT_YIN_CONFIG.minRmsDbfs);
      if (step.estimate.midi !== null) {
        midi.push(step.estimate.midi);
      }
    }

    expect(midi).toHaveLength(7);
    expect(midi.every((value) => Math.abs(value - 69) < 0.05)).toBe(true);
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
    expect(secondJump.estimate.midi).toBeNull();
    expect(confirmedJump.estimate.midi).toBeCloseTo(81, 1);
    expect(confirmedJump.state.smoothing.recentMidi).toHaveLength(1);
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
    expect(newOnset.estimate.midi).toBeCloseTo(57, 1);
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
});
