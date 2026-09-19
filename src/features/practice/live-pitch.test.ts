import { describe, expect, it, vi } from "vitest";
import {
  PITCH_WORKER_PROTOCOL_VERSION,
  type PitchFrameProcessedMessage,
} from "../../audio/workers/worker-protocol";
import { PitchTraceBuffer } from "../../components/pitch-trace";
import { SILENCE_DBFS } from "../../dsp/rms";
import { type LivePitchScheduler, LivePitchStore } from "./live-pitch";

class FakeScheduler implements LivePitchScheduler {
  #now = 0;
  #nextId = 1;
  readonly #tasks = new Map<number, { callback: () => void; dueAt: number }>();

  now(): number {
    return this.#now;
  }

  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout> {
    const id = this.#nextId;
    this.#nextId += 1;
    this.#tasks.set(id, { callback, dueAt: this.#now + delayMs });
    return id as ReturnType<typeof setTimeout>;
  }

  clearTimeout(timeoutId: ReturnType<typeof setTimeout>): void {
    this.#tasks.delete(timeoutId as number);
  }

  advanceBy(elapsedMs: number): void {
    this.#now += elapsedMs;
    const dueTasks = [...this.#tasks.entries()].filter(([, task]) => task.dueAt <= this.#now);
    for (const [id, task] of dueTasks) {
      this.#tasks.delete(id);
      task.callback();
    }
  }

  get pendingCount(): number {
    return this.#tasks.size;
  }
}

function createFrame(sequence: number, midi: number | null = 69): PitchFrameProcessedMessage {
  const voiced = midi !== null;
  return {
    type: "frame-processed" as const,
    protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
    sequence,
    timestampMs: sequence * 10,
    rms: voiced ? 0.5 : 0,
    rmsDbfs: voiced ? -6.020_599_913_279_624 : SILENCE_DBFS,
    frequencyHz: voiced ? 440 : null,
    confidence: voiced ? 0.99 : 0,
    voiced,
    midi,
    stabilityScore: voiced ? 100 : null,
    pitchSpreadCents: voiced ? 0 : null,
    trendCentsPerSecond: voiced ? 0 : null,
    validFrameRatio: voiced ? 1 : 0,
    continuousVoicedDurationMs: voiced ? 400 : 0,
    currentStableDurationMs: voiced ? 100 : 0,
    minStableMidi: voiced ? midi : null,
    maxStableMidi: voiced ? midi : null,
    state: voiced ? "stable" : "silent",
  };
}

describe("live pitch store", () => {
  it("finalizes all frames before stop clears live data and starts a fresh session after restart", () => {
    const scheduler = new FakeScheduler();
    const store = new LivePitchStore(new PitchTraceBuffer(), 40, scheduler);
    store.configure({ mode: "target", targetMidi: 69, tuningA4Hz: 440 });
    store.syncAudioStatus("requesting-permission", null);
    expect(store.getCompletedSession()).toBeNull();
    store.syncAudioStatus("running", 48000);
    store.acceptWorkerFrame(createFrame(0));
    store.acceptWorkerFrame(createFrame(1));
    store.acceptWorkerFrame(createFrame(2));
    expect(store.getSnapshot()?.sequence).toBe(0);
    scheduler.advanceBy(100);
    store.syncAudioStatus("stopping", 48000);
    const result = store.getCompletedSession();
    store.reset();
    store.syncAudioStatus("idle", null);
    expect(store.getCompletedSession()).toBe(result);
    expect(result?.summary.voicedDurationMs).toBe(20);
    expect(result?.summary.within10CentsRatio).toBe(1);
    expect(store.getSnapshot()).toBeNull();
    store.configure({ mode: "free", targetMidi: null, tuningA4Hz: 415 });
    store.syncAudioStatus("running", 44100);
    expect(store.getCompletedSession()).toBeNull();
    store.acceptWorkerFrame(createFrame(0));
    store.syncAudioStatus("error", null);
    expect(store.getCompletedSession()?.endReason).toBe("interrupted");
    expect(store.getCompletedSession()?.summary.voicedDurationMs).toBe(0);
    expect(store.getCompletedSession()?.summary.actualSampleRate).toBe(44100);
  });

  it("does not create a summary when permission fails before audio runs", () => {
    const store = new LivePitchStore(new PitchTraceBuffer(), 40, new FakeScheduler());
    store.configure({ mode: "free", targetMidi: null, tuningA4Hz: 440 });
    store.syncAudioStatus("requesting-permission", null);
    store.syncAudioStatus("error", null);
    expect(store.getCompletedSession()).toBeNull();
  });
  it("aggregates every target frame before UI throttling and excludes pause boundaries", () => {
    const scheduler = new FakeScheduler();
    const store = new LivePitchStore(new PitchTraceBuffer(), 40, scheduler);
    store.configure({ mode: "target", targetMidi: 69, tuningA4Hz: 440 });
    for (let sequence = 0; sequence < 5; sequence++) store.acceptWorkerFrame(createFrame(sequence));
    scheduler.advanceBy(40);
    expect(store.getSnapshot()?.targetProgress).toEqual({
      hitDurationMs: 40,
      stableHitDurationMs: 40,
    });
    store.setPaused(true);
    store.acceptWorkerFrame(createFrame(5));
    scheduler.advanceBy(5000);
    expect(store.getSnapshot()?.sequence).toBe(4);
    store.setPaused(false);
    store.acceptWorkerFrame(createFrame(6));
    store.acceptWorkerFrame(createFrame(7));
    scheduler.advanceBy(40);
    expect(store.getSnapshot()?.targetProgress?.hitDurationMs).toBe(50);
    store.reset();
    store.acceptWorkerFrame(createFrame(0));
    expect(store.getSnapshot()?.targetProgress?.hitDurationMs).toBe(0);
    store.configure({ mode: "free", targetMidi: null, tuningA4Hz: 440 });
    store.acceptWorkerFrame(createFrame(0));
    expect(store.getSnapshot()?.targetProgress).toBeNull();
  });

  it("uses selected tuning and rejects held/null octave candidates for target time", () => {
    const scheduler = new FakeScheduler();
    const store = new LivePitchStore(new PitchTraceBuffer(), 40, scheduler);
    store.configure({ mode: "target", targetMidi: 70, tuningA4Hz: 415 });
    store.acceptWorkerFrame(createFrame(0));
    store.acceptWorkerFrame(createFrame(1));
    store.acceptWorkerFrame({ ...createFrame(2), midi: null, state: "onset" });
    store.acceptWorkerFrame(createFrame(3));
    scheduler.advanceBy(40);
    expect(store.getSnapshot()?.targetProgress?.hitDurationMs).toBe(10);
  });
  it("feeds every frame to the trace while rate-limiting React snapshots", () => {
    const trace = new PitchTraceBuffer(128);
    const scheduler = new FakeScheduler();
    const store = new LivePitchStore(trace, 40, scheduler);
    const listener = vi.fn();
    store.subscribe(listener);

    for (let sequence = 0; sequence < 100; sequence += 1) {
      store.acceptWorkerFrame(createFrame(sequence));
    }

    expect(trace.size).toBe(100);
    expect(trace.at(99)).toEqual({ timestampMs: 990, midi: 69 });
    expect(store.getSnapshot()?.sequence).toBe(0);
    expect(listener).toHaveBeenCalledOnce();
    expect(scheduler.pendingCount).toBe(1);

    scheduler.advanceBy(40);

    expect(store.getSnapshot()?.sequence).toBe(99);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("preserves null observations as Canvas gaps without inventing pitch", () => {
    const trace = new PitchTraceBuffer();
    const store = new LivePitchStore(trace, 40, new FakeScheduler());

    store.acceptWorkerFrame(createFrame(0));
    store.acceptWorkerFrame(createFrame(1, null));

    expect(trace.at(0).midi).toBe(69);
    expect(trace.at(1).midi).toBeNull();
  });

  it("cancels a trailing update and clears both streams at a session boundary", () => {
    const trace = new PitchTraceBuffer();
    const scheduler = new FakeScheduler();
    const store = new LivePitchStore(trace, 40, scheduler);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.acceptWorkerFrame(createFrame(0));
    store.acceptWorkerFrame(createFrame(1));

    store.reset();
    scheduler.advanceBy(40);

    expect(store.getSnapshot()).toBeNull();
    expect(trace.size).toBe(0);
    expect(scheduler.pendingCount).toBe(0);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.acceptWorkerFrame(createFrame(2));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid publication intervals", () => {
    const trace = new PitchTraceBuffer();
    expect(() => new LivePitchStore(trace, 0)).toThrow(RangeError);
    expect(() => new LivePitchStore(trace, Number.NaN)).toThrow(RangeError);
  });
});
