export const SILENCE_DBFS = -160;

const SILENCE_RMS_THRESHOLD = 10 ** (SILENCE_DBFS / 20);
const DBFS_VALIDATION_TOLERANCE = 1e-9;

export interface SignalLevel {
  rms: number;
  rmsDbfs: number;
}

const SILENT_SIGNAL_LEVEL: Readonly<SignalLevel> = {
  rms: 0,
  rmsDbfs: SILENCE_DBFS,
};

/**
 * Calculates AC RMS after removing the frame's mean. This keeps DC bias out of
 * the input-level estimate without mutating the transferred PCM frame.
 */
export function calculateAcRms(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }

  let sum = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample)) {
      return 0;
    }
    sum += sample;
  }

  const mean = sum / samples.length;
  let centeredSquareSum = 0;
  for (const sample of samples) {
    const centeredSample = sample - mean;
    centeredSquareSum += centeredSample * centeredSample;
  }

  const rms = Math.sqrt(centeredSquareSum / samples.length);
  return Number.isFinite(rms) ? rms : 0;
}

/**
 * Converts normalized float PCM RMS to approximate dBFS. The finite floor is
 * a transport/display sentinel for silence, not a noise-gate threshold.
 */
export function rmsToDbfs(rms: number): number {
  if (!Number.isFinite(rms) || rms <= SILENCE_RMS_THRESHOLD) {
    return SILENCE_DBFS;
  }

  const rmsDbfs = 20 * Math.log10(rms);
  return Number.isFinite(rmsDbfs) ? rmsDbfs : SILENCE_DBFS;
}

export function calculateSignalLevel(samples: Float32Array): SignalLevel {
  const rms = calculateAcRms(samples);
  if (rms === 0) {
    return { ...SILENT_SIGNAL_LEVEL };
  }

  return {
    rms,
    rmsDbfs: rmsToDbfs(rms),
  };
}

export function isSignalLevel(value: unknown): value is SignalLevel {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.rms !== "number" ||
    !Number.isFinite(candidate.rms) ||
    candidate.rms < 0 ||
    typeof candidate.rmsDbfs !== "number" ||
    !Number.isFinite(candidate.rmsDbfs)
  ) {
    return false;
  }

  return Math.abs(candidate.rmsDbfs - rmsToDbfs(candidate.rms)) <= DBFS_VALIDATION_TOLERANCE;
}
