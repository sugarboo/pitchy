import type { PitchFrameProcessedMessage } from "../../audio/workers/worker-protocol";
import type { PitchTraceBuffer } from "../../components/pitch-trace";
import {
  advanceTargetProgress,
  assertPracticeConfiguration,
  createTargetProgress,
  type PracticeConfiguration,
  type TargetProgress,
  targetDeviation,
} from "../../domain/target-practice";
import { tuningMidiOffset } from "./free-practice";

export const DEFAULT_LIVE_READOUT_INTERVAL_MS = 40;

export interface LivePitchScheduler {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(timeoutId: ReturnType<typeof setTimeout>): void;
}

export type LivePitchSnapshot =
  | (Readonly<PitchFrameProcessedMessage> & { readonly targetProgress?: TargetProgress | null })
  | null;
export type LivePitchListener = () => void;

const DEFAULT_SCHEDULER: LivePitchScheduler = {
  now: () => performance.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (timeoutId) => clearTimeout(timeoutId),
};

/**
 * Keeps the high-rate Canvas stream imperative while publishing only a
 * trailing, rate-limited snapshot to React and other low-frequency consumers.
 */
export class LivePitchStore {
  readonly #trace: PitchTraceBuffer;
  readonly #intervalMs: number;
  readonly #scheduler: LivePitchScheduler;
  readonly #listeners = new Set<LivePitchListener>();
  #snapshot: LivePitchSnapshot = null;
  #pending: LivePitchSnapshot = null;
  #configuration: PracticeConfiguration = { mode: "free", targetMidi: null, tuningA4Hz: 440 };
  #targetProgress = createTargetProgress();
  #paused = false;
  #lastPublishedAt = Number.NEGATIVE_INFINITY;
  #timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(
    trace: PitchTraceBuffer,
    intervalMs = DEFAULT_LIVE_READOUT_INTERVAL_MS,
    scheduler: LivePitchScheduler = DEFAULT_SCHEDULER,
  ) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      throw new RangeError("live readout interval must be finite and positive");
    }
    this.#trace = trace;
    this.#intervalMs = intervalMs;
    this.#scheduler = scheduler;
  }

  readonly getSnapshot = (): LivePitchSnapshot => this.#snapshot;

  readonly subscribe = (listener: LivePitchListener): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly acceptWorkerFrame = (message: Readonly<PitchFrameProcessedMessage>): void => {
    if (this.#paused) return;
    const target = this.#configuration.targetMidi;
    if (this.#configuration.mode === "target" && target !== null) {
      const midi =
        message.voiced && message.midi !== null
          ? message.midi + tuningMidiOffset(this.#configuration.tuningA4Hz)
          : null;
      this.#targetProgress = advanceTargetProgress(this.#targetProgress, {
        sequence: message.sequence,
        timestampMs: message.timestampMs,
        cents: targetDeviation(midi, target),
        stable: message.state === "stable",
      });
    }
    const snapshot = Object.freeze({
      ...message,
      targetProgress:
        this.#configuration.mode === "target"
          ? Object.freeze({
              hitDurationMs: this.#targetProgress.hitDurationMs,
              stableHitDurationMs: this.#targetProgress.stableHitDurationMs,
            })
          : null,
    });
    this.#trace.append({ timestampMs: snapshot.timestampMs, midi: snapshot.midi });
    this.#pending = snapshot;

    const elapsedMs = this.#scheduler.now() - this.#lastPublishedAt;
    if (this.#snapshot === null || elapsedMs >= this.#intervalMs) {
      if (this.#timeoutId !== null) {
        this.#scheduler.clearTimeout(this.#timeoutId);
        this.#timeoutId = null;
      }
      this.#publishPending();
      return;
    }
    if (this.#timeoutId === null) {
      const delayMs = Math.max(0, this.#intervalMs - Math.max(0, elapsedMs));
      this.#timeoutId = this.#scheduler.setTimeout(() => {
        this.#timeoutId = null;
        this.#publishPending();
      }, delayMs);
    }
  };

  configure(configuration: PracticeConfiguration): void {
    assertPracticeConfiguration(configuration);
    this.#configuration = { ...configuration };
    this.reset();
  }

  setPaused(paused: boolean): void {
    this.#paused = paused;
    if (paused) this.#targetProgress = { ...this.#targetProgress, previous: null };
  }

  reset(): void {
    const shouldNotify = this.#snapshot !== null;
    if (this.#timeoutId !== null) {
      this.#scheduler.clearTimeout(this.#timeoutId);
      this.#timeoutId = null;
    }
    this.#pending = null;
    this.#targetProgress = createTargetProgress();
    this.#snapshot = null;
    this.#lastPublishedAt = Number.NEGATIVE_INFINITY;
    this.#trace.clear();
    if (shouldNotify) {
      this.#notify();
    }
  }

  #publishPending(): void {
    if (this.#pending === null) {
      return;
    }
    this.#snapshot = this.#pending;
    this.#pending = null;
    this.#lastPublishedAt = this.#scheduler.now();
    this.#notify();
  }

  #notify(): void {
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
