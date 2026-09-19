import { describe, expect, it } from "vitest";
import {
  MAX_SESSION_TRACE_POINTS,
  SessionAggregator,
  type SessionObservation,
} from "./session-aggregator";
import type { PracticeConfiguration } from "./target-practice";

const metadata = {
  id: "session-1",
  startedAt: "2026-09-19T00:00:00.000Z",
  actualSampleRate: 48000,
  inputDeviceLabel: null,
};
const end = "2026-09-19T00:01:00.000Z";
const free: PracticeConfiguration = { mode: "free", targetMidi: null, tuningA4Hz: 440 };
function frame(
  sequence: number,
  midi: number | null = 69,
  stable = true,
  score: number | null = 90,
): SessionObservation {
  return {
    sequence,
    timestampMs: 85 + sequence * 40,
    midi,
    voiced: midi !== null,
    state: midi === null ? "silent" : stable ? "stable" : "onset",
    stabilityScore: midi === null ? null : score,
  };
}

describe("session aggregation", () => {
  it("weights stability by interval duration rather than number of frames", () => {
    const session = new SessionAggregator(free, metadata, 0);
    session.accept(frame(0, 69, true, 20));
    session.accept(frame(1, 69, true, 20));
    session.accept(frame(2, 69, true, 20));
    session.accept({ ...frame(3, 69, true, 90), timestampMs: 565 });
    expect(session.finish(end, 1000, "stopped").summary.medianStabilityScore).toBe(90);
  });
  it("produces an empty finite summary without inventing ratios, range or scores", () => {
    const session = new SessionAggregator(free, metadata, 100);
    const result = session.finish(end, 600, "stopped");
    expect(result.summary).toMatchObject({
      durationMs: 500,
      voicedDurationMs: 0,
      stableDurationMs: 0,
      longestStableDurationMs: 0,
      minStableMidi: null,
      maxStableMidi: null,
      medianStabilityScore: null,
      within10CentsRatio: null,
      within20CentsRatio: null,
      within30CentsRatio: null,
      schemaVersion: 1,
    });
    expect(result.trace).toEqual([]);
    expect(Object.isFrozen(result.summary)).toBe(true);
  });

  it("aggregates stable intervals and range without counting an isolated onset", () => {
    const session = new SessionAggregator(free, metadata, 0);
    session.accept(frame(0, 68, false));
    session.accept(frame(1, 69));
    session.accept(frame(2, 69.1));
    session.accept(frame(3, 69.2));
    session.accept(frame(4, null));
    session.accept(frame(5, 72));
    session.accept(frame(6, 72));
    const summary = session.finish(end, 1000, "stopped").summary;
    expect(summary.voicedDurationMs).toBe(160);
    expect(summary.stableDurationMs).toBe(120);
    expect(summary.longestStableDurationMs).toBe(80);
    expect(summary.minStableMidi).toBe(69);
    expect(summary.maxStableMidi).toBe(72);
    expect(summary.medianStabilityScore).toBe(90);
    expect(summary.within20CentsRatio).toBeNull();
  });

  it("breaks runs at pauses, gaps and invalid evidence and never replays a frame", () => {
    const session = new SessionAggregator(free, metadata, 0);
    session.accept(frame(0));
    session.accept(frame(1));
    session.setPaused(true);
    session.accept(frame(2));
    session.setPaused(false);
    session.accept(frame(3));
    session.accept(frame(4));
    session.accept(frame(4));
    session.accept(frame(2));
    session.accept(frame(6));
    session.accept(frame(7, Number.NaN));
    session.accept(frame(8));
    session.accept(frame(9));
    const result = session.finish(end, 60000, "interrupted");
    expect(result.summary.durationMs).toBe(60000);
    expect(result.summary.voicedDurationMs).toBe(120);
    expect(result.summary.longestStableDurationMs).toBe(40);
    expect(result.trace.some((point) => point.midi === null)).toBe(true);
    expect(result.endReason).toBe("interrupted");
  });

  it("computes nested inclusive target ratios using voiced intervals, not wall time or frame counts", () => {
    const session = new SessionAggregator({ ...free, mode: "target", targetMidi: 69 }, metadata, 0);
    // Equal-length segments, separated by silence: 10, 20, 30 and 40 cents.
    for (let index = 0; index < 4; index++) {
      const midi = 69 + (index + 1) / 10;
      session.accept(frame(index * 3, midi));
      session.accept(frame(index * 3 + 1, midi));
      session.accept(frame(index * 3 + 2, null));
    }
    const summary = session.finish(end, 60000, "stopped").summary;
    expect(summary.voicedDurationMs).toBe(160);
    expect(summary.within10CentsRatio).toBe(0.25);
    expect(summary.within20CentsRatio).toBe(0.5);
    expect(summary.within30CentsRatio).toBe(0.75);
  });

  it("distinguishes zero hits from insufficient target evidence", () => {
    const session = new SessionAggregator({ ...free, mode: "target", targetMidi: 57 }, metadata, 0);
    session.accept(frame(0));
    session.accept(frame(1));
    expect(session.finish(end, 1000, "stopped").summary.within30CentsRatio).toBe(0);
    const empty = new SessionAggregator({ ...free, mode: "target", targetMidi: 57 }, metadata, 0);
    empty.accept(frame(0, null));
    expect(empty.finish(end, 1000, "stopped").summary.within30CentsRatio).toBeNull();
  });

  it("retains tuning coordinates and the initial configuration independently of later changes", () => {
    const config = { mode: "target" as const, targetMidi: 70, tuningA4Hz: 415 };
    const session = new SessionAggregator(config, metadata, 0);
    config.targetMidi = 57;
    session.accept(frame(0));
    session.accept(frame(1));
    const summary = session.finish(end, 1000, "stopped").summary;
    expect(summary.targetMidi).toBe(70);
    expect(summary.minStableMidi).toBeCloseTo(70.0127, 3);
    expect(summary.within10CentsRatio).toBe(1);
  });

  it("uses bounded duration-weighted stability bins and caps the preview for long streams", () => {
    const session = new SessionAggregator(free, metadata, 0);
    for (let index = 0; index < 30000; index++) session.accept(frame(index, 69, true, 87.34));
    const result = session.finish(end, 1200000, "stopped");
    expect(result.trace.length).toBeLessThanOrEqual(MAX_SESSION_TRACE_POINTS);
    expect(result.trace.at(-1)?.timestampMs).toBe(85 + 29999 * 40);
    expect(result.summary.medianStabilityScore).toBe(87.3);
    expect(result.summary.longestStableDurationMs).toBe(29999 * 40);
    expect(JSON.stringify(result)).not.toContain("samples");
  });

  it("finalizes exactly once and cannot be changed by late frames", () => {
    const session = new SessionAggregator(free, metadata, 0);
    session.accept(frame(0));
    session.accept(frame(1));
    const first = session.finish(end, 1000, "stopped");
    session.accept(frame(2));
    expect(session.finish(end, 2000, "interrupted")).toBe(first);
    expect(first.summary.voicedDurationMs).toBe(40);
  });

  it("rejects invalid metadata and observation timing", () => {
    expect(() => new SessionAggregator(free, { ...metadata, actualSampleRate: 0 }, 0)).toThrow(
      RangeError,
    );
    expect(() => new SessionAggregator(free, { ...metadata, startedAt: "bad" }, 0)).toThrow(
      RangeError,
    );
    const session = new SessionAggregator(free, metadata, 100);
    expect(() => session.accept({ ...frame(0), timestampMs: Number.NaN })).toThrow(RangeError);
    expect(() => session.finish(end, 99, "stopped")).toThrow(RangeError);
  });
});
