import {
  assertValidVoicedDecisionConfig,
  DEFAULT_MIN_CONFIDENCE,
  resolveYinTauBounds,
  type VoicedDecisionConfig,
  type YinConfig,
} from "./dsp-config";
import { isAboveNoiseGate } from "./noise-gate";
import { calculateSignalLevel, type SignalLevel } from "./rms";
import {
  calculateYinCumulativeMeanNormalizedDifference,
  calculateYinDifference,
  refineYinCandidate,
  selectYinCandidate,
} from "./yin";

export interface VoicedDecisionEvidence {
  readonly rmsDbfs: number;
  readonly noiseGateDbfs: number;
  readonly periodicCandidateFound: boolean;
  readonly confidence: number;
  readonly frequencyHz: number | null;
}

export interface YinPitchEstimate extends SignalLevel {
  readonly frequencyHz: number | null;
  readonly confidence: number;
  /** Internal evidence for adaptive-gate learning; Worker output may omit it. */
  readonly periodicCandidateFound: boolean;
  readonly voiced: boolean;
}

export interface EstimatePitchYinOptions {
  /** An adaptive threshold may raise, but never lower, config.minRmsDbfs. */
  readonly noiseGateDbfs?: number;
  readonly minConfidence?: number;
}

export function decideVoiced(
  evidence: VoicedDecisionEvidence,
  config: VoicedDecisionConfig,
): boolean {
  assertValidVoicedDecisionConfig(config);

  return (
    isAboveNoiseGate(evidence.rmsDbfs, evidence.noiseGateDbfs) &&
    evidence.periodicCandidateFound === true &&
    Number.isFinite(evidence.confidence) &&
    evidence.confidence >= 0 &&
    evidence.confidence <= 1 &&
    evidence.confidence > config.minConfidence &&
    evidence.frequencyHz !== null &&
    Number.isFinite(evidence.frequencyHz) &&
    evidence.frequencyHz >= config.minFrequencyHz &&
    evidence.frequencyHz <= config.maxFrequencyHz
  );
}

/**
 * Runs the single-frame YIN pipeline. Temporal noise-floor state, smoothing,
 * octave guarding, and timestamps remain explicit responsibilities of callers.
 */
export function estimatePitchYin(
  frame: Float32Array,
  sampleRate: number,
  config: YinConfig,
  options: EstimatePitchYinOptions = {},
): YinPitchEstimate {
  const tauBounds = resolveYinTauBounds(sampleRate, config);
  if (!(frame instanceof Float32Array) || frame.length !== config.frameSize) {
    throw new RangeError(`YIN frame must be a Float32Array of length ${config.frameSize}`);
  }

  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const voicedConfig: VoicedDecisionConfig = {
    minFrequencyHz: config.minFrequencyHz,
    maxFrequencyHz: config.maxFrequencyHz,
    minConfidence,
  };
  assertValidVoicedDecisionConfig(voicedConfig);

  const requestedNoiseGateDbfs = options.noiseGateDbfs ?? config.minRmsDbfs;
  if (!Number.isFinite(requestedNoiseGateDbfs)) {
    throw new RangeError("noiseGateDbfs must be finite");
  }
  const noiseGateDbfs = Math.max(config.minRmsDbfs, requestedNoiseGateDbfs);
  const signalLevel = calculateSignalLevel(frame);

  // The fixed floor is the only safe computational early exit. A signal that
  // falls below an elevated adaptive gate may still be periodic evidence that
  // the gate must recover instead of learning that tone as background noise.
  if (!isAboveNoiseGate(signalLevel.rmsDbfs, config.minRmsDbfs)) {
    return createUnvoicedEstimate(signalLevel, 0);
  }

  // Both the YIN difference and AC RMS are invariant to a constant offset, so
  // no centered frame allocation is required here.
  const difference = calculateYinDifference(frame, tauBounds.differenceMaxTau);
  const normalizedDifference = calculateYinCumulativeMeanNormalizedDifference(difference);
  const candidate = selectYinCandidate(
    normalizedDifference,
    tauBounds.minTau,
    tauBounds.maxTau,
    config.threshold,
  );
  const refinedCandidate = refineYinCandidate(difference, normalizedDifference, candidate);
  const frequencyHz = sampleRate / refinedCandidate.refinedTau;
  const periodicCandidateFound =
    candidate.selection === "threshold" &&
    Number.isFinite(refinedCandidate.refinedTau) &&
    refinedCandidate.refinedTau > 0;
  const voiced = decideVoiced(
    {
      rmsDbfs: signalLevel.rmsDbfs,
      noiseGateDbfs,
      periodicCandidateFound,
      confidence: refinedCandidate.confidence,
      frequencyHz,
    },
    voicedConfig,
  );

  if (!voiced) {
    return createUnvoicedEstimate(signalLevel, refinedCandidate.confidence, periodicCandidateFound);
  }

  return {
    ...signalLevel,
    frequencyHz,
    confidence: refinedCandidate.confidence,
    periodicCandidateFound,
    voiced: true,
  };
}

function createUnvoicedEstimate(
  signalLevel: SignalLevel,
  confidence: number,
  periodicCandidateFound = false,
): YinPitchEstimate {
  return {
    ...signalLevel,
    frequencyHz: null,
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
    periodicCandidateFound,
    voiced: false,
  };
}
