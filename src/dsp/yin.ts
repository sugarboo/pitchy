/**
 * Calculates the squared YIN difference function described by de Cheveigné
 * and Kawahara (2002, doi:10.1121/1.1458024).
 *
 * The first half of the frame is the fixed integration window. The remaining
 * samples supply the shifted values, so every requested lag is compared over
 * the same number of samples. The returned index is the lag in samples and
 * index zero is always zero.
 */
export function calculateYinDifference(
  samples: Float32Array,
  maxTau = Math.floor(samples.length / 2),
): Float64Array {
  if (samples.length < 2) {
    throw new RangeError("YIN difference requires at least two samples");
  }

  const windowSize = Math.floor(samples.length / 2);
  if (!Number.isSafeInteger(maxTau) || maxTau < 1 || maxTau > windowSize) {
    throw new RangeError(`maxTau must be an integer between 1 and ${windowSize}`);
  }

  for (const sample of samples) {
    if (!Number.isFinite(sample)) {
      throw new RangeError("YIN difference requires finite samples");
    }
  }

  const difference = new Float64Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau += 1) {
    let squaredDifferenceSum = 0;
    for (let index = 0; index < windowSize; index += 1) {
      const delta = (samples[index] as number) - (samples[index + tau] as number);
      squaredDifferenceSum += delta * delta;
    }
    difference[tau] = squaredDifferenceSum;
  }

  return difference;
}

/**
 * Applies the cumulative mean normalization from equation 8 of the YIN paper.
 *
 * A zero cumulative mean occurs for silence and constant signals. Mapping that
 * undefined 0 / 0 case to one keeps the result finite without manufacturing a
 * threshold-qualified period.
 */
export function calculateYinCumulativeMeanNormalizedDifference(
  difference: Float64Array,
): Float64Array {
  assertValidYinSeries(difference, 0, "YIN difference");

  const normalizedDifference = new Float64Array(difference.length);
  normalizedDifference[0] = 1;
  let cumulativeDifference = 0;

  for (let tau = 1; tau < difference.length; tau += 1) {
    const differenceValue = difference[tau] as number;
    cumulativeDifference += differenceValue;
    if (!Number.isFinite(cumulativeDifference)) {
      throw new RangeError("YIN difference cumulative sum must remain finite");
    }

    if (cumulativeDifference === 0) {
      normalizedDifference[tau] = 1;
      continue;
    }

    const normalizedValue = differenceValue / (cumulativeDifference / tau);
    if (!Number.isFinite(normalizedValue)) {
      throw new RangeError("YIN normalized difference must remain finite");
    }
    normalizedDifference[tau] = normalizedValue;
  }

  return normalizedDifference;
}

export type YinCandidateSelection = "threshold" | "global-minimum";

export interface YinCandidate {
  readonly tau: number;
  readonly normalizedDifference: number;
  readonly selection: YinCandidateSelection;
}

/**
 * Selects the first bounded YIN trough below the strict threshold. If no such
 * trough exists, the original YIN fallback returns the earliest bounded global
 * minimum; downstream confidence and voiced logic must decide if it is usable.
 */
export function selectYinCandidate(
  normalizedDifference: Float64Array,
  minTau: number,
  maxTau: number,
  threshold: number,
): YinCandidate {
  assertValidYinSeries(normalizedDifference, 1, "YIN normalized difference");

  const lastTau = normalizedDifference.length - 1;
  if (
    !Number.isSafeInteger(minTau) ||
    !Number.isSafeInteger(maxTau) ||
    minTau < 1 ||
    maxTau > lastTau ||
    minTau > maxTau
  ) {
    throw new RangeError(
      `tau bounds must be integers satisfying 1 <= minTau <= maxTau <= ${lastTau}`,
    );
  }
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) {
    throw new RangeError("YIN threshold must be finite and between zero and one");
  }

  let globalMinimumTau = minTau;
  let globalMinimumValue = normalizedDifference[minTau] as number;

  for (let tau = minTau; tau <= maxTau; tau += 1) {
    const currentValue = normalizedDifference[tau] as number;
    if (currentValue < globalMinimumValue) {
      globalMinimumTau = tau;
      globalMinimumValue = currentValue;
    }

    if (currentValue >= threshold) {
      continue;
    }

    let candidateTau = tau;
    let candidateValue = currentValue;
    while (candidateTau < maxTau) {
      const nextValue = normalizedDifference[candidateTau + 1] as number;
      if (nextValue >= candidateValue) {
        break;
      }
      candidateTau += 1;
      candidateValue = nextValue;
    }

    return {
      tau: candidateTau,
      normalizedDifference: candidateValue,
      selection: "threshold",
    };
  }

  return {
    tau: globalMinimumTau,
    normalizedDifference: globalMinimumValue,
    selection: "global-minimum",
  };
}

function assertValidYinSeries(values: Float64Array, expectedOrigin: 0 | 1, label: string): void {
  if (values.length < 2) {
    throw new RangeError(`${label} requires at least two values`);
  }
  if (values[0] !== expectedOrigin) {
    throw new RangeError(`${label} must start at ${expectedOrigin}`);
  }

  for (const value of values) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${label} requires finite non-negative values`);
    }
  }
}
