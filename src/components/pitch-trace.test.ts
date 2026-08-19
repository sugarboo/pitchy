import { describe, expect, it, vi } from "vitest";
import { PitchTraceBuffer } from "./pitch-trace";

describe("PitchTraceBuffer", () => {
  it("retains only the newest fixed-capacity points including unvoiced gaps", () => {
    const trace = new PitchTraceBuffer(3);

    trace.append({ timestampMs: 0, midi: 69 });
    trace.append({ timestampMs: 40, midi: null });
    trace.append({ timestampMs: 80, midi: 69.2 });
    trace.append({ timestampMs: 120, midi: 69.3 });

    expect(trace.size).toBe(3);
    expect(trace.capacity).toBe(3);
    expect([0, 1, 2].map((index) => trace.at(index))).toEqual([
      { timestampMs: 40, midi: null },
      { timestampMs: 80, midi: 69.2 },
      { timestampMs: 120, midi: 69.3 },
    ]);
  });

  it("copies and freezes appended data so callers cannot rewrite history", () => {
    const trace = new PitchTraceBuffer();
    const point = { timestampMs: 10, midi: 68.5 };

    trace.append(point);
    point.midi = 90;

    expect(trace.at(0)).toEqual({ timestampMs: 10, midi: 68.5 });
    expect(Object.isFrozen(trace.at(0))).toBe(true);
  });

  it("notifies imperative consumers without creating a React-facing snapshot", () => {
    const trace = new PitchTraceBuffer();
    const listener = vi.fn();
    const unsubscribe = trace.subscribe(listener);

    trace.append({ timestampMs: 0, midi: 69 });
    trace.clear();
    unsubscribe();
    trace.append({ timestampMs: 1, midi: 70 });

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("normalizes signed zero and permits equal timestamps", () => {
    const trace = new PitchTraceBuffer();

    trace.append({ timestampMs: -0, midi: -0 });
    trace.append({ timestampMs: 0, midi: null });

    expect(Object.is(trace.at(0).timestampMs, -0)).toBe(false);
    expect(Object.is(trace.at(0).midi, -0)).toBe(false);
  });

  it.each([
    { timestampMs: -1, midi: 69 },
    { timestampMs: Number.NaN, midi: 69 },
    { timestampMs: Number.POSITIVE_INFINITY, midi: 69 },
    { timestampMs: 0, midi: Number.NaN },
    { timestampMs: 0, midi: Number.NEGATIVE_INFINITY },
  ])("rejects invalid point $timestampMs/$midi", (point) => {
    const trace = new PitchTraceBuffer();
    expect(() => trace.append(point)).toThrow(RangeError);
  });

  it("rejects time reversal until the trace is explicitly cleared", () => {
    const trace = new PitchTraceBuffer();
    trace.append({ timestampMs: 100, midi: 69 });

    expect(() => trace.append({ timestampMs: 99, midi: 69 })).toThrow(RangeError);

    trace.clear();
    expect(() => trace.append({ timestampMs: 0, midi: 72 })).not.toThrow();
  });
});
