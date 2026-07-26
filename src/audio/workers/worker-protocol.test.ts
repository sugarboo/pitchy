import { describe, expect, it, vi } from "vitest";
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

describe("pitch worker protocol", () => {
  it("validates configuration messages at the main-thread to Worker boundary", () => {
    const valid = {
      type: "configure",
      protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
      sampleRate: 48_000,
      frameSize: 4096,
    };

    expect(isConfigurePitchWorkerMessage(valid)).toBe(true);
    expect(isConfigurePitchWorkerMessage({ ...valid, protocolVersion: 1 })).toBe(false);
    expect(isConfigurePitchWorkerMessage({ ...valid, sampleRate: Number.NaN })).toBe(false);
    expect(isConfigurePitchWorkerMessage({ ...valid, frameSize: 0 })).toBe(false);
    expect(isConfigurePitchWorkerMessage({ ...valid, debug: true })).toBe(false);
    expect(isConfigurePitchWorkerMessage(null)).toBe(false);
  });

  it("accepts only transferable Float32 frames with the configured length", () => {
    const samples = new Float32Array(4096);
    const valid = {
      type: "process-frame",
      protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
      sequence: 7,
      samples,
    };

    expect(isProcessPitchFrameMessage(valid, 4096)).toBe(true);
    expect(isProcessPitchFrameMessage({ ...valid, sequence: -1 }, 4096)).toBe(false);
    expect(isProcessPitchFrameMessage({ ...valid, samples: new Float32Array(8) }, 4096)).toBe(
      false,
    );
    expect(isProcessPitchFrameMessage({ ...valid, samples: [...samples] }, 4096)).toBe(false);
    expect(isProcessPitchFrameMessage({ ...valid, retainedCopy: samples }, 4096)).toBe(false);
    samples[0] = Number.NaN;
    expect(isProcessPitchFrameMessage(valid, 4096)).toBe(false);
    samples[0] = Number.POSITIVE_INFINITY;
    expect(isProcessPitchFrameMessage(valid, 4096)).toBe(false);
  });

  it("validates ready and finite level responses at the Worker to main-thread boundary", () => {
    const ready = {
      type: "worker-ready",
      protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
      sampleRate: 44_100,
      frameSize: 4096,
    };
    const processed = {
      type: "frame-processed",
      protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
      sequence: 12,
      rms: 0.5,
      rmsDbfs: -6.020599913279624,
    };

    expect(isPitchWorkerReadyMessage(ready)).toBe(true);
    expect(isPitchWorkerReadyMessage({ ...ready, debug: true })).toBe(false);
    expect(isPitchFrameProcessedMessage(processed)).toBe(true);
    expect(isPitchWorkerResponse(ready)).toBe(true);
    expect(isPitchWorkerResponse(processed)).toBe(true);
    expect(
      isPitchWorkerResponse({
        ...processed,
        rms: 0,
        rmsDbfs: SILENCE_DBFS,
      }),
    ).toBe(true);
    expect(isPitchWorkerResponse({ ...processed, sequence: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isPitchWorkerResponse({ ...processed, rms: -0.1 })).toBe(false);
    expect(isPitchWorkerResponse({ ...processed, rms: Number.NaN })).toBe(false);
    expect(isPitchWorkerResponse({ ...processed, rmsDbfs: Number.NEGATIVE_INFINITY })).toBe(false);
    expect(isPitchWorkerResponse({ ...processed, rmsDbfs: SILENCE_DBFS })).toBe(false);
    expect(isPitchWorkerResponse({ ...processed, rms: 0 })).toBe(false);
    expect(
      isPitchWorkerResponse({
        ...processed,
        samples: new Float32Array(4096),
      }),
    ).toBe(false);
    expect(
      isPitchWorkerResponse({
        type: processed.type,
        protocolVersion: processed.protocolVersion,
        sequence: processed.sequence,
        rmsDbfs: processed.rmsDbfs,
      }),
    ).toBe(false);
    expect(isPitchWorkerResponse({ type: "unknown" })).toBe(false);
  });
});

describe("pitch worker runtime", () => {
  it("ignores frames until a valid configuration is received", () => {
    const responses: PitchWorkerResponse[] = [];
    const runtime = createPitchWorkerRuntime((message) => responses.push(message));
    const frame = {
      type: "process-frame",
      protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
      sequence: 0,
      samples: new Float32Array(4),
    };

    runtime.handleMessage(frame);
    runtime.handleMessage({
      type: "configure",
      protocolVersion: 1,
      sampleRate: 48_000,
      frameSize: 4,
    });

    expect(responses).toEqual([]);
  });

  it.each([44_100, 48_000])(
    "measures a valid frame at %i Hz without retaining or returning PCM",
    (sampleRate) => {
      const publish = vi.fn<(message: PitchWorkerResponse) => void>();
      const runtime = createPitchWorkerRuntime(publish);
      const samples = new Float32Array([0.75, -0.25, 0.75, -0.25]);

      runtime.handleMessage({
        type: "configure",
        protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
        sampleRate,
        frameSize: samples.length,
      });
      runtime.handleMessage({
        type: "configure",
        protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
        sampleRate: 44_100,
        frameSize: samples.length,
      });
      runtime.handleMessage({
        type: "process-frame",
        protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
        sequence: 3,
        samples: new Float32Array(2),
      });
      runtime.handleMessage({
        type: "process-frame",
        protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
        sequence: 3,
        samples: new Float32Array([0.5, Number.NaN, -0.5, 0]),
      });
      runtime.handleMessage({
        type: "process-frame",
        protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
        sequence: 4,
        samples,
      });

      expect(publish).toHaveBeenCalledTimes(2);
      expect(publish.mock.calls[0]?.[0]).toEqual({
        type: "worker-ready",
        protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
        sampleRate,
        frameSize: 4,
      });
      expect(publish.mock.calls[1]?.[0]).toEqual({
        type: "frame-processed",
        protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
        sequence: 4,
        rms: 0.5,
        rmsDbfs: -6.020599913279624,
      });
      expect(publish.mock.calls[1]?.[0]).not.toHaveProperty("samples");
    },
  );
});
