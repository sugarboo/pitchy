import { DEFAULT_YIN_CONFIG, resolveYinTauBounds, type YinConfig } from "../../dsp/dsp-config";
import {
  advancePitchPipeline,
  createPitchPipelineState,
  type PitchPipelineState,
} from "../../dsp/pitch-pipeline";
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
  let yinConfig: Readonly<YinConfig> | null = null;
  let pipelineState: PitchPipelineState = createPitchPipelineState();
  let lastProcessedSequence = -1;

  return {
    handleMessage(value: unknown): void {
      if (config === null) {
        if (!isConfigurePitchWorkerMessage(value)) {
          return;
        }

        const candidateConfig = {
          sampleRate: value.sampleRate,
          frameSize: value.frameSize,
          hopSize: value.hopSize,
        };
        const candidateYinConfig: Readonly<YinConfig> = {
          ...DEFAULT_YIN_CONFIG,
          frameSize: value.frameSize,
          hopSize: value.hopSize,
        };
        try {
          resolveYinTauBounds(value.sampleRate, candidateYinConfig);
        } catch {
          return;
        }

        config = candidateConfig;
        yinConfig = candidateYinConfig;
        pipelineState = createPitchPipelineState();
        lastProcessedSequence = -1;
        publishResponse({
          type: "worker-ready",
          protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
          ...config,
        });
        return;
      }

      if (
        !yinConfig ||
        !isProcessPitchFrameMessage(value, config.frameSize) ||
        value.sequence <= lastProcessedSequence
      ) {
        return;
      }

      const timestampMs =
        ((config.frameSize + value.sequence * config.hopSize) / config.sampleRate) * 1000;
      const step = advancePitchPipeline(
        pipelineState,
        value.samples,
        config.sampleRate,
        yinConfig,
        {
          elapsedMs: (config.hopSize / config.sampleRate) * 1000,
          timestampMs,
        },
      );
      pipelineState = step.state;
      lastProcessedSequence = value.sequence;
      publishResponse({
        type: "frame-processed",
        protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
        sequence: value.sequence,
        timestampMs,
        ...step.estimate,
      });
    },
  };
}
