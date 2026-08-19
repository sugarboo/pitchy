import { FixedCapacityRingBuffer } from "../dsp/ring-buffer";

export const DEFAULT_PITCH_TRACE_CAPACITY = 512;
export const DEFAULT_PITCH_TRACE_WINDOW_MS = 10_000;
export const DEFAULT_PITCH_TRACE_MIN_MIDI = 36;
export const DEFAULT_PITCH_TRACE_MAX_MIDI = 88;

export interface PitchTracePoint {
  readonly timestampMs: number;
  readonly midi: number | null;
}

export type PitchTraceListener = () => void;
export type PitchTraceVisitor = (point: Readonly<PitchTracePoint>, index: number) => void;

export class PitchTraceBuffer {
  readonly #points: FixedCapacityRingBuffer<Readonly<PitchTracePoint>>;
  readonly #listeners = new Set<PitchTraceListener>();

  constructor(capacity = DEFAULT_PITCH_TRACE_CAPACITY) {
    this.#points = new FixedCapacityRingBuffer(capacity);
  }

  get capacity(): number {
    return this.#points.capacity;
  }

  get size(): number {
    return this.#points.size;
  }

  get latestTimestampMs(): number | null {
    return this.#points.last?.timestampMs ?? null;
  }

  append(point: PitchTracePoint): void {
    assertValidPitchTracePoint(point);
    const previousTimestampMs = this.latestTimestampMs;
    if (previousTimestampMs !== null && point.timestampMs < previousTimestampMs) {
      throw new RangeError("Pitch trace timestamps must be monotonic");
    }

    this.#points.push(
      Object.freeze({
        timestampMs: Object.is(point.timestampMs, -0) ? 0 : point.timestampMs,
        midi: point.midi === null || !Object.is(point.midi, -0) ? point.midi : 0,
      }),
    );
    this.#notify();
  }

  at(index: number): Readonly<PitchTracePoint> {
    return this.#points.at(index);
  }

  forEach(visitor: PitchTraceVisitor): void {
    this.#points.forEach(visitor);
  }

  clear(): void {
    this.#points.clear();
    this.#notify();
  }

  subscribe(listener: PitchTraceListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #notify(): void {
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

function assertValidPitchTracePoint(point: PitchTracePoint): void {
  if (!Number.isFinite(point.timestampMs) || point.timestampMs < 0) {
    throw new RangeError("Pitch trace timestamp must be a finite non-negative number");
  }
  if (point.midi !== null && !Number.isFinite(point.midi)) {
    throw new RangeError("Pitch trace MIDI must be finite or null");
  }
}
