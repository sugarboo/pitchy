import { bench, describe } from "vitest";
import { FixedCapacityRingBuffer } from "./ring-buffer";

const FRAME_COUNT = 4096;
const TRACE_CAPACITY = 512;
const points = Array.from({ length: FRAME_COUNT }, (_, index) => ({
  timestampMs: index * (2048 / 48_000) * 1000,
  midi: 69 + 0.25 * Math.sin((2 * Math.PI * index) / 24),
}));
const benchmarkSink = { checksum: 0 };

describe("fixed-capacity pitch trace buffer", () => {
  const buffer = new FixedCapacityRingBuffer<(typeof points)[number]>(TRACE_CAPACITY);

  bench("4096 writes plus one chronological traversal", () => {
    buffer.clear();
    for (const point of points) {
      buffer.push(point);
    }

    let checksum = 0;
    buffer.forEach((point) => {
      checksum += point.timestampMs + point.midi;
    });
    benchmarkSink.checksum = checksum;
  });
});
