import { describe, expect, it } from "vitest";
import { SessionAggregator } from "../domain/session-aggregator";
import { completedSessionSchema, settingsSchema } from "./schema";

function fixture() {
  return new SessionAggregator(
    { mode: "free", targetMidi: null, tuningA4Hz: 440 },
    {
      id: "fixture",
      startedAt: "2026-09-20T00:00:00.000Z",
      actualSampleRate: 48000,
      inputDeviceLabel: null,
    },
    0,
  ).finish("2026-09-20T00:00:01.000Z", 1000, "stopped");
}

describe("persistence schema", () => {
  it("accepts canonical empty summaries without replacing null evidence", () => {
    expect(completedSessionSchema.parse(fixture())).toEqual(fixture());
  });
  it.each([
    { schemaVersion: 2 },
    { tuningA4Hz: 467 },
    { actualSampleRate: Number.NaN },
    { durationMs: -1 },
    { stableDurationMs: 5 },
    { targetMidi: 69 },
    { within10CentsRatio: 1 },
    { minStableMidi: 69 },
    { samples: [1, 2] },
  ])("rejects invalid or unexpected summary evidence %j", (patch) => {
    const value = fixture();
    expect(
      completedSessionSchema.safeParse({ ...value, summary: { ...value.summary, ...patch } })
        .success,
    ).toBe(false);
  });
  it("rejects oversized/unordered traces and raw PCM at every stored boundary", () => {
    const value = fixture();
    expect(
      completedSessionSchema.safeParse({
        ...value,
        trace: Array.from({ length: 301 }, () => ({ timestampMs: 0, midi: null })),
      }).success,
    ).toBe(false);
    expect(
      completedSessionSchema.safeParse({
        ...value,
        trace: [
          { timestampMs: 10, midi: 69 },
          { timestampMs: 0, midi: 69 },
        ],
      }).success,
    ).toBe(false);
    expect(
      completedSessionSchema.safeParse({ ...value, samples: new Float32Array(2) }).success,
    ).toBe(false);
  });
  it("validates settings without coercion or silent missing keys", () => {
    expect(
      settingsSchema.safeParse({ theme: "dark", locale: "en", tuningA4Hz: 442.5 }).success,
    ).toBe(true);
    expect(
      settingsSchema.safeParse({ theme: "dark", locale: "en", tuningA4Hz: "440" }).success,
    ).toBe(false);
    expect(settingsSchema.safeParse({ theme: "dark", locale: "fr", tuningA4Hz: 440 }).success).toBe(
      false,
    );
  });
});
