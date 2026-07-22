import { describe, expect, it, vi } from "vitest";
import {
  AudioEngine,
  type AudioEngineDependencies,
  type ManagedAudioContext,
  type ManagedAudioContextState,
  type ManagedAudioNode,
  type ManagedAudioWorkletNode,
  type ManagedMessageListener,
} from "./audio-engine";
import { AppError } from "./audio-types";
import {
  DEFAULT_PCM_CAPTURE_CONFIG,
  PCM_CAPTURE_PROCESSOR_NAME,
} from "./worklets/pcm-capture-protocol";

class FakeTrack {
  readonly #listeners = new Set<EventListener>();
  readonly stop: ReturnType<typeof vi.fn>;

  constructor(stopFailure?: unknown) {
    this.stop = vi.fn(() => {
      if (stopFailure !== undefined) {
        throw stopFailure;
      }
    });
  }

  addEventListener(type: string, listener: EventListener): void {
    if (type === "ended") {
      this.#listeners.add(listener);
    }
  }

  removeEventListener(type: string, listener: EventListener): void {
    if (type === "ended") {
      this.#listeners.delete(listener);
    }
  }

  end(): void {
    for (const listener of this.#listeners) {
      listener(new Event("ended"));
    }
  }

  get listenerCount(): number {
    return this.#listeners.size;
  }
}

function createStream(...tracks: FakeTrack[]): MediaStream {
  return {
    getTracks: () => tracks as unknown as MediaStreamTrack[],
  } as unknown as MediaStream;
}

class FakeAudioNode implements ManagedAudioNode {
  readonly connect = vi.fn((_destination: ManagedAudioNode): ManagedAudioNode => _destination);
  readonly disconnect = vi.fn((): void => undefined);
}

class FakeMessagePort {
  readonly #listeners = new Set<ManagedMessageListener>();
  readonly start = vi.fn((): void => undefined);
  readonly close = vi.fn((): void => undefined);

  addEventListener(type: "message", listener: ManagedMessageListener): void {
    if (type === "message") {
      this.#listeners.add(listener);
    }
  }

  removeEventListener(type: "message", listener: ManagedMessageListener): void {
    if (type === "message") {
      this.#listeners.delete(listener);
    }
  }

  emit(data: unknown): void {
    const event = { data } as MessageEvent<unknown>;
    for (const listener of this.#listeners) {
      listener(event);
    }
  }

  get listenerCount(): number {
    return this.#listeners.size;
  }
}

class FakeAudioWorkletNode extends FakeAudioNode implements ManagedAudioWorkletNode {
  readonly #processorErrorListeners = new Set<EventListener>();
  readonly port = new FakeMessagePort();

  addEventListener(type: "processorerror", listener: EventListener): void {
    if (type === "processorerror") {
      this.#processorErrorListeners.add(listener);
    }
  }

  removeEventListener(type: "processorerror", listener: EventListener): void {
    if (type === "processorerror") {
      this.#processorErrorListeners.delete(listener);
    }
  }

  fail(): void {
    for (const listener of this.#processorErrorListeners) {
      listener(new Event("processorerror"));
    }
  }

  get processorErrorListenerCount(): number {
    return this.#processorErrorListeners.size;
  }
}

class FakeAudioContext implements ManagedAudioContext {
  readonly #listeners = new Set<EventListener>();
  readonly sampleRate: number;
  readonly sourceNode = new FakeAudioNode();
  readonly muteGainNode = Object.assign(new FakeAudioNode(), { gain: { value: 1 } });
  readonly destination = new FakeAudioNode();
  state: ManagedAudioContextState;
  addModuleFailure: unknown;
  resumeFailure: unknown;
  suspendFailure: unknown;
  closeFailure: unknown;

  readonly addModule = vi.fn(async (_moduleUrl: string) => {
    if (this.addModuleFailure !== undefined) {
      throw this.addModuleFailure;
    }
  });
  readonly audioWorklet = { addModule: this.addModule };
  readonly createMediaStreamSource = vi.fn((_stream: MediaStream) => this.sourceNode);
  readonly createGain = vi.fn(() => this.muteGainNode);
  readonly resume = vi.fn(async () => {
    if (this.resumeFailure !== undefined) {
      throw this.resumeFailure;
    }
    this.transitionTo("running");
  });
  readonly suspend = vi.fn(async () => {
    if (this.suspendFailure !== undefined) {
      throw this.suspendFailure;
    }
    this.transitionTo("suspended");
  });
  readonly close = vi.fn(async () => {
    if (this.closeFailure !== undefined) {
      throw this.closeFailure;
    }
    this.transitionTo("closed");
  });

  constructor(state: ManagedAudioContextState = "suspended", sampleRate = 48_000) {
    this.state = state;
    this.sampleRate = sampleRate;
  }

  addEventListener(type: "statechange", listener: EventListener): void {
    if (type === "statechange") {
      this.#listeners.add(listener);
    }
  }

  removeEventListener(type: "statechange", listener: EventListener): void {
    if (type === "statechange") {
      this.#listeners.delete(listener);
    }
  }

  transitionTo(state: ManagedAudioContextState): void {
    this.state = state;
    for (const listener of this.#listeners) {
      listener(new Event("statechange"));
    }
  }

  get listenerCount(): number {
    return this.#listeners.size;
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function createTestDependencies(
  overrides: Partial<AudioEngineDependencies>,
): AudioEngineDependencies {
  return {
    requestMicrophone: vi.fn(async () => createStream(new FakeTrack())),
    createAudioContext: vi.fn(() => new FakeAudioContext()),
    createAudioWorkletNode: vi.fn(() => new FakeAudioWorkletNode()),
    workletModuleUrl: "/assets/pcm-capture.test.js",
    ...overrides,
  };
}

function createEngine(
  stream: MediaStream,
  context: FakeAudioContext,
  workletNode = new FakeAudioWorkletNode(),
) {
  const requestMicrophone = vi.fn(async () => stream);
  const createAudioContext = vi.fn(() => context);
  const createAudioWorkletNode = vi.fn(() => workletNode);
  const engine = new AudioEngine(
    createTestDependencies({ requestMicrophone, createAudioContext, createAudioWorkletNode }),
  );
  return {
    createAudioContext,
    createAudioWorkletNode,
    engine,
    requestMicrophone,
    workletNode,
  };
}

describe("AudioEngine lifecycle", () => {
  it("creates and resumes audio only after start, then retains the stream", async () => {
    const track = new FakeTrack();
    const stream = createStream(track);
    const context = new FakeAudioContext("suspended", 44_100);
    const { createAudioContext, createAudioWorkletNode, engine, requestMicrophone, workletNode } =
      createEngine(stream, context);
    const statuses: string[] = [];
    engine.subscribe((snapshot) => statuses.push(snapshot.status));

    expect(requestMicrophone).not.toHaveBeenCalled();
    expect(createAudioContext).not.toHaveBeenCalled();

    await engine.start();

    expect(requestMicrophone).toHaveBeenCalledOnce();
    expect(createAudioContext).toHaveBeenCalledOnce();
    expect(context.createMediaStreamSource).toHaveBeenCalledExactlyOnceWith(stream);
    expect(context.addModule).toHaveBeenCalledExactlyOnceWith("/assets/pcm-capture.test.js");
    expect(createAudioWorkletNode).toHaveBeenCalledExactlyOnceWith(
      context,
      PCM_CAPTURE_PROCESSOR_NAME,
      expect.objectContaining({
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCountMode: "max",
        processorOptions: DEFAULT_PCM_CAPTURE_CONFIG,
      }),
    );
    expect(context.sourceNode.connect).toHaveBeenCalledExactlyOnceWith(workletNode);
    expect(workletNode.connect).toHaveBeenCalledExactlyOnceWith(context.muteGainNode);
    expect(context.muteGainNode.connect).toHaveBeenCalledExactlyOnceWith(context.destination);
    expect(context.muteGainNode.gain.value).toBe(0);
    expect(workletNode.port.start).toHaveBeenCalledOnce();
    expect(context.resume).toHaveBeenCalledOnce();
    expect(track.stop).not.toHaveBeenCalled();
    expect(statuses).toEqual(["requesting-permission", "starting", "running"]);
    expect(engine.getSnapshot()).toEqual({
      status: "running",
      sampleRate: 44_100,
      errorCode: null,
    });
  });

  it("suspends and resumes the same context without requesting another stream", async () => {
    const stream = createStream(new FakeTrack());
    const context = new FakeAudioContext("running");
    const { createAudioContext, engine, requestMicrophone } = createEngine(stream, context);
    await engine.start();

    await engine.suspend();
    expect(engine.getSnapshot().status).toBe("suspended");

    await engine.resume();
    expect(engine.getSnapshot().status).toBe("running");
    expect(context.suspend).toHaveBeenCalledOnce();
    expect(context.resume).toHaveBeenCalledOnce();
    expect(requestMicrophone).toHaveBeenCalledOnce();
    expect(createAudioContext).toHaveBeenCalledOnce();
  });

  it("reflects browser-driven suspension and resumes it on the next explicit action", async () => {
    const context = new FakeAudioContext("running");
    const { engine } = createEngine(createStream(new FakeTrack()), context);
    await engine.start();

    context.transitionTo("suspended");
    expect(engine.getSnapshot().status).toBe("suspended");

    await engine.start();
    expect(context.resume).toHaveBeenCalledOnce();
    expect(engine.getSnapshot().status).toBe("running");
  });

  it("disconnects the source, stops every track, closes the context, and removes listeners", async () => {
    const firstTrack = new FakeTrack();
    const secondTrack = new FakeTrack();
    const context = new FakeAudioContext("running");
    const { engine, workletNode } = createEngine(createStream(firstTrack, secondTrack), context);
    const statuses: string[] = [];
    engine.subscribe((snapshot) => statuses.push(snapshot.status));
    await engine.start();

    await engine.stop();

    expect(context.sourceNode.disconnect).toHaveBeenCalledOnce();
    expect(workletNode.disconnect).toHaveBeenCalledOnce();
    expect(context.muteGainNode.disconnect).toHaveBeenCalledOnce();
    expect(workletNode.port.close).toHaveBeenCalledOnce();
    expect(workletNode.port.listenerCount).toBe(0);
    expect(workletNode.processorErrorListenerCount).toBe(0);
    expect(firstTrack.stop).toHaveBeenCalledOnce();
    expect(secondTrack.stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
    expect(context.listenerCount).toBe(0);
    expect(firstTrack.listenerCount).toBe(0);
    expect(secondTrack.listenerCount).toBe(0);
    expect(statuses.slice(-2)).toEqual(["stopping", "idle"]);
    expect(engine.getSnapshot()).toEqual(INITIAL_ENGINE_SNAPSHOT);

    context.transitionTo("running");
    await engine.stop();
    expect(firstTrack.stop).toHaveBeenCalledOnce();
  });

  it("releases partial resources and reports a context startup failure", async () => {
    const failure = new Error("resume failed");
    const track = new FakeTrack();
    const context = new FakeAudioContext("suspended");
    context.resumeFailure = failure;
    const { engine } = createEngine(createStream(track), context);

    await expect(engine.start()).rejects.toMatchObject({
      code: "audio-context-failed",
      cause: failure,
    });

    expect(engine.getSnapshot()).toEqual({
      status: "error",
      sampleRate: null,
      errorCode: "audio-context-failed",
    });
    expect(context.sourceNode.disconnect).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
    expect(context.listenerCount).toBe(0);
    expect(track.listenerCount).toBe(0);
  });

  it("reports a worklet module load failure and releases partial resources", async () => {
    const failure = new Error("module load failed");
    const track = new FakeTrack();
    const context = new FakeAudioContext();
    context.addModuleFailure = failure;
    const { createAudioWorkletNode, engine } = createEngine(createStream(track), context);

    await expect(engine.start()).rejects.toMatchObject({
      code: "worklet-load-failed",
      cause: failure,
    });

    expect(createAudioWorkletNode).not.toHaveBeenCalled();
    expect(context.sourceNode.disconnect).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
    expect(engine.getSnapshot().errorCode).toBe("worklet-load-failed");
  });

  it("reports a worklet node construction failure with the same recoverable code", async () => {
    const failure = new Error("node construction failed");
    const track = new FakeTrack();
    const context = new FakeAudioContext();
    const { createAudioWorkletNode, engine } = createEngine(createStream(track), context);
    createAudioWorkletNode.mockImplementation(() => {
      throw failure;
    });

    await expect(engine.start()).rejects.toMatchObject({
      code: "worklet-load-failed",
      cause: failure,
    });

    expect(context.sourceNode.disconnect).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("forwards only validated PCM frame messages through the high-frequency subscription", async () => {
    const context = new FakeAudioContext("running");
    const { engine, workletNode } = createEngine(createStream(new FakeTrack()), context);
    const frames: Array<{ sequence: number; samples: Float32Array }> = [];
    const unsubscribe = engine.subscribePcmFrames((message) => frames.push(message));
    await engine.start();

    const validSamples = new Float32Array(DEFAULT_PCM_CAPTURE_CONFIG.frameSize);
    workletNode.port.emit({ type: "pcm-frame", sequence: 7, samples: validSamples });
    workletNode.port.emit({ type: "pcm-frame", sequence: 8, samples: new Float32Array(8) });
    workletNode.port.emit({ type: "unexpected", sequence: 9, samples: validSamples });

    expect(frames).toEqual([{ type: "pcm-frame", sequence: 7, samples: validSamples }]);

    unsubscribe();
    workletNode.port.emit({ type: "pcm-frame", sequence: 10, samples: validSamples });
    expect(frames).toHaveLength(1);
  });

  it("turns a processor failure into a worklet error and releases the full graph", async () => {
    const track = new FakeTrack();
    const context = new FakeAudioContext("running");
    const { engine, workletNode } = createEngine(createStream(track), context);
    await engine.start();

    workletNode.fail();
    await Promise.resolve();

    expect(engine.getSnapshot().errorCode).toBe("worklet-load-failed");
    expect(context.sourceNode.disconnect).toHaveBeenCalledOnce();
    expect(workletNode.disconnect).toHaveBeenCalledOnce();
    expect(context.muteGainNode.disconnect).toHaveBeenCalledOnce();
    expect(workletNode.port.close).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("does not request the microphone if synchronous context construction fails", async () => {
    const track = new FakeTrack();
    const stream = createStream(track);
    const failure = new Error("constructor failed");
    const requestMicrophone = vi.fn(async () => stream);
    const engine = new AudioEngine(
      createTestDependencies({
        requestMicrophone,
        createAudioContext: vi.fn(() => {
          throw failure;
        }),
      }),
    );

    await expect(engine.start()).rejects.toMatchObject({
      code: "audio-context-failed",
      cause: failure,
    });
    expect(requestMicrophone).not.toHaveBeenCalled();
    expect(track.stop).not.toHaveBeenCalled();
    expect(track.listenerCount).toBe(0);
    expect(engine.getSnapshot().errorCode).toBe("audio-context-failed");
  });

  it("invalidates a pending permission request and stops its late stream", async () => {
    const request = createDeferred<MediaStream>();
    const track = new FakeTrack();
    const context = new FakeAudioContext();
    const contextFactory = vi.fn(() => context);
    const engine = new AudioEngine(
      createTestDependencies({
        requestMicrophone: vi.fn(() => request.promise),
        createAudioContext: contextFactory,
      }),
    );

    const startTask = engine.start();
    expect(engine.getSnapshot().status).toBe("requesting-permission");
    await engine.stop();
    expect(engine.getSnapshot().status).toBe("idle");

    request.resolve(createStream(track));
    await startTask;

    expect(track.stop).toHaveBeenCalledOnce();
    expect(contextFactory).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
    expect(engine.getSnapshot().status).toBe("idle");
  });

  it("does not let suspend supersede an in-flight permission request", async () => {
    const request = createDeferred<MediaStream>();
    const track = new FakeTrack();
    const context = new FakeAudioContext();
    const engine = new AudioEngine(
      createTestDependencies({
        requestMicrophone: vi.fn(() => request.promise),
        createAudioContext: vi.fn(() => context),
      }),
    );

    const startTask = engine.start();
    await engine.suspend();
    expect(context.suspend).not.toHaveBeenCalled();
    expect(engine.getSnapshot().status).toBe("requesting-permission");

    request.resolve(createStream(track));
    await startTask;

    expect(engine.getSnapshot().status).toBe("running");
    expect(track.stop).not.toHaveBeenCalled();
  });

  it("turns an ended input track into a recoverable device error and cleans up", async () => {
    const track = new FakeTrack();
    const context = new FakeAudioContext("running");
    const { engine } = createEngine(createStream(track), context);
    await engine.start();

    track.end();
    await Promise.resolve();

    expect(engine.getSnapshot().errorCode).toBe("device-disconnected");
    expect(context.sourceNode.disconnect).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("treats an unexpected closed state as a context failure", async () => {
    const track = new FakeTrack();
    const context = new FakeAudioContext("running");
    const { engine } = createEngine(createStream(track), context);
    await engine.start();

    context.transitionTo("closed");
    await Promise.resolve();

    expect(engine.getSnapshot()).toEqual({
      status: "error",
      sampleRate: null,
      errorCode: "audio-context-failed",
    });
    expect(context.sourceNode.disconnect).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(context.close).not.toHaveBeenCalled();
  });

  it("keeps cleanup deterministic when a stop operation itself fails", async () => {
    const stopFailure = new Error("track stop failed");
    const firstTrack = new FakeTrack(stopFailure);
    const secondTrack = new FakeTrack();
    const context = new FakeAudioContext("running");
    const { engine } = createEngine(createStream(firstTrack, secondTrack), context);
    await engine.start();

    await expect(engine.stop()).rejects.toMatchObject({ code: "audio-context-failed" });

    expect(firstTrack.stop).toHaveBeenCalledOnce();
    expect(secondTrack.stop).toHaveBeenCalledOnce();
    expect(context.sourceNode.disconnect).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
    expect(engine.getSnapshot().errorCode).toBe("audio-context-failed");
  });

  it("preserves permission errors and closes the context created in the user action", async () => {
    const permissionError = new AppError("permission-denied");
    const context = new FakeAudioContext();
    const createAudioContext = vi.fn(() => context);
    const engine = new AudioEngine(
      createTestDependencies({
        requestMicrophone: vi.fn(async (): Promise<MediaStream> => {
          throw permissionError;
        }),
        createAudioContext,
      }),
    );

    await expect(engine.start()).rejects.toBe(permissionError);
    expect(createAudioContext).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
    expect(engine.getSnapshot().errorCode).toBe("permission-denied");
  });
});

const INITIAL_ENGINE_SNAPSHOT = {
  status: "idle",
  sampleRate: null,
  errorCode: null,
};
