import { describe, expect, it } from "vitest";
import {
  assertValidAdaptiveNoiseGateConfig,
  assertValidVoicedDecisionConfig,
  assertValidYinConfig,
  DEFAULT_ADAPTIVE_NOISE_GATE_CONFIG,
  DEFAULT_MIN_CONFIDENCE,
  DEFAULT_YIN_CONFIG,
  resolveYinTauBounds,
  type YinConfig,
} from "./dsp-config";

describe("DSP configuration", () => {
  it("keeps the documented MVP YIN defaults explicit", () => {
    expect(DEFAULT_YIN_CONFIG).toEqual({
      minFrequencyHz: 65,
      maxFrequencyHz: 1200,
      threshold: 0.12,
      frameSize: 4096,
      hopSize: 2048,
      minRmsDbfs: -55,
    });
    expect(DEFAULT_MIN_CONFIDENCE).toBe(0.9);
    expect(DEFAULT_ADAPTIVE_NOISE_GATE_CONFIG).toEqual({
      marginDb: 6,
      riseTimeMs: 2000,
      fallTimeMs: 500,
    });
  });

  it.each([
    {
      sampleRate: 44_100,
      expected: { minTau: 37, maxTau: 678, differenceMaxTau: 679 },
    },
    {
      sampleRate: 48_000,
      expected: { minTau: 40, maxTau: 738, differenceMaxTau: 739 },
    },
  ])(
    "resolves inclusive search bounds plus a guard lag at $sampleRate Hz",
    ({ sampleRate, expected }) => {
      expect(resolveYinTauBounds(sampleRate, DEFAULT_YIN_CONFIG)).toEqual(expected);
    },
  );

  it.each([
    { field: "minFrequencyHz", value: 0 },
    { field: "minFrequencyHz", value: Number.NaN },
    { field: "maxFrequencyHz", value: 65 },
    { field: "maxFrequencyHz", value: Number.POSITIVE_INFINITY },
    { field: "threshold", value: 0 },
    { field: "threshold", value: 1 },
    { field: "threshold", value: Number.NaN },
    { field: "frameSize", value: 3 },
    { field: "frameSize", value: 4096.5 },
    { field: "hopSize", value: 0 },
    { field: "hopSize", value: 4097 },
    { field: "hopSize", value: 2.5 },
    { field: "minRmsDbfs", value: Number.NaN },
  ])("rejects invalid YIN $field = $value", ({ field, value }) => {
    const config = { ...DEFAULT_YIN_CONFIG, [field]: value } as YinConfig;

    expect(() => assertValidYinConfig(config)).toThrow(RangeError);
  });

  it.each([0, -48_000, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid sampleRate %s",
    (sampleRate) => {
      expect(() => resolveYinTauBounds(sampleRate, DEFAULT_YIN_CONFIG)).toThrow(RangeError);
    },
  );

  it("rejects a range reaching Nyquist", () => {
    expect(() =>
      resolveYinTauBounds(2400, {
        ...DEFAULT_YIN_CONFIG,
        frameSize: 8192,
        hopSize: 4096,
      }),
    ).toThrow(RangeError);
  });

  it.each([
    { sampleRate: 48_000, frameSize: 1024 },
    { sampleRate: 192_000, frameSize: 4096 },
  ])(
    "rejects $sampleRate Hz / $frameSize samples when the lowest period has no guard lag",
    ({ sampleRate, frameSize }) => {
      expect(() =>
        resolveYinTauBounds(sampleRate, {
          ...DEFAULT_YIN_CONFIG,
          frameSize,
          hopSize: Math.floor(frameSize / 2),
        }),
      ).toThrow(RangeError);
    },
  );

  it.each([
    { minFrequencyHz: 0, maxFrequencyHz: 1200, minConfidence: 0.9 },
    { minFrequencyHz: 65, maxFrequencyHz: 65, minConfidence: 0.9 },
    { minFrequencyHz: 65, maxFrequencyHz: 1200, minConfidence: 0 },
    { minFrequencyHz: 65, maxFrequencyHz: 1200, minConfidence: 1 },
    { minFrequencyHz: 65, maxFrequencyHz: 1200, minConfidence: Number.NaN },
  ])("rejects invalid voiced-decision config %#", (config) => {
    expect(() => assertValidVoicedDecisionConfig(config)).toThrow(RangeError);
  });

  it.each([
    { marginDb: -1, riseTimeMs: 2000, fallTimeMs: 500 },
    { marginDb: Number.NaN, riseTimeMs: 2000, fallTimeMs: 500 },
    { marginDb: 6, riseTimeMs: 0, fallTimeMs: 500 },
    { marginDb: 6, riseTimeMs: 2000, fallTimeMs: Number.POSITIVE_INFINITY },
  ])("rejects invalid adaptive noise-gate config %#", (config) => {
    expect(() => assertValidAdaptiveNoiseGateConfig(config)).toThrow(RangeError);
  });
});
