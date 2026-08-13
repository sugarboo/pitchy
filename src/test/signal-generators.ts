export interface SineFrameOptions {
  readonly sampleRate: number;
  readonly frequencyHz: number;
  readonly length?: number;
  readonly startSample?: number;
  readonly amplitude?: number;
  readonly dcOffset?: number;
  readonly phaseRadians?: number;
}

export interface HarmonicPartial {
  readonly multiple: number;
  readonly amplitude: number;
  readonly phaseRadians?: number;
}

export interface HarmonicFrameOptions {
  readonly sampleRate: number;
  readonly fundamentalHz: number;
  readonly partials: readonly HarmonicPartial[];
  readonly length?: number;
  readonly startSample?: number;
  readonly dcOffset?: number;
}

export function createSineFrame(options: SineFrameOptions): Float32Array {
  const {
    sampleRate,
    frequencyHz,
    length = 4096,
    startSample = 0,
    amplitude = 0.5,
    dcOffset = 0,
    phaseRadians = 0,
  } = options;
  const samples = new Float32Array(length);

  for (let index = 0; index < samples.length; index += 1) {
    const sampleIndex = startSample + index;
    samples[index] =
      dcOffset +
      amplitude * Math.sin((2 * Math.PI * frequencyHz * sampleIndex) / sampleRate + phaseRadians);
  }

  return samples;
}

export function createHarmonicFrame(options: HarmonicFrameOptions): Float32Array {
  const {
    sampleRate,
    fundamentalHz,
    partials,
    length = 4096,
    startSample = 0,
    dcOffset = 0,
  } = options;
  const samples = new Float32Array(length);

  for (let index = 0; index < samples.length; index += 1) {
    const sampleIndex = startSample + index;
    let value = dcOffset;
    for (const partial of partials) {
      value +=
        partial.amplitude *
        Math.sin(
          (2 * Math.PI * fundamentalHz * partial.multiple * sampleIndex) / sampleRate +
            (partial.phaseRadians ?? 0),
        );
    }
    samples[index] = value;
  }

  return samples;
}

export function createDeterministicWhiteNoise(
  length: number,
  amplitude = 1,
  seed = 0x6d_2b_79_f5,
): Float32Array {
  const samples = new Float32Array(length);
  let state = seed >>> 0;

  for (let index = 0; index < samples.length; index += 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    samples[index] = ((state / 0x1_00_00_00_00) * 2 - 1) * amplitude;
  }

  return samples;
}

export function addSignals(...signals: readonly Float32Array[]): Float32Array {
  const length = signals[0]?.length ?? 0;
  if (signals.some((signal) => signal.length !== length)) {
    throw new RangeError("signals must have equal lengths");
  }

  const mixed = new Float32Array(length);
  for (const signal of signals) {
    for (let index = 0; index < length; index += 1) {
      mixed[index] = (mixed[index] as number) + (signal[index] as number);
    }
  }
  return mixed;
}
