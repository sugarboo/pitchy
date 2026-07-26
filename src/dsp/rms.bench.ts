import { bench, describe } from "vitest";
import { calculateSignalLevel } from "./rms";

const frame = new Float32Array(4096);
for (let index = 0; index < frame.length; index += 1) {
  frame[index] = 0.1 + 0.5 * Math.sin((2 * Math.PI * 440 * index) / 48_000);
}

describe("signal level", () => {
  bench("4096-sample AC RMS and dBFS frame", () => {
    calculateSignalLevel(frame);
  });
});
