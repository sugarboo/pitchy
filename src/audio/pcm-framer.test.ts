import { describe, expect, it, vi } from "vitest";
import { PcmFrameAccumulator } from "./pcm-framer";
import {
  DEFAULT_PCM_CAPTURE_CONFIG,
  isPcmCaptureMessage,
  resolvePcmCaptureConfig,
} from "./worklets/pcm-capture-protocol";

describe("PcmFrameAccumulator", () => {
  it("frames across arbitrary block boundaries and retains the configured overlap", () => {
    const framer = new PcmFrameAccumulator({ frameSize: 4, hopSize: 2 });
    const frames: Array<{ frame: number[]; sequence: number }> = [];
    const collect = (frame: Float32Array, sequence: number): void => {
      frames.push({ frame: [...frame], sequence });
    };

    framer.pushChannels([Float32Array.from([1, 2, 3])], collect);
    framer.pushChannels([Float32Array.from([4])], collect);
    framer.pushChannels([Float32Array.from([5, 6, 7, 8])], collect);

    expect(frames).toEqual([
      { frame: [1, 2, 3, 4], sequence: 0 },
      { frame: [3, 4, 5, 6], sequence: 1 },
      { frame: [5, 6, 7, 8], sequence: 2 },
    ]);
  });

  it("downmixes all readable channels without mutating the source blocks", () => {
    const left = Float32Array.from([1, -1, 0.5, 0]);
    const right = Float32Array.from([-1, 1, 0.5, 1]);
    const originalLeft = left.slice();
    const originalRight = right.slice();
    const frameListener = vi.fn();
    const framer = new PcmFrameAccumulator({ frameSize: 4, hopSize: 4 });

    framer.pushChannels([left, right], frameListener);

    expect(frameListener).toHaveBeenCalledOnce();
    const frame = frameListener.mock.calls[0]?.[0];
    expect(frame).toBeInstanceOf(Float32Array);
    if (!(frame instanceof Float32Array)) {
      throw new Error("Expected a Float32Array frame");
    }
    expect([...frame]).toEqual([0, 0, 0.5, 0.5]);
    expect(left).toEqual(originalLeft);
    expect(right).toEqual(originalRight);
  });

  it("uses only samples available in every channel and ignores empty input", () => {
    const framer = new PcmFrameAccumulator({ frameSize: 2, hopSize: 2 });
    const frameListener = vi.fn();

    framer.pushChannels([], frameListener);
    framer.pushChannels([new Float32Array(), Float32Array.from([9])], frameListener);
    framer.pushChannels([Float32Array.from([2, 4, 8]), Float32Array.from([4, 8])], frameListener);

    expect(frameListener).toHaveBeenCalledOnce();
    const frame = frameListener.mock.calls[0]?.[0];
    expect(frame).toBeInstanceOf(Float32Array);
    if (!(frame instanceof Float32Array)) {
      throw new Error("Expected a Float32Array frame");
    }
    expect([...frame]).toEqual([3, 6]);
  });

  it("emits frames with independent storage", () => {
    const framer = new PcmFrameAccumulator({ frameSize: 2, hopSize: 1 });
    const frames: Float32Array[] = [];

    framer.pushChannels([Float32Array.from([1, 2, 3])], (frame) => frames.push(frame));
    const firstFrame = frames[0];
    const secondFrame = frames[1];
    expect(firstFrame).toBeDefined();
    expect(secondFrame).toBeDefined();
    if (!firstFrame || !secondFrame) {
      throw new Error("Expected two emitted frames");
    }
    secondFrame[0] = 99;

    expect([...firstFrame]).toEqual([1, 2]);
    expect([...secondFrame]).toEqual([99, 3]);
    expect(firstFrame.buffer).not.toBe(secondFrame.buffer);
  });

  it("rejects invalid constructor dimensions", () => {
    expect(() => new PcmFrameAccumulator({ frameSize: 0, hopSize: 1 })).toThrow(RangeError);
    expect(() => new PcmFrameAccumulator({ frameSize: 4, hopSize: 5 })).toThrow(RangeError);
    expect(() => new PcmFrameAccumulator({ frameSize: 4.5, hopSize: 2 })).toThrow(RangeError);
  });
});

describe("PCM capture protocol", () => {
  it("accepts a valid custom config and falls back atomically for invalid overlap", () => {
    expect(resolvePcmCaptureConfig({ frameSize: 1024, hopSize: 512 })).toEqual({
      frameSize: 1024,
      hopSize: 512,
    });
    expect(resolvePcmCaptureConfig({ frameSize: 4, hopSize: 8 })).toEqual(
      DEFAULT_PCM_CAPTURE_CONFIG,
    );
  });

  it("validates frame messages at the main-thread boundary", () => {
    const validMessage = {
      type: "pcm-frame",
      sequence: 0,
      samples: new Float32Array(4),
    };

    expect(isPcmCaptureMessage(validMessage, 4)).toBe(true);
    expect(isPcmCaptureMessage({ ...validMessage, sequence: -1 }, 4)).toBe(false);
    expect(isPcmCaptureMessage({ ...validMessage, samples: [0, 0, 0, 0] }, 4)).toBe(false);
    expect(isPcmCaptureMessage(validMessage, 8)).toBe(false);
  });
});
