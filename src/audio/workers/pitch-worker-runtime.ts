import { calculateSignalLevel } from "../../dsp/rms";
import {
  isConfigurePitchWorkerMessage,
  isProcessPitchFrameMessage,
  PITCH_WORKER_PROTOCOL_VERSION,
  type PitchWorkerConfig,
  type PitchWorkerResponse,
} from "./worker-protocol";

export interface PitchWorkerRuntime {
  handleMessage(value: unknown): void;
}

export type PitchWorkerResponsePublisher = (message: PitchWorkerResponse) => void;

export function createPitchWorkerRuntime(
  publishResponse: PitchWorkerResponsePublisher,
): PitchWorkerRuntime {
  let config: Readonly<PitchWorkerConfig> | null = null;

  return {
    handleMessage(value: unknown): void {
      if (config === null) {
        if (!isConfigurePitchWorkerMessage(value)) {
          return;
        }

        config = {
          sampleRate: value.sampleRate,
          frameSize: value.frameSize,
        };
        publishResponse({
          type: "worker-ready",
          protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
          ...config,
        });
        return;
      }

      if (!isProcessPitchFrameMessage(value, config.frameSize)) {
        return;
      }

      const signalLevel = calculateSignalLevel(value.samples);
      publishResponse({
        type: "frame-processed",
        protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
        sequence: value.sequence,
        ...signalLevel,
      });
    },
  };
}
