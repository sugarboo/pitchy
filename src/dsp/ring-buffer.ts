export type RingBufferVisitor<T> = (value: T, index: number) => void;

export class FixedCapacityRingBuffer<T> {
  readonly #capacity: number;
  readonly #storage: Array<T | undefined>;
  #oldestIndex = 0;
  #size = 0;

  constructor(capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0) {
      throw new RangeError("Ring buffer capacity must be a positive safe integer");
    }

    this.#capacity = capacity;
    this.#storage = new Array<T | undefined>(capacity);
  }

  get capacity(): number {
    return this.#capacity;
  }

  get size(): number {
    return this.#size;
  }

  push(value: T): void {
    if (this.#size < this.#capacity) {
      const insertionIndex = (this.#oldestIndex + this.#size) % this.#capacity;
      this.#storage[insertionIndex] = value;
      this.#size += 1;
      return;
    }

    this.#storage[this.#oldestIndex] = value;
    this.#oldestIndex = (this.#oldestIndex + 1) % this.#capacity;
  }

  at(index: number): T {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.#size) {
      throw new RangeError("Ring buffer index is outside its populated range");
    }

    const storageIndex = (this.#oldestIndex + index) % this.#capacity;
    return this.#storage[storageIndex] as T;
  }

  get first(): T | undefined {
    return this.#size === 0 ? undefined : this.at(0);
  }

  get last(): T | undefined {
    return this.#size === 0 ? undefined : this.at(this.#size - 1);
  }

  forEach(visitor: RingBufferVisitor<T>): void {
    for (let index = 0; index < this.#size; index += 1) {
      visitor(this.at(index), index);
    }
  }

  clear(): void {
    for (let index = 0; index < this.#size; index += 1) {
      const storageIndex = (this.#oldestIndex + index) % this.#capacity;
      this.#storage[storageIndex] = undefined;
    }

    this.#oldestIndex = 0;
    this.#size = 0;
  }
}
