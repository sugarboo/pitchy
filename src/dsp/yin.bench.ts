import { bench, describe } from "vitest";
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
for (let index = 0; index < frame.length; index += 1) {
  frame[index] =
    0.05 +
    0.5 * Math.sin((2 * Math.PI * 220 * index) / sampleRate) +
    0.2 * Math.sin((2 * Math.PI * 440 * index) / sampleRate);
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
});
