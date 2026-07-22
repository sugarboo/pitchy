import type { PcmCaptureConfig } from "./worklets/pcm-capture-protocol";

export type PcmFrameListener = (frame: Float32Array, sequence: number) => void;

/**
 * Accumulates arbitrary render-block sizes into overlapping, fixed-size mono frames.
 * Each emitted frame owns its storage so callers may transfer its ArrayBuffer safely.
 */
export class PcmFrameAccumulator {
  readonly #frameSize: number;
  readonly #hopSize: number;
  readonly #ring: Float32Array;
  #writeIndex = 0;
  #sampleCount = 0;
  #nextFrameEnd: number;
  #sequence = 0;

  constructor(config: PcmCaptureConfig) {
    if (!Number.isSafeInteger(config.frameSize) || config.frameSize <= 0) {
      throw new RangeError("frameSize must be a positive integer");
    }
    if (
      !Number.isSafeInteger(config.hopSize) ||
      config.hopSize <= 0 ||
      config.hopSize > config.frameSize
    ) {
      throw new RangeError("hopSize must be a positive integer no larger than frameSize");
    }

    this.#frameSize = config.frameSize;
    this.#hopSize = config.hopSize;
    this.#ring = new Float32Array(config.frameSize);
    this.#nextFrameEnd = config.frameSize;
  }

  pushChannels(channels: readonly Float32Array[], onFrame: PcmFrameListener): void {
    const sampleLength = this.#readableSampleLength(channels);
    if (sampleLength === 0) {
      return;
    }

    for (let sampleIndex = 0; sampleIndex < sampleLength; sampleIndex += 1) {
      let monoSample = 0;
      for (const channel of channels) {
        monoSample += channel[sampleIndex] ?? 0;
      }
      monoSample /= channels.length;

      this.#ring[this.#writeIndex] = monoSample;
      this.#writeIndex = (this.#writeIndex + 1) % this.#frameSize;
      this.#sampleCount += 1;

      if (this.#sampleCount === this.#nextFrameEnd) {
        onFrame(this.#copyCurrentFrame(), this.#sequence);
        this.#sequence += 1;
        this.#nextFrameEnd += this.#hopSize;
      }
    }
  }

  #readableSampleLength(channels: readonly Float32Array[]): number {
    if (channels.length === 0) {
      return 0;
    }

    let sampleLength = Number.POSITIVE_INFINITY;
    for (const channel of channels) {
      sampleLength = Math.min(sampleLength, channel.length);
    }
    return Number.isFinite(sampleLength) ? sampleLength : 0;
  }

  #copyCurrentFrame(): Float32Array {
    const frame = new Float32Array(this.#frameSize);
    const tailLength = this.#frameSize - this.#writeIndex;
    frame.set(this.#ring.subarray(this.#writeIndex), 0);
    frame.set(this.#ring.subarray(0, this.#writeIndex), tailLength);
    return frame;
  }
}
