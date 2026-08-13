import { describe, expect, it } from "vitest";
import {
  addSignals,
  createDeterministicWhiteNoise,
  createHarmonicFrame,
  createSineFrame,
} from "../test/signal-generators";
import { DEFAULT_MIN_CONFIDENCE, DEFAULT_YIN_CONFIG } from "./dsp-config";
import {
  advanceAdaptiveNoiseGate,
  calculateNoiseGateThreshold,
  createAdaptiveNoiseGateState,
} from "./noise-gate";
import { decideVoiced, estimatePitchYin, type VoicedDecisionEvidence } from "./pitch-estimator";
import { SILENCE_DBFS } from "./rms";

const VOICED_CONFIG = {
  minFrequencyHz: DEFAULT_YIN_CONFIG.minFrequencyHz,
  maxFrequencyHz: DEFAULT_YIN_CONFIG.maxFrequencyHz,
  minConfidence: DEFAULT_MIN_CONFIDENCE,
};

const VALID_EVIDENCE: VoicedDecisionEvidence = {
  rmsDbfs: -20,
  noiseGateDbfs: -55,
  periodicCandidateFound: true,
  confidence: 0.95,
  frequencyHz: 440,
};

function centsError(actualHz: number, expectedHz: number): number {
  return 1200 * Math.log2(actualHz / expectedHz);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted[middle] as number;
}

describe("voiced decision", () => {
  it("requires gate, candidate, confidence, and frequency-range evidence together", () => {
    expect(decideVoiced(VALID_EVIDENCE, VOICED_CONFIG)).toBe(true);
  });

  it.each([
    { evidence: { rmsDbfs: -55 }, reason: "RMS equal to the gate" },
    { evidence: { rmsDbfs: -56 }, reason: "RMS below the gate" },
    { evidence: { periodicCandidateFound: false }, reason: "missing periodic candidate" },
    { evidence: { confidence: DEFAULT_MIN_CONFIDENCE }, reason: "confidence equal to minimum" },
    { evidence: { confidence: 0.89 }, reason: "confidence below minimum" },
    { evidence: { frequencyHz: 64.999 }, reason: "frequency below range" },
    { evidence: { frequencyHz: 1200.001 }, reason: "frequency above range" },
    { evidence: { frequencyHz: null }, reason: "missing frequency" },
  ])("rejects $reason even when every other condition passes", ({ evidence }) => {
    expect(decideVoiced({ ...VALID_EVIDENCE, ...evidence }, VOICED_CONFIG)).toBe(false);
  });

  it("includes both configured frequency endpoints", () => {
    expect(decideVoiced({ ...VALID_EVIDENCE, frequencyHz: 65 }, VOICED_CONFIG)).toBe(true);
    expect(decideVoiced({ ...VALID_EVIDENCE, frequencyHz: 1200 }, VOICED_CONFIG)).toBe(true);
  });

  it.each([
    { field: "rmsDbfs", value: Number.NaN },
    { field: "noiseGateDbfs", value: Number.POSITIVE_INFINITY },
    { field: "confidence", value: Number.NaN },
    { field: "confidence", value: 1.01 },
    { field: "frequencyHz", value: Number.NEGATIVE_INFINITY },
  ])("fails closed for non-physical $field evidence", ({ field, value }) => {
    expect(
      decideVoiced({ ...VALID_EVIDENCE, [field]: value } as VoicedDecisionEvidence, VOICED_CONFIG),
    ).toBe(false);
  });
});

describe("single-frame YIN pitch estimator", () => {
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
    "keeps continuous $frequencyHz Hz frames within five cents at $sampleRate Hz",
    ({ sampleRate, frequencyHz }) => {
      const errors: number[] = [];

      for (let frameIndex = 0; frameIndex < 5; frameIndex += 1) {
        const frame = createSineFrame({
          sampleRate,
          frequencyHz,
          startSample: frameIndex * DEFAULT_YIN_CONFIG.hopSize,
        });
        const estimate = estimatePitchYin(frame, sampleRate, DEFAULT_YIN_CONFIG);

        expect(estimate.voiced).toBe(true);
        expect(estimate.frequencyHz).not.toBeNull();
        expect(estimate.confidence).toBeGreaterThan(DEFAULT_MIN_CONFIDENCE);
        expect(estimate.periodicCandidateFound).toBe(true);
        expect(Number.isFinite(estimate.rms)).toBe(true);
        expect(Number.isFinite(estimate.rmsDbfs)).toBe(true);
        errors.push(centsError(estimate.frequencyHz as number, frequencyHz));
      }

      expect(Math.abs(median(errors))).toBeLessThanOrEqual(5);
      expect(errors.every((error) => Math.abs(error) <= 5)).toBe(true);
    },
  );

  it("returns canonical unvoiced results for silence and constant DC", () => {
    const silence = estimatePitchYin(new Float32Array(4096), 48_000, DEFAULT_YIN_CONFIG);
    const constantDc = estimatePitchYin(
      new Float32Array(4096).fill(0.25),
      48_000,
      DEFAULT_YIN_CONFIG,
    );

    expect(silence).toEqual({
      rms: 0,
      rmsDbfs: SILENCE_DBFS,
      frequencyHz: null,
      confidence: 0,
      periodicCandidateFound: false,
      voiced: false,
    });
    expect(constantDc).toEqual(silence);
  });

  it("rejects a strongly periodic tone below the minimum RMS gate", () => {
    const estimate = estimatePitchYin(
      createSineFrame({ sampleRate: 48_000, frequencyHz: 440, amplitude: 0.0001 }),
      48_000,
      DEFAULT_YIN_CONFIG,
    );

    expect(estimate.rmsDbfs).toBeLessThan(DEFAULT_YIN_CONFIG.minRmsDbfs);
    expect(estimate).toMatchObject({ frequencyHz: null, confidence: 0, voiced: false });
  });

  it("rejects high-level deterministic white noise without hiding its independent evidence", () => {
    const estimate = estimatePitchYin(
      createDeterministicWhiteNoise(4096, 0.5),
      48_000,
      DEFAULT_YIN_CONFIG,
    );

    expect(estimate.rmsDbfs).toBeGreaterThan(DEFAULT_YIN_CONFIG.minRmsDbfs);
    expect(estimate.frequencyHz).toBeNull();
    expect(estimate.voiced).toBe(false);
    expect(estimate.periodicCandidateFound).toBe(false);
    expect(estimate.confidence).toBeGreaterThanOrEqual(0);
    expect(estimate.confidence).toBeLessThan(DEFAULT_MIN_CONFIDENCE);
    expect(Number.isFinite(estimate.confidence)).toBe(true);
  });

  it("remains accurate for a fundamental-dominant harmonic signal", () => {
    const frequencyHz = 220;
    const estimate = estimatePitchYin(
      createHarmonicFrame({
        sampleRate: 48_000,
        fundamentalHz: frequencyHz,
        partials: [
          { multiple: 1, amplitude: 0.45 },
          { multiple: 2, amplitude: 0.2, phaseRadians: 0.3 },
          { multiple: 3, amplitude: 0.1, phaseRadians: -0.2 },
        ],
      }),
      48_000,
      DEFAULT_YIN_CONFIG,
    );

    expect(estimate.voiced).toBe(true);
    expect(Math.abs(centsError(estimate.frequencyHz as number, frequencyHz))).toBeLessThanOrEqual(
      5,
    );
  });

  it("retains a tone with deterministic additive noise at a comfortable SNR", () => {
    const frequencyHz = 440;
    const frame = addSignals(
      createSineFrame({ sampleRate: 48_000, frequencyHz, amplitude: 0.4 }),
      createDeterministicWhiteNoise(4096, 0.015),
    );
    const estimate = estimatePitchYin(frame, 48_000, DEFAULT_YIN_CONFIG);

    expect(estimate.voiced).toBe(true);
    expect(Math.abs(centsError(estimate.frequencyHz as number, frequencyHz))).toBeLessThanOrEqual(
      5,
    );
  });

  it("is insensitive to a constant DC offset within Float32 precision", () => {
    const centered = createSineFrame({ sampleRate: 48_000, frequencyHz: 440, amplitude: 0.4 });
    const biased = createSineFrame({
      sampleRate: 48_000,
      frequencyHz: 440,
      amplitude: 0.4,
      dcOffset: 0.25,
    });
    const centeredEstimate = estimatePitchYin(centered, 48_000, DEFAULT_YIN_CONFIG);
    const biasedEstimate = estimatePitchYin(biased, 48_000, DEFAULT_YIN_CONFIG);

    expect(biasedEstimate.voiced).toBe(true);
    expect(biasedEstimate.rmsDbfs).toBeCloseTo(centeredEstimate.rmsDbfs, 6);
    expect(biasedEstimate.frequencyHz).toBeCloseTo(centeredEstimate.frequencyHz as number, 4);
  });

  it("allows an adaptive threshold to raise but never lower the minimum gate", () => {
    const ordinaryTone = createSineFrame({
      sampleRate: 48_000,
      frequencyHz: 440,
      amplitude: 0.5,
    });
    const quietTone = createSineFrame({
      sampleRate: 48_000,
      frequencyHz: 440,
      amplitude: 0.001,
    });

    expect(
      estimatePitchYin(ordinaryTone, 48_000, DEFAULT_YIN_CONFIG, { noiseGateDbfs: -5 }),
    ).toMatchObject({ frequencyHz: null, periodicCandidateFound: true, voiced: false });
    expect(
      estimatePitchYin(quietTone, 48_000, DEFAULT_YIN_CONFIG, { noiseGateDbfs: -80 }),
    ).toMatchObject({ frequencyHz: null, confidence: 0, voiced: false });
  });

  it("exposes candidate evidence so an external adaptive gate can learn without hidden state", () => {
    const frame = createDeterministicWhiteNoise(4096, 0.5);
    const fastTestGateConfig = { marginDb: 6, riseTimeMs: 50, fallTimeMs: 50 };
    const elapsedMs = (DEFAULT_YIN_CONFIG.hopSize / 48_000) * 1000;
    let state = createAdaptiveNoiseGateState();
    let estimate = estimatePitchYin(frame, 48_000, DEFAULT_YIN_CONFIG);
    expect(estimate.periodicCandidateFound).toBe(false);

    for (let frameIndex = 0; frameIndex < 8; frameIndex += 1) {
      const threshold = calculateNoiseGateThreshold(
        state,
        DEFAULT_YIN_CONFIG.minRmsDbfs,
        fastTestGateConfig,
      );
      estimate = estimatePitchYin(frame, 48_000, DEFAULT_YIN_CONFIG, {
        noiseGateDbfs: threshold,
      });
      state = advanceAdaptiveNoiseGate(
        state,
        {
          rmsDbfs: estimate.rmsDbfs,
          periodicCandidateFound: estimate.periodicCandidateFound,
        },
        elapsedMs,
        DEFAULT_YIN_CONFIG.minRmsDbfs,
        fastTestGateConfig,
      ).state;
    }

    expect(estimate).toMatchObject({
      frequencyHz: null,
      periodicCandidateFound: false,
      voiced: false,
    });
    expect(estimate.confidence).toBeGreaterThanOrEqual(0);
    expect(estimate.confidence).toBeLessThan(DEFAULT_MIN_CONFIDENCE);
  });

  it("recovers a quieter periodic signal after an aperiodic burst without requiring silence", () => {
    const fastTestGateConfig = { marginDb: 6, riseTimeMs: 50, fallTimeMs: 50 };
    const elapsedMs = (DEFAULT_YIN_CONFIG.hopSize / 48_000) * 1000;
    const noise = createDeterministicWhiteNoise(4096, 0.5);
    const quietTone = createSineFrame({
      sampleRate: 48_000,
      frequencyHz: 440,
      amplitude: 0.05,
    });
    let state = createAdaptiveNoiseGateState();

    for (let frameIndex = 0; frameIndex < 8; frameIndex += 1) {
      const threshold = calculateNoiseGateThreshold(
        state,
        DEFAULT_YIN_CONFIG.minRmsDbfs,
        fastTestGateConfig,
      );
      const estimate = estimatePitchYin(noise, 48_000, DEFAULT_YIN_CONFIG, {
        noiseGateDbfs: threshold,
      });
      state = advanceAdaptiveNoiseGate(
        state,
        {
          rmsDbfs: estimate.rmsDbfs,
          periodicCandidateFound: estimate.periodicCandidateFound,
        },
        elapsedMs,
        DEFAULT_YIN_CONFIG.minRmsDbfs,
        fastTestGateConfig,
      ).state;
    }

    const elevatedThreshold = calculateNoiseGateThreshold(
      state,
      DEFAULT_YIN_CONFIG.minRmsDbfs,
      fastTestGateConfig,
    );
    let recovered = estimatePitchYin(quietTone, 48_000, DEFAULT_YIN_CONFIG, {
      noiseGateDbfs: elevatedThreshold,
    });
    expect(elevatedThreshold).toBeGreaterThan(recovered.rmsDbfs);
    expect(recovered).toMatchObject({ periodicCandidateFound: true, voiced: false });

    for (let frameIndex = 0; frameIndex < 8; frameIndex += 1) {
      const threshold = calculateNoiseGateThreshold(
        state,
        DEFAULT_YIN_CONFIG.minRmsDbfs,
        fastTestGateConfig,
      );
      recovered = estimatePitchYin(quietTone, 48_000, DEFAULT_YIN_CONFIG, {
        noiseGateDbfs: threshold,
      });
      state = advanceAdaptiveNoiseGate(
        state,
        {
          rmsDbfs: recovered.rmsDbfs,
          periodicCandidateFound: recovered.periodicCandidateFound,
        },
        elapsedMs,
        DEFAULT_YIN_CONFIG.minRmsDbfs,
        fastTestGateConfig,
      ).state;
      if (recovered.voiced) {
        break;
      }
    }
    expect(recovered).toMatchObject({ periodicCandidateFound: true, voiced: true });
    expect(recovered.frequencyHz).toBeCloseTo(440, 1);
  });

  it("fails closed for non-finite PCM without returning NaN or Infinity", () => {
    const frame = createSineFrame({ sampleRate: 48_000, frequencyHz: 440 });
    frame[100] = Number.NaN;
    const estimate = estimatePitchYin(frame, 48_000, DEFAULT_YIN_CONFIG);

    expect(estimate).toEqual({
      rms: 0,
      rmsDbfs: SILENCE_DBFS,
      frequencyHz: null,
      confidence: 0,
      periodicCandidateFound: false,
      voiced: false,
    });
    expect(
      Object.values(estimate)
        .filter((value) => typeof value === "number")
        .every(Number.isFinite),
    ).toBe(true);
  });

  it("does not mutate the input frame", () => {
    const frame = createSineFrame({ sampleRate: 48_000, frequencyHz: 440, dcOffset: 0.2 });
    const original = frame.slice();

    estimatePitchYin(frame, 48_000, DEFAULT_YIN_CONFIG);

    expect(frame).toEqual(original);
  });

  it.each([new Float32Array(), new Float32Array(2048), new Float32Array(4097)])(
    "rejects a frame of length $length",
    (frame) => {
      expect(() => estimatePitchYin(frame, 48_000, DEFAULT_YIN_CONFIG)).toThrow(RangeError);
    },
  );

  it.each([
    { options: { noiseGateDbfs: Number.NaN }, reason: "non-finite noise gate" },
    { options: { minConfidence: 0 }, reason: "zero confidence threshold" },
    { options: { minConfidence: 1 }, reason: "unit confidence threshold" },
    { options: { minConfidence: Number.POSITIVE_INFINITY }, reason: "non-finite confidence" },
  ])("rejects $reason", ({ options }) => {
    const frame = createSineFrame({ sampleRate: 48_000, frequencyHz: 440 });

    expect(() => estimatePitchYin(frame, 48_000, DEFAULT_YIN_CONFIG, options)).toThrow(RangeError);
  });
});
