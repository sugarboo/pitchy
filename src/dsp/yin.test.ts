import { describe, expect, it } from "vitest";
import {
  calculateYinCumulativeMeanNormalizedDifference,
  calculateYinDifference,
  type RefinedYinCandidate,
  refineYinCandidate,
  selectYinCandidate,
  type YinCandidate,
} from "./yin";

function calculateReferenceDifference(samples: Float32Array, maxTau: number): Float64Array {
  const windowSize = Math.floor(samples.length / 2);
  const difference = new Float64Array(maxTau + 1);

  for (let tau = 1; tau <= maxTau; tau += 1) {
    for (let index = 0; index < windowSize; index += 1) {
      const delta = (samples[index] as number) - (samples[index + tau] as number);
      difference[tau] = (difference[tau] as number) + delta * delta;
    }
  }

  return difference;
}

function createDeterministicNoise(length: number): Float32Array {
  const samples = new Float32Array(length);
  let state = 0x6d_2b_79_f5;

  for (let index = 0; index < samples.length; index += 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    samples[index] = (state / 0x1_00_00_00_00) * 2 - 1;
  }

  return samples;
}

function createSineFrame(
  sampleRate: number,
  frequencyHz: number,
  amplitude = 0.75,
  dcOffset = 0,
): Float32Array {
  const samples = new Float32Array(4096);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] =
      dcOffset + amplitude * Math.sin((2 * Math.PI * frequencyHz * index) / sampleRate);
  }
  return samples;
}

function selectFrameCandidate(samples: Float32Array, sampleRate: number): YinCandidate {
  const minTau = Math.ceil(sampleRate / 1200);
  const maxTau = Math.floor(sampleRate / 65);
  const difference = calculateYinDifference(samples, maxTau + 1);
  const normalizedDifference = calculateYinCumulativeMeanNormalizedDifference(difference);

  return selectYinCandidate(normalizedDifference, minTau, maxTau, 0.12);
}

function refineFrameCandidate(samples: Float32Array, sampleRate: number): RefinedYinCandidate {
  const minTau = Math.ceil(sampleRate / 1200);
  const maxTau = Math.floor(sampleRate / 65);
  const difference = calculateYinDifference(samples, maxTau + 1);
  const normalizedDifference = calculateYinCumulativeMeanNormalizedDifference(difference);
  const candidate = selectYinCandidate(normalizedDifference, minTau, maxTau, 0.12);

  return refineYinCandidate(difference, normalizedDifference, candidate);
}

describe("YIN difference function", () => {
  it("returns squared differences indexed by lag with an exact zero at tau zero", () => {
    const difference = calculateYinDifference(new Float32Array([1, 2, 4, 8]), 2);

    expect(difference).toBeInstanceOf(Float64Array);
    expect([...difference]).toEqual([0, 5, 45]);
  });

  it("defaults to half of the frame and uses an equally sized integration window", () => {
    const samples = new Float32Array([0, 0.25, -0.5, 1, -0.75, 0.5]);

    expect(calculateYinDifference(samples)).toEqual(calculateReferenceDifference(samples, 3));
  });

  it.each([1, 7, 31, 64])(
    "matches a direct reference implementation through maxTau %i",
    (maxTau) => {
      const samples = createDeterministicNoise(128);

      expect(calculateYinDifference(samples, maxTau)).toEqual(
        calculateReferenceDifference(samples, maxTau),
      );
    },
  );

  it("returns zero for silence and a constant DC signal", () => {
    expect(calculateYinDifference(new Float32Array(32), 8)).toEqual(new Float64Array(9));
    expect(calculateYinDifference(new Float32Array(32).fill(0.25), 8)).toEqual(new Float64Array(9));
  });

  it("is invariant to a constant DC offset within Float32 precision", () => {
    const centered = createSineFrame(48_000, 440, 0.5);
    const biased = createSineFrame(48_000, 440, 0.5, 0.25);
    const centeredDifference = calculateYinDifference(centered, 512);
    const biasedDifference = calculateYinDifference(biased, 512);

    for (let tau = 0; tau < centeredDifference.length; tau += 1) {
      expect(biasedDifference[tau]).toBeCloseTo(centeredDifference[tau] as number, 5);
    }
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
    "has a local minimum around the $frequencyHz Hz period at $sampleRate Hz",
    ({ sampleRate, frequencyHz }) => {
      const expectedTau = Math.round(sampleRate / frequencyHz);
      const difference = calculateYinDifference(
        createSineFrame(sampleRate, frequencyHz),
        Math.ceil(sampleRate / 65),
      );

      expect(difference[expectedTau]).toBeLessThan(difference[expectedTau - 1] as number);
      expect(difference[expectedTau]).toBeLessThan(difference[expectedTau + 1] as number);
    },
  );

  it("keeps every result finite for the full Float32 amplitude range", () => {
    const samples = new Float32Array(32);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = index % 2 === 0 ? 3.402_823_5e38 : -3.402_823_5e38;
    }

    const difference = calculateYinDifference(samples);

    expect([...difference].every(Number.isFinite)).toBe(true);
  });

  it("does not mutate the input frame", () => {
    const samples = createDeterministicNoise(128);
    const original = samples.slice();

    calculateYinDifference(samples, 32);

    expect(samples).toEqual(original);
  });

  it.each([
    { samples: new Float32Array(), maxTau: 1 },
    { samples: new Float32Array(1), maxTau: 1 },
    { samples: new Float32Array(8), maxTau: 0 },
    { samples: new Float32Array(8), maxTau: -1 },
    { samples: new Float32Array(8), maxTau: 1.5 },
    { samples: new Float32Array(8), maxTau: 5 },
    { samples: new Float32Array(8), maxTau: Number.NaN },
    { samples: new Float32Array(8), maxTau: Number.POSITIVE_INFINITY },
  ])("rejects an invalid frame or lag boundary", ({ samples, maxTau }) => {
    expect(() => calculateYinDifference(samples, maxTau)).toThrow(RangeError);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects a non-finite sample (%s)",
    (invalidSample) => {
      const samples = new Float32Array([0.5, invalidSample, -0.5, 0]);

      expect(() => calculateYinDifference(samples)).toThrow(RangeError);
    },
  );
});

describe("YIN cumulative mean normalized difference", () => {
  it("normalizes each lag by the cumulative mean including that lag", () => {
    const normalizedDifference = calculateYinCumulativeMeanNormalizedDifference(
      new Float64Array([0, 4, 2, 6, 0]),
    );

    expect(normalizedDifference).toBeInstanceOf(Float64Array);
    expect(normalizedDifference[0]).toBe(1);
    expect(normalizedDifference[1]).toBe(1);
    expect(normalizedDifference[2]).toBeCloseTo(2 / 3, 12);
    expect(normalizedDifference[3]).toBeCloseTo(1.5, 12);
    expect(normalizedDifference[4]).toBe(0);
  });

  it("maps a zero cumulative mean to one instead of manufacturing a period", () => {
    expect(calculateYinCumulativeMeanNormalizedDifference(new Float64Array([0, 0, 0, 0]))).toEqual(
      new Float64Array([1, 1, 1, 1]),
    );
  });

  it("is scale invariant and does not mutate the difference function", () => {
    const difference = new Float64Array([0, 4, 2, 6, 1]);
    const original = difference.slice();
    const scaledDifference = Float64Array.from(difference, (value) => value * 0.125);
    const normalized = calculateYinCumulativeMeanNormalizedDifference(difference);
    const scaledNormalized = calculateYinCumulativeMeanNormalizedDifference(scaledDifference);

    for (let tau = 0; tau < normalized.length; tau += 1) {
      expect(scaledNormalized[tau]).toBeCloseTo(normalized[tau] as number, 12);
    }
    expect(difference).toEqual(original);
  });

  it("keeps the actual full-range Float32 difference result finite", () => {
    const samples = new Float32Array(32);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = index % 2 === 0 ? 3.402_823_5e38 : -3.402_823_5e38;
    }

    const normalizedDifference = calculateYinCumulativeMeanNormalizedDifference(
      calculateYinDifference(samples),
    );

    expect([...normalizedDifference].every(Number.isFinite)).toBe(true);
  });

  it.each([
    new Float64Array(),
    new Float64Array([0]),
    new Float64Array([1, 0.5]),
    new Float64Array([0, -0.5]),
    new Float64Array([0, Number.NaN]),
    new Float64Array([0, Number.POSITIVE_INFINITY]),
  ])("rejects an invalid difference function", (difference) => {
    expect(() => calculateYinCumulativeMeanNormalizedDifference(difference)).toThrow(RangeError);
  });

  it("rejects a finite input whose cumulative sum overflows", () => {
    const difference = new Float64Array([0, Number.MAX_VALUE, Number.MAX_VALUE]);

    expect(() => calculateYinCumulativeMeanNormalizedDifference(difference)).toThrow(RangeError);
  });
});

describe("YIN candidate selection", () => {
  it("selects the first threshold trough instead of a later deeper trough", () => {
    const normalizedDifference = new Float64Array([1, 0.9, 0.7, 0.11, 0.08, 0.09, 0.04, 0.05]);

    expect(selectYinCandidate(normalizedDifference, 2, 7, 0.12)).toEqual({
      tau: 4,
      normalizedDifference: 0.08,
      selection: "threshold",
    });
  });

  it("uses a strict threshold and reports the bounded global-minimum fallback", () => {
    const normalizedDifference = new Float64Array([1, 0.5, 0.12, 0.2]);

    expect(selectYinCandidate(normalizedDifference, 1, 3, 0.12)).toEqual({
      tau: 2,
      normalizedDifference: 0.12,
      selection: "global-minimum",
    });
  });

  it("keeps the earliest lag when the global minimum is tied", () => {
    const normalizedDifference = new Float64Array([1, 0.8, 0.4, 0.4, 0.7]);

    expect(selectYinCandidate(normalizedDifference, 1, 4, 0.1)).toEqual({
      tau: 2,
      normalizedDifference: 0.4,
      selection: "global-minimum",
    });
  });

  it("selects the earliest point of a flat threshold trough", () => {
    const normalizedDifference = new Float64Array([1, 0.5, 0.125, 0.0625, 0.0625, 0.125]);

    expect(selectYinCandidate(normalizedDifference, 1, 5, 0.25)).toEqual({
      tau: 3,
      normalizedDifference: 0.0625,
      selection: "threshold",
    });
  });

  it.each([
    {
      normalizedDifference: new Float64Array([1, 0.05, 0.2]),
      minTau: 1,
      maxTau: 2,
      expectedTau: 1,
    },
    {
      normalizedDifference: new Float64Array([1, 0.01, 0.8, 0.7, 0.6, 0.05]),
      minTau: 2,
      maxTau: 5,
      expectedTau: 5,
    },
  ])(
    "includes the bounded endpoint at tau $expectedTau",
    ({ normalizedDifference, minTau, maxTau, expectedTau }) => {
      expect(selectYinCandidate(normalizedDifference, minTau, maxTau, 0.1)).toEqual({
        tau: expectedTau,
        normalizedDifference: normalizedDifference[expectedTau],
        selection: "threshold",
      });
    },
  );

  it("preserves a low-quality fallback for silence without marking it as a threshold result", () => {
    const normalizedDifference = calculateYinCumulativeMeanNormalizedDifference(
      new Float64Array(9),
    );

    expect(selectYinCandidate(normalizedDifference, 2, 7, 0.12)).toEqual({
      tau: 2,
      normalizedDifference: 1,
      selection: "global-minimum",
    });
  });

  it("uses a global-minimum fallback for deterministic noise", () => {
    const sampleRate = 48_000;
    const candidate = selectFrameCandidate(createDeterministicNoise(4096), sampleRate);

    expect(candidate.selection).toBe("global-minimum");
    expect(candidate.normalizedDifference).toBeGreaterThanOrEqual(0.12);
    expect(candidate.tau).toBeGreaterThanOrEqual(Math.ceil(sampleRate / 1200));
    expect(candidate.tau).toBeLessThanOrEqual(Math.floor(sampleRate / 65));
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
    "selects the discrete $frequencyHz Hz period within one sample at $sampleRate Hz",
    ({ sampleRate, frequencyHz }) => {
      const candidate = selectFrameCandidate(createSineFrame(sampleRate, frequencyHz), sampleRate);

      expect(candidate.selection).toBe("threshold");
      expect(Math.abs(candidate.tau - sampleRate / frequencyHz)).toBeLessThanOrEqual(1);
    },
  );

  it("does not mutate the normalized difference function", () => {
    const normalizedDifference = new Float64Array([1, 0.7, 0.1, 0.05, 0.08]);
    const original = normalizedDifference.slice();

    selectYinCandidate(normalizedDifference, 1, 4, 0.12);

    expect(normalizedDifference).toEqual(original);
  });

  it.each([
    new Float64Array(),
    new Float64Array([1]),
    new Float64Array([0, 0.5]),
    new Float64Array([1, -0.5]),
    new Float64Array([1, Number.NaN]),
    new Float64Array([1, Number.POSITIVE_INFINITY]),
  ])("rejects an invalid normalized difference function", (normalizedDifference) => {
    expect(() => selectYinCandidate(normalizedDifference, 1, 1, 0.12)).toThrow(RangeError);
  });

  it.each([
    { minTau: 0, maxTau: 2 },
    { minTau: 1.5, maxTau: 2 },
    { minTau: 3, maxTau: 2 },
    { minTau: 1, maxTau: 4 },
    { minTau: 1, maxTau: 2.5 },
    { minTau: Number.POSITIVE_INFINITY, maxTau: 2 },
  ])("rejects invalid tau bounds ($minTau, $maxTau)", ({ minTau, maxTau }) => {
    const normalizedDifference = new Float64Array([1, 0.5, 0.25, 0.125]);

    expect(() => selectYinCandidate(normalizedDifference, minTau, maxTau, 0.12)).toThrow(
      RangeError,
    );
  });

  it.each([0, 1, -0.1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid threshold (%s)",
    (threshold) => {
      const normalizedDifference = new Float64Array([1, 0.5, 0.25]);

      expect(() => selectYinCandidate(normalizedDifference, 1, 2, threshold)).toThrow(RangeError);
    },
  );
});

describe("YIN candidate refinement and confidence", () => {
  it.each([
    {
      direction: "right",
      normalizedDifference: new Float64Array([1, 0.9, 0.725, 0.125, 0.325]),
      expectedTau: 3.25,
    },
    {
      direction: "left",
      normalizedDifference: new Float64Array([1, 0.9, 0.325, 0.125, 0.725]),
      expectedTau: 2.75,
    },
  ])(
    "recovers the exact vertex of a parabola shifted to the $direction",
    ({ normalizedDifference, expectedTau }) => {
      const difference = normalizedDifference.slice();
      difference[0] = 0;
      const candidate: YinCandidate = {
        tau: 3,
        normalizedDifference: 0.125,
        selection: "threshold",
      };
      const refinedCandidate = refineYinCandidate(difference, normalizedDifference, candidate);

      expect(refinedCandidate).toMatchObject(candidate);
      expect(refinedCandidate.refinedTau).toBeCloseTo(expectedTau, 12);
      expect(refinedCandidate.confidence).toBeCloseTo(0.9, 12);
    },
  );

  it("uses raw difference for period position and CMND for confidence", () => {
    const difference = new Float64Array([0, 0.9, 0.725, 0.125, 0.325]);
    const normalizedDifference = new Float64Array([1, 0.9, 0.4, 0.2, 0.4]);
    const candidate: YinCandidate = {
      tau: 3,
      normalizedDifference: 0.2,
      selection: "threshold",
    };
    const refinedCandidate = refineYinCandidate(difference, normalizedDifference, candidate);

    expect(refinedCandidate.refinedTau).toBeCloseTo(3.25, 12);
    expect(refinedCandidate.confidence).toBeCloseTo(0.8, 12);
  });

  it("uses the right guard lag when the discrete candidate is at the search boundary", () => {
    const normalizedDifference = new Float64Array([1, 0.9, 0.8, 0.725, 0.125, 0.325]);
    const difference = normalizedDifference.slice();
    difference[0] = 0;
    const candidate = selectYinCandidate(normalizedDifference, 2, 4, 0.2);

    expect(candidate.tau).toBe(4);
    expect(refineYinCandidate(difference, normalizedDifference, candidate).refinedTau).toBeCloseTo(
      4.25,
      12,
    );
  });

  it("keeps tau one finite when the origin and right guard are available", () => {
    const normalizedDifference = new Float64Array([1, 0.1, 0.2]);
    const difference = new Float64Array([0, 0.1, 0.2]);
    const candidate: YinCandidate = {
      tau: 1,
      normalizedDifference: 0.1,
      selection: "threshold",
    };
    const refinedCandidate = refineYinCandidate(difference, normalizedDifference, candidate);

    expect(refinedCandidate.refinedTau).toBeGreaterThanOrEqual(1);
    expect(refinedCandidate.refinedTau).toBeLessThan(2);
    expect(refinedCandidate.confidence).toBeGreaterThanOrEqual(0);
    expect(refinedCandidate.confidence).toBeLessThanOrEqual(1);
  });

  it.each([
    {
      curve: "flat",
      normalizedDifference: new Float64Array([1, 0.8, 0.2, 0.2, 0.2]),
      tau: 3,
    },
    {
      curve: "concave",
      normalizedDifference: new Float64Array([1, 0.8, 0.1, 0.2, 0.1]),
      tau: 3,
    },
    {
      curve: "vertex outside adjacent bins",
      normalizedDifference: new Float64Array([1, 0.8, 0.75, 0.28125, 0.125]),
      tau: 3,
    },
  ])("keeps the discrete candidate for a $curve curve", ({ normalizedDifference, tau }) => {
    const difference = normalizedDifference.slice();
    difference[0] = 0;
    const candidate: YinCandidate = {
      tau,
      normalizedDifference: normalizedDifference[tau] as number,
      selection: "global-minimum",
    };
    const refinedCandidate = refineYinCandidate(difference, normalizedDifference, candidate);

    expect(refinedCandidate.refinedTau).toBe(tau);
    expect(Number.isFinite(refinedCandidate.confidence)).toBe(true);
  });

  it.each([
    { dipValue: 0, expectedConfidence: 1 },
    { dipValue: 0.25, expectedConfidence: 0.75 },
    { dipValue: 1, expectedConfidence: 0 },
    { dipValue: 2, expectedConfidence: 0 },
  ])(
    "clamps a discrete CMND dip of $dipValue to confidence $expectedConfidence",
    ({ dipValue, expectedConfidence }) => {
      const normalizedDifference = new Float64Array([1, dipValue + 1, dipValue, dipValue + 1]);
      const difference = new Float64Array([0, dipValue + 1, dipValue, dipValue + 1]);
      const candidate: YinCandidate = {
        tau: 2,
        normalizedDifference: dipValue,
        selection: "global-minimum",
      };

      expect(refineYinCandidate(difference, normalizedDifference, candidate).confidence).toBe(
        expectedConfidence,
      );
    },
  );

  it("returns zero confidence for silence without turning the fallback into voiced evidence", () => {
    const difference = new Float64Array(9);
    const normalizedDifference = calculateYinCumulativeMeanNormalizedDifference(difference);
    const candidate = selectYinCandidate(normalizedDifference, 2, 7, 0.12);

    expect(refineYinCandidate(difference, normalizedDifference, candidate)).toEqual({
      ...candidate,
      refinedTau: candidate.tau,
      confidence: 0,
    });
  });

  it("keeps deterministic noise confidence low and finite", () => {
    const refinedCandidate = refineFrameCandidate(createDeterministicNoise(4096), 48_000);

    expect(refinedCandidate.selection).toBe("global-minimum");
    expect(refinedCandidate.confidence).toBeGreaterThanOrEqual(0);
    expect(refinedCandidate.confidence).toBeLessThan(0.2);
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
    "refines the $frequencyHz Hz period below half a cent at $sampleRate Hz",
    ({ sampleRate, frequencyHz }) => {
      const expectedTau = sampleRate / frequencyHz;
      const refinedCandidate = refineFrameCandidate(
        createSineFrame(sampleRate, frequencyHz),
        sampleRate,
      );
      const discreteError = Math.abs(refinedCandidate.tau - expectedTau);
      const refinedError = Math.abs(refinedCandidate.refinedTau - expectedTau);
      const centsError = 1200 * Math.log2(expectedTau / refinedCandidate.refinedTau);

      expect(refinedCandidate.selection).toBe("threshold");
      expect(refinedError).toBeLessThan(discreteError);
      expect(refinedError).toBeLessThan(0.025);
      expect(Math.abs(centsError)).toBeLessThan(0.5);
      expect(refinedCandidate.confidence).toBeGreaterThan(0.99);
      expect(refinedCandidate.confidence).toBeLessThanOrEqual(1);
    },
  );

  it("does not mutate either difference function or the candidate", () => {
    const normalizedDifference = new Float64Array([1, 0.7, 0.1, 0.05, 0.08]);
    const difference = new Float64Array([0, 5, 1, 0.25, 1.5]);
    const originalDifference = difference.slice();
    const originalNormalizedDifference = normalizedDifference.slice();
    const candidate: YinCandidate = {
      tau: 3,
      normalizedDifference: 0.05,
      selection: "threshold",
    };
    const originalCandidate = { ...candidate };

    refineYinCandidate(difference, normalizedDifference, candidate);

    expect(difference).toEqual(originalDifference);
    expect(normalizedDifference).toEqual(originalNormalizedDifference);
    expect(candidate).toEqual(originalCandidate);
  });

  it.each([
    new Float64Array(),
    new Float64Array([1]),
    new Float64Array([0, 0.5, 0.75]),
    new Float64Array([1, -0.5, 0.75]),
    new Float64Array([1, Number.NaN, 0.75]),
    new Float64Array([1, Number.POSITIVE_INFINITY, 0.75]),
  ])("rejects an invalid normalized difference function", (normalizedDifference) => {
    const difference = new Float64Array(normalizedDifference.length);
    const candidate: YinCandidate = {
      tau: 1,
      normalizedDifference: 0.5,
      selection: "threshold",
    };

    expect(() => refineYinCandidate(difference, normalizedDifference, candidate)).toThrow(
      RangeError,
    );
  });

  it.each([
    new Float64Array(),
    new Float64Array([0]),
    new Float64Array([1, 0.5, 0.75]),
    new Float64Array([0, -0.5, 0.75]),
    new Float64Array([0, Number.NaN, 0.75]),
    new Float64Array([0, Number.POSITIVE_INFINITY, 0.75]),
  ])("rejects an invalid difference function", (difference) => {
    const normalizedDifference = new Float64Array([1, 0.5, 0.75]);
    const candidate: YinCandidate = {
      tau: 1,
      normalizedDifference: 0.5,
      selection: "threshold",
    };

    expect(() => refineYinCandidate(difference, normalizedDifference, candidate)).toThrow(
      RangeError,
    );
  });

  it("rejects difference functions whose lengths do not match", () => {
    const difference = new Float64Array([0, 0.5, 0.25, 0.75]);
    const normalizedDifference = new Float64Array([1, 0.5, 0.25]);
    const candidate: YinCandidate = {
      tau: 1,
      normalizedDifference: 0.5,
      selection: "threshold",
    };

    expect(() => refineYinCandidate(difference, normalizedDifference, candidate)).toThrow(
      RangeError,
    );
  });

  it.each([0, 3, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects candidate tau %s without two valid neighbours",
    (tau) => {
      const difference = new Float64Array([0, 0.5, 0.25, 0.75]);
      const normalizedDifference = new Float64Array([1, 0.5, 0.25, 0.75]);
      const candidate: YinCandidate = {
        tau,
        normalizedDifference: normalizedDifference[tau] ?? 0.25,
        selection: "threshold",
      };

      expect(() => refineYinCandidate(difference, normalizedDifference, candidate)).toThrow(
        RangeError,
      );
    },
  );

  it.each([0.2, -0.25, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects a candidate value that does not match the series (%s)",
    (normalizedDifferenceValue) => {
      const difference = new Float64Array([0, 0.5, 0.25, 0.75]);
      const normalizedDifference = new Float64Array([1, 0.5, 0.25, 0.75]);
      const candidate: YinCandidate = {
        tau: 2,
        normalizedDifference: normalizedDifferenceValue,
        selection: "threshold",
      };

      expect(() => refineYinCandidate(difference, normalizedDifference, candidate)).toThrow(
        RangeError,
      );
    },
  );

  it("rejects an invalid candidate selection label", () => {
    const difference = new Float64Array([0, 0.5, 0.25, 0.75]);
    const normalizedDifference = new Float64Array([1, 0.5, 0.25, 0.75]);
    const candidate: YinCandidate = {
      tau: 2,
      normalizedDifference: 0.25,
      selection: "invalid" as YinCandidate["selection"],
    };

    expect(() => refineYinCandidate(difference, normalizedDifference, candidate)).toThrow(
      RangeError,
    );
  });
});
