export const PCM_CAPTURE_PROCESSOR_NAME = "pitchy-pcm-capture";

export interface PcmCaptureConfig {
  frameSize: number;
  hopSize: number;
}

export const DEFAULT_PCM_CAPTURE_CONFIG: Readonly<PcmCaptureConfig> = {
  frameSize: 4096,
  hopSize: 2048,
};

export interface PcmCaptureMessage {
  type: "pcm-frame";
  sequence: number;
  samples: Float32Array;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function resolvePcmCaptureConfig(value: unknown): PcmCaptureConfig {
  if (typeof value !== "object" || value === null) {
    return { ...DEFAULT_PCM_CAPTURE_CONFIG };
  }

  const candidate = value as Partial<PcmCaptureConfig>;
  const frameSize = isPositiveInteger(candidate.frameSize)
    ? candidate.frameSize
    : DEFAULT_PCM_CAPTURE_CONFIG.frameSize;
  const hopSize = isPositiveInteger(candidate.hopSize)
    ? candidate.hopSize
    : DEFAULT_PCM_CAPTURE_CONFIG.hopSize;

  if (hopSize > frameSize) {
    return { ...DEFAULT_PCM_CAPTURE_CONFIG };
  }

  return { frameSize, hopSize };
}

export function isPcmCaptureMessage(
  value: unknown,
  expectedFrameSize = DEFAULT_PCM_CAPTURE_CONFIG.frameSize,
): value is PcmCaptureMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<PcmCaptureMessage>;
  return (
    candidate.type === "pcm-frame" &&
    typeof candidate.sequence === "number" &&
    Number.isSafeInteger(candidate.sequence) &&
    candidate.sequence >= 0 &&
    candidate.samples instanceof Float32Array &&
    candidate.samples.length === expectedFrameSize
  );
}
