import { describe, expect, it, vi } from "vitest";
import { DEFAULT_YIN_CONFIG } from "../../dsp/dsp-config";
import { SILENCE_DBFS } from "../../dsp/rms";
import { createPitchWorkerRuntime } from "./pitch-worker-runtime";
import {
  isConfigurePitchWorkerMessage,
  isPitchFrameProcessedMessage,
  isPitchWorkerReadyMessage,
  isPitchWorkerResponse,
  isProcessPitchFrameMessage,
  PITCH_WORKER_PROTOCOL_VERSION,
  type PitchWorkerResponse,
} from "./worker-protocol";

const VALID_CONFIG = {
  sampleRate: 48_000,
  frameSize: DEFAULT_YIN_CONFIG.frameSize,
  hopSize: DEFAULT_YIN_CONFIG.hopSize,
} as const;

const VALID_PROCESSED_FRAME = {
  type: "frame-processed",
  protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
  sequence: 12,
  timestampMs: 597.333_333_333_333_4,
  rms: 0.5,
  rmsDbfs: -6.020_599_913_279_624,
  frequencyHz: 440,
  confidence: 0.99,
  voiced: true,
  midi: 69,
} as const;

function createSineFrame(frequencyHz: number, sequence = 0): Float32Array {
  return Float32Array.from({ length: VALID_CONFIG.frameSize }, (_, index) =>
    Math.fround(
      0.6 *
        Math.sin(
          (2 * Math.PI * frequencyHz * (sequence * VALID_CONFIG.hopSize + index)) /
            VALID_CONFIG.sampleRate,
        ),
    ),
  );
}

describe("pitch worker protocol", () => {
  it("validates exact configuration messages including hop size", () => {
    const valid = {
      type: "configure",
      protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
      ...VALID_CONFIG,
    };

    expect(isConfigurePitchWorkerMessage(valid)).toBe(true);
    expect(isConfigurePitchWorkerMessage({ ...valid, protocolVersion: 2 })).toBe(false);
    expect(isConfigurePitchWorkerMessage({ ...valid, sampleRate: Number.NaN })).toBe(false);
    expect(isConfigurePitchWorkerMessage({ ...valid, frameSize: 0 })).toBe(false);
    expect(isConfigurePitchWorkerMessage({ ...valid, hopSize: 0 })).toBe(false);
    expect(isConfigurePitchWorkerMessage({ ...valid, hopSize: valid.frameSize + 1 })).toBe(false);
    expect(isConfigurePitchWorkerMessage({ ...valid, debug: true })).toBe(false);
    expect(isConfigurePitchWorkerMessage(null)).toBe(false);
  });

  it("accepts only finite transferable Float32 frames with the configured length", () => {
    const samples = new Float32Array(VALID_CONFIG.frameSize);
    const valid = {
      type: "process-frame",
      protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
      sequence: 7,
      samples,
    };

    expect(isProcessPitchFrameMessage(valid, VALID_CONFIG.frameSize)).toBe(true);
    expect(isProcessPitchFrameMessage({ ...valid, sequence: -1 }, VALID_CONFIG.frameSize)).toBe(
      false,
    );
    expect(
      isProcessPitchFrameMessage(
        { ...valid, samples: new Float32Array(8) },
        VALID_CONFIG.frameSize,
      ),
    ).toBe(false);
    expect(
      isProcessPitchFrameMessage({ ...valid, samples: [...samples] }, VALID_CONFIG.frameSize),
    ).toBe(false);
    expect(
      isProcessPitchFrameMessage({ ...valid, retainedCopy: samples }, VALID_CONFIG.frameSize),
    ).toBe(false);
    samples[0] = Number.NaN;
    expect(isProcessPitchFrameMessage(valid, VALID_CONFIG.frameSize)).toBe(false);
    samples[0] = Number.POSITIVE_INFINITY;
    expect(isProcessPitchFrameMessage(valid, VALID_CONFIG.frameSize)).toBe(false);
  });

  it("validates ready and complete finite pitch responses at the Worker boundary", () => {
    const ready = {
      type: "worker-ready",
      protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
      ...VALID_CONFIG,
    };
    const silence = {
      ...VALID_PROCESSED_FRAME,
      rms: 0,
      rmsDbfs: SILENCE_DBFS,
      frequencyHz: null,
      confidence: 0,
      voiced: false,
      midi: null,
    };

    expect(isPitchWorkerReadyMessage(ready)).toBe(true);
    expect(isPitchWorkerReadyMessage({ ...ready, hopSize: 0 })).toBe(false);
    expect(isPitchWorkerReadyMessage({ ...ready, debug: true })).toBe(false);
    expect(isPitchFrameProcessedMessage(VALID_PROCESSED_FRAME)).toBe(true);
    expect(isPitchWorkerResponse(ready)).toBe(true);
    expect(isPitchWorkerResponse(silence)).toBe(true);
    expect(isPitchWorkerResponse({ ...VALID_PROCESSED_FRAME, timestampMs: -1 })).toBe(false);
    expect(isPitchWorkerResponse({ ...VALID_PROCESSED_FRAME, confidence: 1.1 })).toBe(false);
    expect(isPitchWorkerResponse({ ...VALID_PROCESSED_FRAME, frequencyHz: null })).toBe(false);
    expect(isPitchWorkerResponse({ ...silence, frequencyHz: 440 })).toBe(false);
    expect(isPitchWorkerResponse({ ...silence, midi: 69 })).toBe(false);
    expect(isPitchWorkerResponse({ ...VALID_PROCESSED_FRAME, midi: Number.NaN })).toBe(false);
    expect(isPitchWorkerResponse({ ...VALID_PROCESSED_FRAME, rmsDbfs: SILENCE_DBFS })).toBe(false);
    expect(
      isPitchWorkerResponse({
        ...VALID_PROCESSED_FRAME,
        samples: new Float32Array(VALID_CONFIG.frameSize),
      }),
    ).toBe(false);
    expect(isPitchWorkerResponse({ type: "unknown" })).toBe(false);
  });
});

describe("pitch worker runtime", () => {
  it("ignores frames until a feasible, valid configuration is received", () => {
    const responses: PitchWorkerResponse[] = [];
    const runtime = createPitchWorkerRuntime((message) => responses.push(message));
    const frame = {
      type: "process-frame",
      protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
      sequence: 0,
      samples: new Float32Array(VALID_CONFIG.frameSize),
    };

    runtime.handleMessage(frame);
    runtime.handleMessage({
      type: "configure",
      protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
      sampleRate: 192_000,
      frameSize: VALID_CONFIG.frameSize,
      hopSize: VALID_CONFIG.hopSize,
    });

    expect(responses).toEqual([]);
  });

  it.each([44_100, 48_000])(
    "runs the complete stateful pitch path at %i Hz without returning PCM",
    (sampleRate) => {
      const publish = vi.fn<(message: PitchWorkerResponse) => void>();
      const runtime = createPitchWorkerRuntime(publish);
      const samples = Float32Array.from({ length: VALID_CONFIG.frameSize }, (_, index) =>
        Math.fround(0.6 * Math.sin((2 * Math.PI * 440 * index) / sampleRate)),
      );

      runtime.handleMessage({
        type: "configure",
        protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
        sampleRate,
        frameSize: samples.length,
        hopSize: VALID_CONFIG.hopSize,
      });
      runtime.handleMessage({
        type: "configure",
        protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
        sampleRate,
        frameSize: samples.length,
        hopSize: VALID_CONFIG.hopSize,
      });
      runtime.handleMessage({
        type: "process-frame",
        protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
        sequence: 4,
        samples,
      });
      runtime.handleMessage({
        type: "process-frame",
        protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
        sequence: 4,
        samples: samples.slice(),
      });

      expect(publish).toHaveBeenCalledTimes(2);
      expect(publish.mock.calls[0]?.[0]).toEqual({
        type: "worker-ready",
        protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
        sampleRate,
        frameSize: VALID_CONFIG.frameSize,
        hopSize: VALID_CONFIG.hopSize,
      });
      const processed = publish.mock.calls[1]?.[0];
      expect(processed).toMatchObject({
        type: "frame-processed",
        protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
        sequence: 4,
        voiced: true,
      });
      expect(processed).not.toHaveProperty("samples");
      if (processed?.type !== "frame-processed") {
        throw new Error("expected a processed frame");
      }
      expect(processed.timestampMs).toBeCloseTo(
        ((VALID_CONFIG.frameSize + 4 * VALID_CONFIG.hopSize) / sampleRate) * 1000,
        10,
      );
      expect(processed.frequencyHz).toBeCloseTo(440, 0);
      expect(processed.midi).toBeCloseTo(69, 1);
      expect(processed.confidence).toBeGreaterThan(0.9);
      expect(isPitchFrameProcessedMessage(processed)).toBe(true);
    },
  );

  it("preserves guard state across frames and emits null MIDI for pending octave jumps", () => {
    const responses: PitchWorkerResponse[] = [];
    const runtime = createPitchWorkerRuntime((message) => responses.push(message));
    runtime.handleMessage({
      type: "configure",
      protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
      ...VALID_CONFIG,
    });

    for (let sequence = 0; sequence < 5; sequence += 1) {
      runtime.handleMessage({
        type: "process-frame",
        protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
        sequence,
        samples: createSineFrame(440, sequence),
      });
    }
    for (let sequence = 5; sequence < 8; sequence += 1) {
      runtime.handleMessage({
        type: "process-frame",
        protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
        sequence,
        samples: createSineFrame(880, sequence),
      });
    }

    const processed = responses.filter(
      (message): message is Extract<PitchWorkerResponse, { type: "frame-processed" }> =>
        message.type === "frame-processed",
    );
    expect(processed[5]?.midi).toBeNull();
    expect(processed[6]?.midi).toBeNull();
    expect(processed[7]?.midi).toBeCloseTo(81, 1);
  });
});
