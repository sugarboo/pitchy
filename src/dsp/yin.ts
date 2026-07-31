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

export interface RefinedYinCandidate extends YinCandidate {
  readonly refinedTau: number;
  readonly confidence: number;
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

/**
 * Refines a discrete YIN trough with the parabola through its two neighbours.
 *
 * The selected search range must leave one guard lag to the right. A refinement
 * is accepted only for a strict local minimum whose vertex stays within half a
 * bin; otherwise the discrete lag remains the safest finite estimate.
 *
 * Following YIN step 5, the period position is refined from the raw difference
 * function while confidence is a bounded dip-depth proxy from the interpolated
 * CMND value. Confidence deliberately does not make a voiced/unvoiced decision.
 */
export function refineYinCandidate(
  difference: Float64Array,
  normalizedDifference: Float64Array,
  candidate: YinCandidate,
): RefinedYinCandidate {
  assertValidYinSeries(difference, 0, "YIN difference");
  assertValidYinSeries(normalizedDifference, 1, "YIN normalized difference");
  if (difference.length !== normalizedDifference.length) {
    throw new RangeError("YIN difference and normalized difference must have equal lengths");
  }

  const lastInterpolatableTau = normalizedDifference.length - 2;
  if (
    !Number.isSafeInteger(candidate.tau) ||
    candidate.tau < 1 ||
    candidate.tau > lastInterpolatableTau
  ) {
    throw new RangeError(
      `candidate tau must be an integer between 1 and ${lastInterpolatableTau} with a right guard lag`,
    );
  }
  if (candidate.selection !== "threshold" && candidate.selection !== "global-minimum") {
    throw new RangeError("YIN candidate selection is invalid");
  }

  const centerValue = normalizedDifference[candidate.tau] as number;
  if (
    !Number.isFinite(candidate.normalizedDifference) ||
    candidate.normalizedDifference < 0 ||
    candidate.normalizedDifference !== centerValue
  ) {
    throw new RangeError("YIN candidate must match the normalized difference at its tau");
  }

  const periodMinimum = interpolateStrictParabolicMinimum(difference, candidate.tau);
  const normalizedMinimum = interpolateStrictParabolicMinimum(normalizedDifference, candidate.tau);

  return {
    ...candidate,
    refinedTau: candidate.tau + periodMinimum.offset,
    confidence: clampUnitInterval(1 - normalizedMinimum.value),
  };
}

interface ParabolicMinimum {
  readonly offset: number;
  readonly value: number;
}

function interpolateStrictParabolicMinimum(values: Float64Array, tau: number): ParabolicMinimum {
  const centerValue = values[tau] as number;
  const leftRise = (values[tau - 1] as number) - centerValue;
  const rightRise = (values[tau + 1] as number) - centerValue;

  if (!(leftRise > 0 && rightRise > 0)) {
    return { offset: 0, value: centerValue };
  }

  // Scaling the rises before interpolation avoids overflow for finite,
  // full-range Float64 inputs without changing the parabola's vertex.
  const scale = Math.max(leftRise, rightRise);
  const scaledLeftRise = leftRise / scale;
  const scaledRightRise = rightRise / scale;
  const scaledRiseSum = scaledLeftRise + scaledRightRise;
  const scaledRiseDifference = scaledLeftRise - scaledRightRise;
  const offset = scaledRiseDifference / (2 * scaledRiseSum);
  const correctionScale = (scaledRiseDifference * scaledRiseDifference) / (8 * scaledRiseSum);
  const value = centerValue - scale * correctionScale;

  if (!Number.isFinite(offset) || !Number.isFinite(value) || Math.abs(offset) >= 0.5) {
    return { offset: 0, value: centerValue };
  }

  return { offset, value };
}

function clampUnitInterval(value: number): number {
  return Math.min(1, Math.max(0, value));
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
