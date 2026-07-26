import { describe, expect, it } from "vitest";
import {
  calculateAcRms,
  calculateSignalLevel,
  isSignalLevel,
  rmsToDbfs,
  SILENCE_DBFS,
} from "./rms";

function createSineWave(
  sampleRate: number,
  frequencyHz: number,
  amplitude = 1,
  dcOffset = 0,
): Float32Array {
  const samples = new Float32Array(sampleRate);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] =
      dcOffset + amplitude * Math.sin((2 * Math.PI * frequencyHz * index) / sampleRate);
  }
  return samples;
}

describe("AC RMS and approximate dBFS", () => {
  it("maps empty and silent frames to a finite silence level", () => {
    expect(calculateSignalLevel(new Float32Array())).toEqual({
      rms: 0,
      rmsDbfs: SILENCE_DBFS,
    });
    expect(calculateSignalLevel(new Float32Array(4096))).toEqual({
      rms: 0,
      rmsDbfs: SILENCE_DBFS,
    });
    expect(Number.isFinite(SILENCE_DBFS)).toBe(true);
  });

  it.each([
    { amplitude: 1, expectedDbfs: 0 },
    { amplitude: 0.5, expectedDbfs: -6.020599913279624 },
    { amplitude: 0.0001, expectedDbfs: -80 },
    { amplitude: 2, expectedDbfs: 6.020599913279624 },
  ])("measures a centered $amplitude amplitude frame", ({ amplitude, expectedDbfs }) => {
    const samples = new Float32Array([amplitude, -amplitude, amplitude, -amplitude]);
    const level = calculateSignalLevel(samples);

    expect(level.rms).toBeCloseTo(amplitude, 6);
    expect(level.rmsDbfs).toBeCloseTo(expectedDbfs, 6);
  });

  it.each([44_100, 48_000])(
    "measures a full-second 440 Hz sine at %i Hz independently of sample rate",
    (sampleRate) => {
      const level = calculateSignalLevel(createSineWave(sampleRate, 440));

      expect(level.rms).toBeCloseTo(Math.SQRT1_2, 6);
      expect(level.rmsDbfs).toBeCloseTo(-3.010299956639812, 6);
    },
  );

  it("removes DC bias before measuring the signal level", () => {
    const centered = createSineWave(48_000, 440, 0.5);
    const biased = createSineWave(48_000, 440, 0.5, 0.25);

    expect(calculateAcRms(biased)).toBeCloseTo(calculateAcRms(centered), 6);
    expect(calculateSignalLevel(new Float32Array(4096).fill(0.25))).toEqual({
      rms: 0,
      rmsDbfs: SILENCE_DBFS,
    });
  });

  it("uses the finite floor only below its representable level", () => {
    expect(rmsToDbfs(1e-9)).toBe(SILENCE_DBFS);
    expect(rmsToDbfs(1e-8)).toBe(SILENCE_DBFS);
    expect(rmsToDbfs(1e-7)).toBeCloseTo(-140, 10);
  });

  it("validates finite and internally consistent signal levels", () => {
    expect(isSignalLevel({ rms: 0, rmsDbfs: SILENCE_DBFS })).toBe(true);
    expect(isSignalLevel({ rms: 0.5, rmsDbfs: -6.020599913279624 })).toBe(true);
    expect(isSignalLevel({ rms: 0, rmsDbfs: -6 })).toBe(false);
    expect(isSignalLevel({ rms: 1, rmsDbfs: -999 })).toBe(false);
    expect(isSignalLevel({ rms: Number.NaN, rmsDbfs: SILENCE_DBFS })).toBe(false);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "fails closed for a non-finite sample (%s)",
    (invalidSample) => {
      const samples = new Float32Array([0.5, invalidSample, -0.5]);
      const level = calculateSignalLevel(samples);

      expect(level).toEqual({ rms: 0, rmsDbfs: SILENCE_DBFS });
      expect(Number.isFinite(level.rms)).toBe(true);
      expect(Number.isFinite(level.rmsDbfs)).toBe(true);
    },
  );

  it("does not mutate the input frame", () => {
    const samples = createSineWave(48_000, 440, 0.5, 0.25);
    const original = samples.slice();

    calculateSignalLevel(samples);

    expect(samples).toEqual(original);
  });
});
