import { AppError, type AppErrorCode, type AudioEngineStatus, toAppError } from "./audio-types";
import { requestMicrophoneAccess, stopMediaStream } from "./media-devices";
import pitchWorkerUrl from "./workers/pitch.worker.ts?worker&url";
import {
  isPitchWorkerResponse,
  PITCH_WORKER_NAME,
  PITCH_WORKER_PROTOCOL_VERSION,
  type PitchFrameProcessedMessage,
} from "./workers/worker-protocol";
import pcmCaptureWorkletUrl from "./worklets/pcm-capture.worklet.ts?worker&url";
import {
  DEFAULT_PCM_CAPTURE_CONFIG,
  isPcmCaptureMessage,
  PCM_CAPTURE_PROCESSOR_NAME,
} from "./worklets/pcm-capture-protocol";

export interface AudioEngineSnapshot {
  status: AudioEngineStatus;
  sampleRate: number | null;
  errorCode: AppErrorCode | null;
}

export interface DisconnectableAudioNode {
  disconnect(): void;
}

export interface ManagedAudioNode extends DisconnectableAudioNode {
  connect(destination: ManagedAudioNode): unknown;
}

export interface ManagedGainNode extends ManagedAudioNode {
  readonly gain: { value: number };
}

export type ManagedMessageListener = (event: MessageEvent<unknown>) => void;

export interface ManagedMessagePort {
  addEventListener(type: "message", listener: ManagedMessageListener): void;
  removeEventListener(type: "message", listener: ManagedMessageListener): void;
  start(): void;
  close(): void;
}

export interface ManagedAudioWorkletNode extends ManagedAudioNode {
  readonly port: ManagedMessagePort;
  addEventListener(type: "processorerror", listener: EventListener): void;
  removeEventListener(type: "processorerror", listener: EventListener): void;
}

export type ManagedWorkerMessageListener = (event: MessageEvent<unknown>) => void;

export interface ManagedWorker {
  addEventListener(type: "message", listener: ManagedWorkerMessageListener): void;
  addEventListener(type: "error" | "messageerror", listener: EventListener): void;
  removeEventListener(type: "message", listener: ManagedWorkerMessageListener): void;
  removeEventListener(type: "error" | "messageerror", listener: EventListener): void;
  postMessage(message: unknown, transfer: Transferable[]): void;
  terminate(): void;
}

export type ManagedAudioContextState = AudioContextState | "interrupted";

export interface ManagedAudioContext {
  readonly sampleRate: number;
  readonly state: ManagedAudioContextState;
  readonly destination: ManagedAudioNode;
  readonly audioWorklet: { addModule(moduleUrl: string): Promise<void> };
  addEventListener(type: "statechange", listener: EventListener): void;
  removeEventListener(type: "statechange", listener: EventListener): void;
  createMediaStreamSource(stream: MediaStream): ManagedAudioNode;
  createGain(): ManagedGainNode;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
}

export type MicrophoneRequester = () => Promise<MediaStream>;
export type AudioContextFactory = () => ManagedAudioContext;
export type AudioWorkletNodeFactory = (
  context: ManagedAudioContext,
  processorName: string,
  options: AudioWorkletNodeOptions,
) => ManagedAudioWorkletNode;
export type WorkerFactory = (moduleUrl: string, options: WorkerOptions) => ManagedWorker;

export interface AudioEngineDependencies {
  requestMicrophone: MicrophoneRequester;
  createAudioContext: AudioContextFactory;
  createAudioWorkletNode: AudioWorkletNodeFactory;
  createWorker: WorkerFactory;
  workletModuleUrl: string;
  workerModuleUrl: string;
  workerReadyTimeoutMs: number;
}

type AudioEngineListener = (snapshot: AudioEngineSnapshot) => void;
export type PitchWorkerFrameListener = (message: Readonly<PitchFrameProcessedMessage>) => void;

interface TrackListener {
  track: MediaStreamTrack;
  listener: EventListener;
}

interface WorkerStartup {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: AppError) => void;
  settled: boolean;
  timeoutId: ReturnType<typeof setTimeout> | null;
}

interface EngineResources {
  stream: MediaStream | null;
  readonly context: ManagedAudioContext;
  sourceNode: ManagedAudioNode | null;
  workletNode: ManagedAudioWorkletNode | null;
  muteGainNode: ManagedGainNode | null;
  worker: ManagedWorker | null;
  workerStartup: WorkerStartup | null;
  workerReady: boolean;
  lastForwardedSequence: number;
  lastProcessedSequence: number;
  contextStateListener: EventListener | null;
  workletMessageListener: ManagedMessageListener | null;
  processorErrorListener: EventListener | null;
  workerMessageListener: ManagedWorkerMessageListener | null;
  workerErrorListener: EventListener | null;
  workerMessageErrorListener: EventListener | null;
  readonly trackListeners: TrackListener[];
  released: boolean;
}

interface AudioContextGlobal {
  AudioContext?: new (options?: AudioContextOptions) => ManagedAudioContext;
  webkitAudioContext?: new (options?: AudioContextOptions) => ManagedAudioContext;
}

interface AudioWorkletNodeGlobal {
  AudioWorkletNode?: new (
    context: BaseAudioContext,
    name: string,
    options?: AudioWorkletNodeOptions,
  ) => AudioWorkletNode;
}

interface WorkerGlobal {
  Worker?: new (scriptURL: string | URL, options?: WorkerOptions) => Worker;
}

const INITIAL_SNAPSHOT: AudioEngineSnapshot = {
  status: "idle",
  sampleRate: null,
  errorCode: null,
};

const PCM_CAPTURE_NODE_OPTIONS: AudioWorkletNodeOptions = {
  numberOfInputs: 1,
  numberOfOutputs: 1,
  outputChannelCount: [1],
  channelCountMode: "max",
  processorOptions: DEFAULT_PCM_CAPTURE_CONFIG,
};

const PITCH_WORKER_OPTIONS: WorkerOptions = {
  type: "module",
  name: PITCH_WORKER_NAME,
};

const DEFAULT_WORKER_READY_TIMEOUT_MS = 5_000;

function createWorkerStartup(): WorkerStartup {
  let resolve!: () => void;
  let reject!: (error: AppError) => void;
  const promise = new Promise<void>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return {
    promise,
    resolve,
    reject,
    settled: false,
    timeoutId: null,
  };
}

function mapContextFailure(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  return new AppError("audio-context-failed", error);
}

function mapWorkletFailure(error: unknown): AppError {
  if (error instanceof AppError && error.code === "worklet-load-failed") {
    return error;
  }
  return new AppError("worklet-load-failed", error);
}

function mapWorkerFailure(error: unknown): AppError {
  if (error instanceof AppError && error.code === "worker-failed") {
    return error;
  }
  return new AppError("worker-failed", error);
}

function readContextState(context: ManagedAudioContext): ManagedAudioContextState {
  return context.state;
}

export function createBrowserAudioContext(): ManagedAudioContext {
  const scope = globalThis as unknown as AudioContextGlobal;
  const AudioContextConstructor = scope.AudioContext ?? scope.webkitAudioContext;

  if (!AudioContextConstructor) {
    throw new AppError("unsupported-browser");
  }

  try {
    return new AudioContextConstructor({ latencyHint: "interactive" });
  } catch (error) {
    throw mapContextFailure(error);
  }
}

export function createBrowserAudioWorkletNode(
  context: ManagedAudioContext,
  processorName: string,
  options: AudioWorkletNodeOptions,
): ManagedAudioWorkletNode {
  const AudioWorkletNodeConstructor = (globalThis as unknown as AudioWorkletNodeGlobal)
    .AudioWorkletNode;
  if (!AudioWorkletNodeConstructor) {
    throw new AppError("worklet-load-failed", new Error("AudioWorkletNode is unavailable"));
  }

  return new AudioWorkletNodeConstructor(
    context as unknown as BaseAudioContext,
    processorName,
    options,
  ) as unknown as ManagedAudioWorkletNode;
}

export function createBrowserWorker(moduleUrl: string, options: WorkerOptions): ManagedWorker {
  const WorkerConstructor = (globalThis as unknown as WorkerGlobal).Worker;
  if (!WorkerConstructor) {
    throw new AppError("worker-failed", new Error("Worker is unavailable"));
  }

  try {
    return new WorkerConstructor(moduleUrl, options) as unknown as ManagedWorker;
  } catch (error) {
    throw mapWorkerFailure(error);
  }
}

export function createAudioEngine(overrides: Partial<AudioEngineDependencies> = {}): AudioEngine {
  return new AudioEngine({
    requestMicrophone: overrides.requestMicrophone ?? requestMicrophoneAccess,
    createAudioContext: overrides.createAudioContext ?? createBrowserAudioContext,
    createAudioWorkletNode: overrides.createAudioWorkletNode ?? createBrowserAudioWorkletNode,
    createWorker: overrides.createWorker ?? createBrowserWorker,
    workletModuleUrl: overrides.workletModuleUrl ?? pcmCaptureWorkletUrl,
    workerModuleUrl: overrides.workerModuleUrl ?? pitchWorkerUrl,
    workerReadyTimeoutMs: overrides.workerReadyTimeoutMs ?? DEFAULT_WORKER_READY_TIMEOUT_MS,
  });
}

export class AudioEngine {
  readonly #dependencies: AudioEngineDependencies;
  readonly #listeners = new Set<AudioEngineListener>();
  readonly #workerFrameListeners = new Set<PitchWorkerFrameListener>();
  #snapshot: AudioEngineSnapshot = INITIAL_SNAPSHOT;
  #resources: EngineResources | null = null;
  #operation = 0;
  #startTask: Promise<void> | null = null;
  #stopTask: Promise<void> | null = null;
  #disposed = false;

  constructor(dependencies: AudioEngineDependencies) {
    this.#dependencies = dependencies;
  }

  readonly getSnapshot = (): AudioEngineSnapshot => this.#snapshot;

  readonly subscribe = (listener: AudioEngineListener): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly subscribeWorkerFrames = (listener: PitchWorkerFrameListener): (() => void) => {
    this.#workerFrameListeners.add(listener);
    return () => this.#workerFrameListeners.delete(listener);
  };

  async start(): Promise<void> {
    this.#assertUsable();

    if (this.#stopTask) {
      await this.#stopTask;
      this.#assertUsable();
    }
    if (this.#snapshot.status === "running") {
      return;
    }
    if (this.#snapshot.status === "suspended" && this.#resources?.context) {
      return this.resume();
    }
    if (this.#startTask) {
      return this.#startTask;
    }

    const operation = ++this.#operation;
    const task = this.#startFresh(operation);
    this.#startTask = task;

    try {
      await task;
    } finally {
      if (this.#startTask === task) {
        this.#startTask = null;
      }
    }
  }

  async suspend(): Promise<void> {
    this.#assertUsable();
    const resources = this.#resources;
    const context = resources?.context;

    if (!resources || !context || this.#snapshot.status !== "running") {
      return;
    }

    const operation = ++this.#operation;
    try {
      await context.suspend();
      if (this.#isCurrent(operation, resources)) {
        this.#synchronizeContextState(resources);
      }
    } catch (error) {
      if (!this.#isCurrent(operation, resources)) {
        return;
      }
      const appError = mapContextFailure(error);
      await this.#failAndRelease(resources, appError.code);
      throw appError;
    }
  }

  async resume(): Promise<void> {
    this.#assertUsable();

    if (this.#startTask) {
      await this.#startTask;
    }

    const resources = this.#resources;
    const context = resources?.context;
    if (!resources || !context) {
      return this.start();
    }
    if (context.state === "running") {
      this.#synchronizeContextState(resources);
      return;
    }

    const operation = ++this.#operation;
    this.#setSnapshot("starting", context.sampleRate, null);

    try {
      await context.resume();
      if (!this.#isCurrent(operation, resources)) {
        return;
      }
      if (context.state === "closed") {
        throw new Error("AudioContext closed while resuming");
      }
      this.#synchronizeContextState(resources);
    } catch (error) {
      if (!this.#isCurrent(operation, resources)) {
        return;
      }
      const appError = mapContextFailure(error);
      await this.#failAndRelease(resources, appError.code);
      throw appError;
    }
  }

  async stop(): Promise<void> {
    this.#assertUsable();
    if (this.#stopTask) {
      return this.#stopTask;
    }

    const task = this.#stopCurrentResources();
    this.#stopTask = task;
    try {
      await task;
    } finally {
      if (this.#stopTask === task) {
        this.#stopTask = null;
      }
    }
  }

  async dispose(): Promise<void> {
    if (this.#disposed) {
      return this.#stopTask ?? Promise.resolve();
    }

    this.#disposed = true;
    this.#listeners.clear();
    this.#workerFrameListeners.clear();
    if (this.#stopTask) {
      await this.#stopTask;
      return;
    }
    await this.#stopCurrentResources();
  }

  async #startFresh(operation: number): Promise<void> {
    this.#setSnapshot("requesting-permission", null, null);

    let context: ManagedAudioContext;
    try {
      // Construction stays in the original click call stack; awaiting permission first can
      // consume the transient user activation required by mobile audio implementations.
      context = this.#dependencies.createAudioContext();
    } catch (error) {
      if (!this.#isOperationCurrent(operation)) {
        return;
      }
      const appError = mapContextFailure(error);
      this.#setSnapshot("error", null, appError.code);
      throw appError;
    }

    const resources: EngineResources = {
      stream: null,
      context,
      sourceNode: null,
      workletNode: null,
      muteGainNode: null,
      worker: null,
      workerStartup: null,
      workerReady: false,
      lastForwardedSequence: -1,
      lastProcessedSequence: -1,
      contextStateListener: null,
      workletMessageListener: null,
      processorErrorListener: null,
      workerMessageListener: null,
      workerErrorListener: null,
      workerMessageErrorListener: null,
      trackListeners: [],
      released: false,
    };
    this.#resources = resources;

    try {
      const contextStateListener: EventListener = () => {
        this.#handleContextStateChange(resources);
      };
      context.addEventListener("statechange", contextStateListener);
      resources.contextStateListener = contextStateListener;

      if (context.state === "closed") {
        throw new Error("AudioContext was closed during startup");
      }
    } catch (error) {
      const appError = mapContextFailure(error);
      this.#resources = null;
      await this.#releaseResources(resources);
      if (!this.#isOperationCurrent(operation)) {
        return;
      }
      this.#setSnapshot("error", null, appError.code);
      throw appError;
    }

    let stream: MediaStream;
    try {
      stream = await this.#dependencies.requestMicrophone();
    } catch (error) {
      const appError = toAppError(error);
      if (this.#resources === resources) {
        this.#resources = null;
      }
      await this.#releaseResources(resources);
      if (!this.#isOperationCurrent(operation)) {
        return;
      }
      this.#setSnapshot("error", null, appError.code);
      throw appError;
    }

    if (!this.#isCurrent(operation, resources)) {
      this.#releaseLateStream(stream);
      return;
    }

    resources.stream = stream;
    try {
      this.#listenForEndedTracks(resources);
      this.#setSnapshot("starting", null, null);
      resources.sourceNode = context.createMediaStreamSource(stream);
    } catch (error) {
      await this.#handleStartupFailure(operation, resources, mapContextFailure(error));
      return;
    }

    try {
      await this.#initializeWorker(resources);
      if (!this.#isCurrent(operation, resources)) {
        await this.#releaseResources(resources);
        return;
      }
    } catch (error) {
      await this.#handleStartupFailure(operation, resources, mapWorkerFailure(error));
      return;
    }

    try {
      await context.audioWorklet.addModule(this.#dependencies.workletModuleUrl);
      if (!this.#isCurrent(operation, resources)) {
        await this.#releaseResources(resources);
        return;
      }

      const workletNode = this.#dependencies.createAudioWorkletNode(
        context,
        PCM_CAPTURE_PROCESSOR_NAME,
        PCM_CAPTURE_NODE_OPTIONS,
      );
      resources.workletNode = workletNode;

      const messageListener: ManagedMessageListener = (event) => {
        this.#handlePcmMessage(resources, event.data);
      };
      const processorErrorListener: EventListener = () => {
        void this.#failAndRelease(resources, "worklet-load-failed");
      };
      workletNode.port.addEventListener("message", messageListener);
      workletNode.addEventListener("processorerror", processorErrorListener);
      resources.workletMessageListener = messageListener;
      resources.processorErrorListener = processorErrorListener;
      workletNode.port.start();
    } catch (error) {
      await this.#handleStartupFailure(operation, resources, mapWorkletFailure(error));
      return;
    }

    try {
      const muteGainNode = context.createGain();
      muteGainNode.gain.value = 0;
      resources.muteGainNode = muteGainNode;
      resources.sourceNode.connect(resources.workletNode);
      resources.workletNode.connect(muteGainNode);
      muteGainNode.connect(context.destination);

      if (context.state !== "running") {
        await context.resume();
      }

      if (!this.#isCurrent(operation, resources)) {
        await this.#releaseResources(resources);
        return;
      }
      if (readContextState(context) === "closed") {
        throw new Error("AudioContext closed while starting");
      }

      this.#synchronizeContextState(resources);
    } catch (error) {
      await this.#handleStartupFailure(operation, resources, mapContextFailure(error));
    }
  }

  async #initializeWorker(resources: EngineResources): Promise<void> {
    const worker = this.#dependencies.createWorker(
      this.#dependencies.workerModuleUrl,
      PITCH_WORKER_OPTIONS,
    );
    resources.worker = worker;

    const messageListener: ManagedWorkerMessageListener = (event) => {
      this.#handleWorkerMessage(resources, event.data);
    };
    const errorListener: EventListener = (event) => {
      event.preventDefault();
      this.#handleWorkerFailure(resources, event);
    };
    const messageErrorListener: EventListener = (event) => {
      event.preventDefault();
      this.#handleWorkerFailure(resources, event);
    };
    resources.workerMessageListener = messageListener;
    resources.workerErrorListener = errorListener;
    resources.workerMessageErrorListener = messageErrorListener;
    worker.addEventListener("message", messageListener);
    worker.addEventListener("error", errorListener);
    worker.addEventListener("messageerror", messageErrorListener);

    const startup = createWorkerStartup();
    resources.workerStartup = startup;
    startup.timeoutId = setTimeout(
      () => {
        this.#handleWorkerFailure(resources, new Error("Pitch worker startup timed out"));
      },
      Math.max(0, this.#dependencies.workerReadyTimeoutMs),
    );

    try {
      worker.postMessage(
        {
          type: "configure",
          protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
          sampleRate: resources.context.sampleRate,
          frameSize: DEFAULT_PCM_CAPTURE_CONFIG.frameSize,
          hopSize: DEFAULT_PCM_CAPTURE_CONFIG.hopSize,
        },
        [],
      );
    } catch (error) {
      this.#rejectWorkerStartup(resources, mapWorkerFailure(error));
    }

    await startup.promise;
  }

  #handleWorkerMessage(resources: EngineResources, data: unknown): void {
    if (this.#resources !== resources || resources.released) {
      return;
    }
    if (!isPitchWorkerResponse(data)) {
      this.#handleWorkerFailure(resources, new Error("Pitch worker protocol violation"));
      return;
    }

    if (data.type === "worker-ready") {
      if (
        data.sampleRate !== resources.context.sampleRate ||
        data.frameSize !== DEFAULT_PCM_CAPTURE_CONFIG.frameSize ||
        data.hopSize !== DEFAULT_PCM_CAPTURE_CONFIG.hopSize
      ) {
        this.#handleWorkerFailure(resources, new Error("Pitch worker configuration mismatch"));
        return;
      }
      if (resources.workerReady) {
        return;
      }

      resources.workerReady = true;
      this.#resolveWorkerStartup(resources);
      return;
    }

    if (!resources.workerReady) {
      this.#handleWorkerFailure(resources, new Error("Pitch worker responded before ready"));
      return;
    }
    if (
      data.sequence <= resources.lastProcessedSequence ||
      data.sequence > resources.lastForwardedSequence
    ) {
      return;
    }

    resources.lastProcessedSequence = data.sequence;
    for (const listener of this.#workerFrameListeners) {
      listener(data);
    }
  }

  #handleWorkerFailure(resources: EngineResources, error: unknown): void {
    if (this.#resources !== resources || resources.released) {
      return;
    }

    const appError = mapWorkerFailure(error);
    if (resources.workerStartup && !resources.workerStartup.settled) {
      this.#rejectWorkerStartup(resources, appError);
      return;
    }

    void this.#failAndRelease(resources, appError.code);
  }

  #resolveWorkerStartup(resources: EngineResources): void {
    const startup = resources.workerStartup;
    if (!startup || startup.settled) {
      return;
    }

    startup.settled = true;
    if (startup.timeoutId !== null) {
      clearTimeout(startup.timeoutId);
      startup.timeoutId = null;
    }
    startup.resolve();
  }

  #rejectWorkerStartup(resources: EngineResources, error: AppError): void {
    const startup = resources.workerStartup;
    if (!startup || startup.settled) {
      return;
    }

    startup.settled = true;
    if (startup.timeoutId !== null) {
      clearTimeout(startup.timeoutId);
      startup.timeoutId = null;
    }
    startup.reject(error);
  }

  async #handleStartupFailure(
    operation: number,
    resources: EngineResources,
    appError: AppError,
  ): Promise<void> {
    if (this.#resources === resources) {
      this.#resources = null;
    }
    await this.#releaseResources(resources);

    if (!this.#isOperationCurrent(operation)) {
      return;
    }
    this.#setSnapshot("error", null, appError.code);
    throw appError;
  }

  async #stopCurrentResources(): Promise<void> {
    const operation = ++this.#operation;
    this.#startTask = null;
    const resources = this.#resources;
    this.#resources = null;

    if (!resources && this.#snapshot.status === "idle") {
      return;
    }

    this.#setSnapshot("stopping", this.#snapshot.sampleRate, null);
    const cleanupError = resources ? await this.#releaseResources(resources) : null;

    if (!this.#isOperationCurrent(operation)) {
      return;
    }
    if (cleanupError) {
      const appError = mapContextFailure(cleanupError);
      this.#setSnapshot("error", null, appError.code);
      throw appError;
    }

    this.#setSnapshot("idle", null, null);
  }

  #listenForEndedTracks(resources: EngineResources): void {
    const stream = resources.stream;
    if (!stream) {
      return;
    }

    for (const track of stream.getTracks()) {
      const listener: EventListener = () => {
        void this.#failAndRelease(resources, "device-disconnected");
      };
      track.addEventListener("ended", listener);
      resources.trackListeners.push({ track, listener });
    }
  }

  #handlePcmMessage(resources: EngineResources, data: unknown): void {
    if (
      this.#resources !== resources ||
      resources.released ||
      !resources.worker ||
      !resources.workerReady ||
      !isPcmCaptureMessage(data, DEFAULT_PCM_CAPTURE_CONFIG.frameSize)
    ) {
      return;
    }
    if (data.sequence <= resources.lastForwardedSequence) {
      return;
    }

    resources.lastForwardedSequence = data.sequence;
    try {
      resources.worker.postMessage(
        {
          type: "process-frame",
          protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
          sequence: data.sequence,
          samples: data.samples,
        },
        [data.samples.buffer],
      );
    } catch (error) {
      this.#handleWorkerFailure(resources, error);
    }
  }

  #handleContextStateChange(resources: EngineResources): void {
    if (this.#resources !== resources || resources.released) {
      return;
    }
    if (resources.context.state === "closed") {
      void this.#failAndRelease(resources, "audio-context-failed");
      return;
    }
    if (
      !resources.stream ||
      !resources.sourceNode ||
      !resources.workletNode ||
      !resources.muteGainNode
    ) {
      return;
    }
    this.#synchronizeContextState(resources);
  }

  #synchronizeContextState(resources: EngineResources): void {
    const context = resources.context;
    if (this.#resources !== resources || resources.released) {
      return;
    }

    if (context.state === "running") {
      this.#setSnapshot("running", context.sampleRate, null);
      return;
    }
    if (context.state === "suspended" || context.state === "interrupted") {
      this.#setSnapshot("suspended", context.sampleRate, null);
      return;
    }

    void this.#failAndRelease(resources, "audio-context-failed");
  }

  async #failAndRelease(resources: EngineResources, code: AppErrorCode): Promise<void> {
    if (this.#resources !== resources || resources.released) {
      return;
    }

    ++this.#operation;
    this.#startTask = null;
    this.#resources = null;
    this.#setSnapshot("error", null, code);
    await this.#releaseResources(resources);
  }

  async #releaseResources(resources: EngineResources): Promise<unknown | null> {
    if (resources.released) {
      return null;
    }
    resources.released = true;
    let firstError: unknown | null = null;
    const recordError = (error: unknown): void => {
      if (firstError === null) {
        firstError = error;
      }
    };

    if (resources.contextStateListener) {
      try {
        resources.context.removeEventListener("statechange", resources.contextStateListener);
      } catch (error) {
        recordError(error);
      }
    }
    for (const { track, listener } of resources.trackListeners) {
      try {
        track.removeEventListener("ended", listener);
      } catch (error) {
        recordError(error);
      }
    }
    if (resources.workerStartup && !resources.workerStartup.settled) {
      this.#rejectWorkerStartup(
        resources,
        new AppError("worker-failed", new Error("Pitch worker released during startup")),
      );
    }
    if (resources.worker && resources.workerMessageListener) {
      try {
        resources.worker.removeEventListener("message", resources.workerMessageListener);
      } catch (error) {
        recordError(error);
      }
    }
    if (resources.worker && resources.workerErrorListener) {
      try {
        resources.worker.removeEventListener("error", resources.workerErrorListener);
      } catch (error) {
        recordError(error);
      }
    }
    if (resources.worker && resources.workerMessageErrorListener) {
      try {
        resources.worker.removeEventListener("messageerror", resources.workerMessageErrorListener);
      } catch (error) {
        recordError(error);
      }
    }
    if (resources.worker) {
      try {
        resources.worker.terminate();
      } catch (error) {
        recordError(error);
      }
    }
    if (resources.workletNode && resources.workletMessageListener) {
      try {
        resources.workletNode.port.removeEventListener("message", resources.workletMessageListener);
      } catch (error) {
        recordError(error);
      }
    }
    if (resources.workletNode && resources.processorErrorListener) {
      try {
        resources.workletNode.removeEventListener(
          "processorerror",
          resources.processorErrorListener,
        );
      } catch (error) {
        recordError(error);
      }
    }
    if (resources.workletNode) {
      try {
        resources.workletNode.port.close();
      } catch (error) {
        recordError(error);
      }
    }

    for (const node of [resources.sourceNode, resources.workletNode, resources.muteGainNode]) {
      try {
        node?.disconnect();
      } catch (error) {
        recordError(error);
      }
    }
    if (resources.stream) {
      try {
        stopMediaStream(resources.stream);
      } catch (error) {
        recordError(error);
      }
    }
    if (resources.context.state !== "closed") {
      try {
        await resources.context.close();
      } catch (error) {
        recordError(error);
      }
    }

    return firstError;
  }

  #releaseLateStream(stream: MediaStream): void {
    try {
      stopMediaStream(stream);
    } catch {
      // The engine no longer owns UI state, but all tracks were still attempted by stopMediaStream.
    }
  }

  #isCurrent(operation: number, resources: EngineResources): boolean {
    return this.#isOperationCurrent(operation) && this.#resources === resources;
  }

  #isOperationCurrent(operation: number): boolean {
    return !this.#disposed && operation === this.#operation;
  }

  #setSnapshot(
    status: AudioEngineStatus,
    sampleRate: number | null,
    errorCode: AppErrorCode | null,
  ): void {
    const current = this.#snapshot;
    if (
      current.status === status &&
      current.sampleRate === sampleRate &&
      current.errorCode === errorCode
    ) {
      return;
    }

    this.#snapshot = { status, sampleRate, errorCode };
    for (const listener of this.#listeners) {
      listener(this.#snapshot);
    }
  }

  #assertUsable(): void {
    if (this.#disposed) {
      throw new AppError("audio-context-failed", new Error("AudioEngine is disposed"));
    }
  }
}
