import { describe, expect, it } from "vitest";
import { FixedCapacityRingBuffer } from "./ring-buffer";

describe("FixedCapacityRingBuffer", () => {
  it("keeps insertion order until it reaches capacity", () => {
    const buffer = new FixedCapacityRingBuffer<number>(4);

    buffer.push(10);
    buffer.push(20);
    buffer.push(30);

    expect(buffer.capacity).toBe(4);
    expect(buffer.size).toBe(3);
    expect(buffer.first).toBe(10);
    expect(buffer.last).toBe(30);
    expect([0, 1, 2].map((index) => buffer.at(index))).toEqual([10, 20, 30]);
  });

  it("overwrites only the oldest values while retaining fixed capacity", () => {
    const buffer = new FixedCapacityRingBuffer<number>(3);

    for (const value of [1, 2, 3, 4, 5]) {
      buffer.push(value);
    }

    const visited: number[] = [];
    buffer.forEach((value) => {
      visited.push(value);
    });

    expect(buffer.size).toBe(3);
    expect(visited).toEqual([3, 4, 5]);
  });

  it("clears logical contents and can be reused after wrapping", () => {
    const buffer = new FixedCapacityRingBuffer<string>(2);
    buffer.push("old-a");
    buffer.push("old-b");
    buffer.push("old-c");

    buffer.clear();
    buffer.push("new-a");

    expect(buffer.size).toBe(1);
    expect(buffer.first).toBe("new-a");
    expect(buffer.last).toBe("new-a");
  });

  it("supports undefined as a stored value without confusing it with an empty slot", () => {
    const buffer = new FixedCapacityRingBuffer<number | undefined>(1);
    buffer.push(undefined);

    expect(buffer.size).toBe(1);
    expect(buffer.at(0)).toBeUndefined();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid capacity %s",
    (capacity) => {
      expect(() => new FixedCapacityRingBuffer(capacity)).toThrow(RangeError);
    },
  );

  it.each([-1, 0, 1, 1.5, Number.NaN])("rejects unavailable index %s", (index) => {
    const buffer = new FixedCapacityRingBuffer<number>(2);

    expect(() => buffer.at(index)).toThrow(RangeError);
  });
});
