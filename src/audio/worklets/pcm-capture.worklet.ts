import { PcmFrameAccumulator } from "../pcm-framer";
import {
  PCM_CAPTURE_PROCESSOR_NAME,
  type PcmCaptureMessage,
  resolvePcmCaptureConfig,
} from "./pcm-capture-protocol";

interface WorkletProcessorOptions {
  processorOptions?: unknown;
}

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: WorkletProcessorOptions);
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new (options?: WorkletProcessorOptions) => AudioWorkletProcessor,
): void;

class PcmCaptureProcessor extends AudioWorkletProcessor {
  readonly #framer: PcmFrameAccumulator;

  constructor(options?: WorkletProcessorOptions) {
    super(options);
    this.#framer = new PcmFrameAccumulator(resolvePcmCaptureConfig(options?.processorOptions));
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    // The node must be connected for processors to stay alive, but microphone audio must
    // never reach the speakers. The main-thread gain node provides a second mute boundary.
    for (const output of outputs) {
      for (const channel of output) {
        channel.fill(0);
      }
    }

    this.#framer.pushChannels(inputs[0] ?? [], (samples, sequence) => {
      const message: PcmCaptureMessage = { type: "pcm-frame", sequence, samples };
      this.port.postMessage(message, [samples.buffer]);
    });
    return true;
  }
}

registerProcessor(PCM_CAPTURE_PROCESSOR_NAME, PcmCaptureProcessor);
