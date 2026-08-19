import { bench, describe } from "vitest";
import { DEFAULT_YIN_CONFIG } from "./dsp-config";
import { estimatePitchYin } from "./pitch-estimator";
import { advancePitchPipeline, createPitchPipelineState } from "./pitch-pipeline";
import {
  calculateYinCumulativeMeanNormalizedDifference,
  calculateYinDifference,
  refineYinCandidate,
  selectYinCandidate,
} from "./yin";

const sampleRate = 48_000;
const minTau = Math.ceil(sampleRate / 1200);
const maxTau = Math.floor(sampleRate / 65);
const frame = new Float32Array(4096);
const belowGateFrame = new Float32Array(4096);
const noiseFrame = new Float32Array(4096);
let warmedPipelineState = createPitchPipelineState();
let noiseState = 0x6d_2b_79_f5;
for (let index = 0; index < frame.length; index += 1) {
  frame[index] =
    0.05 +
    0.5 * Math.sin((2 * Math.PI * 220 * index) / sampleRate) +
    0.2 * Math.sin((2 * Math.PI * 440 * index) / sampleRate);
  belowGateFrame[index] = 0.0001 * Math.sin((2 * Math.PI * 220 * index) / sampleRate);
  noiseState = (Math.imul(noiseState, 1_664_525) + 1_013_904_223) >>> 0;
  noiseFrame[index] = (noiseState / 0x1_00_00_00_00) * 2 - 1;
}
for (let index = 0; index < 5; index += 1) {
  warmedPipelineState = advancePitchPipeline(warmedPipelineState, frame, sampleRate).state;
}

describe("YIN stages", () => {
  bench("4096-sample frame through the 65 Hz maximum lag", () => {
    calculateYinDifference(frame, maxTau + 1);
  });

  bench("4096-sample difference, CMND, search, refinement, and confidence", () => {
    const difference = calculateYinDifference(frame, maxTau + 1);
    const normalizedDifference = calculateYinCumulativeMeanNormalizedDifference(difference);
    const candidate = selectYinCandidate(normalizedDifference, minTau, maxTau, 0.12);
    refineYinCandidate(difference, normalizedDifference, candidate);
  });

  bench("4096-sample voiced estimate including RMS and gate", () => {
    estimatePitchYin(frame, sampleRate, DEFAULT_YIN_CONFIG);
  });

  bench("4096-sample high-level aperiodic estimate", () => {
    estimatePitchYin(noiseFrame, sampleRate, DEFAULT_YIN_CONFIG);
  });

  bench("4096-sample below-gate early exit", () => {
    estimatePitchYin(belowGateFrame, sampleRate, DEFAULT_YIN_CONFIG);
  });

  bench("4096-sample full stateful pitch pipeline", () => {
    advancePitchPipeline(warmedPipelineState, frame, sampleRate);
  });
});
