import { centsFromTargetMidi } from "./pitch";
import type { CompletedPracticeSession, SessionTracePoint } from "./session";
import { PRACTICE_PITCH_STATES, type PracticePitchState } from "./stability";
import { assertPracticeConfiguration, type PracticeConfiguration } from "./target-practice";
import { DEFAULT_TUNING_A4_HZ } from "./tuning";

export const MAX_SESSION_TRACE_POINTS = 300;
// Fixed 0.1-point bins bound memory; the duration-weighted median has <=0.05 rounding error.
const SCORE_RESOLUTION = 10;

export interface SessionMetadata {
  readonly id: string;
  readonly startedAt: string;
  readonly actualSampleRate: number;
  readonly inputDeviceLabel: string | null;
}

export interface SessionObservation {
  readonly sequence: number;
  readonly timestampMs: number;
  readonly midi: number | null;
  readonly voiced: boolean;
  readonly state: PracticePitchState;
  readonly stabilityScore: number | null;
}

function validDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

/** Owns one session, without retaining PCM or an unbounded per-frame history. */
export class SessionAggregator {
  readonly #configuration: PracticeConfiguration;
  readonly #metadata: SessionMetadata;
  readonly #startedMonotonicMs: number;
  readonly #midiOffset: number;
  readonly #scoreWeights = new Float64Array(100 * SCORE_RESOLUTION + 1);
  readonly #withinMs = [0, 0, 0];
  #previous: SessionObservation | null = null;
  #lastSequence = -1;
  #lastTimestampMs = -1;
  #paused = false;
  #voicedMs = 0;
  #stableMs = 0;
  #stableRunMs = 0;
  #longestStableMs = 0;
  #minStableMidi: number | null = null;
  #maxStableMidi: number | null = null;
  #trace: SessionTracePoint[] = [];
  #completed: CompletedPracticeSession | null = null;

  constructor(
    configuration: PracticeConfiguration,
    metadata: SessionMetadata,
    startedMonotonicMs: number,
  ) {
    assertPracticeConfiguration(configuration);
    if (
      !metadata.id.trim() ||
      !validDate(metadata.startedAt) ||
      !Number.isFinite(metadata.actualSampleRate) ||
      metadata.actualSampleRate <= 0 ||
      !Number.isFinite(startedMonotonicMs) ||
      startedMonotonicMs < 0
    ) {
      throw new RangeError("Invalid session metadata");
    }
    this.#configuration = { ...configuration };
    this.#metadata = { ...metadata };
    this.#startedMonotonicMs = startedMonotonicMs;
    this.#midiOffset = 12 * Math.log2(DEFAULT_TUNING_A4_HZ / configuration.tuningA4Hz);
  }

  setPaused(paused: boolean): void {
    this.#paused = paused;
    if (paused) {
      this.#previous = null;
      this.#stableRunMs = 0;
    }
  }

  accept(observation: SessionObservation): void {
    if (this.#completed || this.#paused) return;
    if (
      !Number.isSafeInteger(observation.sequence) ||
      observation.sequence < 0 ||
      !Number.isFinite(observation.timestampMs) ||
      observation.timestampMs < 0
    ) {
      throw new RangeError("Invalid session observation timing");
    }
    if (
      observation.sequence <= this.#lastSequence ||
      observation.timestampMs <= this.#lastTimestampMs
    )
      return;
    this.#lastSequence = observation.sequence;
    this.#lastTimestampMs = observation.timestampMs;
    const valid =
      observation.voiced &&
      observation.midi !== null &&
      Number.isFinite(observation.midi) &&
      PRACTICE_PITCH_STATES.includes(observation.state);
    const score = observation.stabilityScore;
    const current: SessionObservation = {
      ...observation,
      midi: valid && observation.midi !== null ? observation.midi + this.#midiOffset : null,
      voiced: valid,
      stabilityScore:
        valid && score !== null && Number.isFinite(score) && score >= 0 && score <= 100
          ? score
          : null,
    };
    const previous = this.#previous;
    const adjacent = previous !== null && current.sequence === previous.sequence + 1;
    const elapsed = adjacent ? current.timestampMs - previous.timestampMs : 0;
    const voiced = adjacent && previous.midi !== null && current.midi !== null;
    const stable =
      voiced &&
      previous.state === "stable" &&
      current.state === "stable" &&
      previous.stabilityScore !== null &&
      current.stabilityScore !== null;
    if (voiced) {
      this.#voicedMs += elapsed;
      if (current.stabilityScore !== null) {
        const index = Math.round(current.stabilityScore * SCORE_RESOLUTION);
        this.#scoreWeights[index] = (this.#scoreWeights[index] ?? 0) + elapsed;
      }
      const target = this.#configuration.targetMidi;
      if (target !== null) {
        const maxDeviation = Math.max(
          Math.abs(centsFromTargetMidi(previous.midi, target)),
          Math.abs(centsFromTargetMidi(current.midi, target)),
        );
        for (let index = 0; index < 3; index++) {
          if (maxDeviation <= (index + 1) * 10 + 1e-9)
            this.#withinMs[index] = (this.#withinMs[index] ?? 0) + elapsed;
        }
      }
    }
    this.#stableRunMs = stable ? this.#stableRunMs + elapsed : 0;
    if (stable) {
      this.#stableMs += elapsed;
      this.#longestStableMs = Math.max(this.#longestStableMs, this.#stableRunMs);
      this.#minStableMidi = Math.min(
        this.#minStableMidi ?? current.midi,
        previous.midi,
        current.midi,
      );
      this.#maxStableMidi = Math.max(
        this.#maxStableMidi ?? current.midi,
        previous.midi,
        current.midi,
      );
    }
    // A boundary explicitly breaks the preview path; compaction never reconnects it.
    if (!adjacent && this.#trace.length > 0)
      this.#appendTrace({ timestampMs: current.timestampMs, midi: null });
    this.#appendTrace({ timestampMs: current.timestampMs, midi: current.midi });
    this.#previous = current;
  }

  finish(
    endedAt: string,
    endedMonotonicMs: number,
    endReason: CompletedPracticeSession["endReason"],
  ): CompletedPracticeSession {
    if (this.#completed) return this.#completed;
    if (
      !validDate(endedAt) ||
      !Number.isFinite(endedMonotonicMs) ||
      endedMonotonicMs < this.#startedMonotonicMs
    )
      throw new RangeError("Invalid session end time");
    const ratio = (index: number): number | null =>
      this.#configuration.mode === "target" && this.#voicedMs > 0
        ? (this.#withinMs[index] ?? 0) / this.#voicedMs
        : null;
    this.#completed = Object.freeze({
      summary: Object.freeze({
        ...this.#configuration,
        ...this.#metadata,
        endedAt,
        durationMs: endedMonotonicMs - this.#startedMonotonicMs,
        voicedDurationMs: this.#voicedMs,
        stableDurationMs: this.#stableMs,
        longestStableDurationMs: this.#longestStableMs,
        minStableMidi: this.#minStableMidi,
        maxStableMidi: this.#maxStableMidi,
        medianStabilityScore: this.#medianScore(),
        within10CentsRatio: ratio(0),
        within20CentsRatio: ratio(1),
        within30CentsRatio: ratio(2),
        schemaVersion: 1 as const,
      }),
      trace: Object.freeze(this.#trace.map((point) => Object.freeze({ ...point }))),
      endReason,
    });
    return this.#completed;
  }

  #medianScore(): number | null {
    const total = this.#scoreWeights.reduce((sum, value) => sum + value, 0);
    if (total === 0) return null;
    let cumulative = 0;
    for (let index = 0; index < this.#scoreWeights.length; index++) {
      cumulative += this.#scoreWeights[index] ?? 0;
      if (cumulative >= total / 2) return index / SCORE_RESOLUTION;
    }
    return null;
  }

  #appendTrace(point: SessionTracePoint): void {
    this.#trace.push(point);
    if (this.#trace.length <= MAX_SESSION_TRACE_POINTS) return;
    // Pairwise compaction gives a bounded overview, not an equally spaced analysis series.
    const compacted: SessionTracePoint[] = [];
    for (let index = 0; index < this.#trace.length; index += 2) {
      const first = this.#trace[index];
      const second = this.#trace[index + 1];
      if (!first) continue;
      compacted.push(
        second
          ? {
              timestampMs: second.timestampMs,
              midi:
                first.midi === null || second.midi === null ? null : (first.midi + second.midi) / 2,
            }
          : first,
      );
    }
    this.#trace = compacted;
  }
}
