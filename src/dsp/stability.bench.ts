import { bench, describe } from "vitest";
import {
  advanceStabilityWindow,
  advanceSustainedNote,
  createStabilityWindowState,
  createSustainedNoteState,
} from "../domain/stability";
import { DEFAULT_YIN_CONFIG } from "./dsp-config";

const sampleRate = 48_000;
const frameDurationMs = (DEFAULT_YIN_CONFIG.hopSize / sampleRate) * 1000;
const frameCount = 4096;
const vibrato = Array.from({ length: frameCount }, (_, index) => ({
  timestampMs: (index + 1) * frameDurationMs,
  midi: 69 + 0.25 * Math.sin((2 * Math.PI * 5 * index * DEFAULT_YIN_CONFIG.hopSize) / sampleRate),
}));
const resetHeavy = vibrato.map((observation, index) => ({
  ...observation,
  midi: index % 32 === 31 ? null : observation.midi,
}));
let benchmarkSink = 0;

function runSequence(observations: readonly { timestampMs: number; midi: number | null }[]): void {
  let stabilityState = createStabilityWindowState();
  let sustainedState = createSustainedNoteState();
  let checksum = 0;

  for (const observation of observations) {
    const stabilityStep = advanceStabilityWindow(stabilityState, observation);
    stabilityState = stabilityStep.state;
    const sustainedStep = advanceSustainedNote(
      sustainedState,
      {
        timestampMs: observation.timestampMs,
        frameDurationMs,
        rmsDbfs: -12,
        voiced: true,
        midi: observation.midi,
        stabilityScore: stabilityStep.stabilityScore,
      },
      DEFAULT_YIN_CONFIG.minRmsDbfs,
    );
    sustainedState = sustainedStep.state;
    checksum +=
      (stabilityStep.stabilityScore ?? 0) + sustainedStep.continuousVoicedDurationMs * 0.001;
  }

  benchmarkSink = checksum;
}

describe("stability and sustained-note stages", () => {
  bench("4096-frame fractional vibrato sequence", () => {
    runSequence(vibrato);
  });

  bench("4096-frame missing-observation sequence", () => {
    runSequence(resetHeavy);
  });
});

void benchmarkSink;
