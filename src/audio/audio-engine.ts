import { AppError, type AppErrorCode, type AudioEngineStatus, toAppError } from "./audio-types";
import { requestMicrophoneAccess, stopMediaStream } from "./media-devices";
import pcmCaptureWorkletUrl from "./worklets/pcm-capture.worklet.ts?worker&url";
import {
  DEFAULT_PCM_CAPTURE_CONFIG,
  isPcmCaptureMessage,
  PCM_CAPTURE_PROCESSOR_NAME,
  type PcmCaptureMessage,
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

export interface AudioEngineDependencies {
  requestMicrophone: MicrophoneRequester;
  createAudioContext: AudioContextFactory;
  createAudioWorkletNode: AudioWorkletNodeFactory;
  workletModuleUrl: string;
}

type AudioEngineListener = (snapshot: AudioEngineSnapshot) => void;
export type PcmCaptureListener = (message: Readonly<PcmCaptureMessage>) => void;

interface TrackListener {
  track: MediaStreamTrack;
  listener: EventListener;
}

interface EngineResources {
  stream: MediaStream | null;
  readonly context: ManagedAudioContext;
  sourceNode: ManagedAudioNode | null;
  workletNode: ManagedAudioWorkletNode | null;
  muteGainNode: ManagedGainNode | null;
  contextStateListener: EventListener | null;
  workletMessageListener: ManagedMessageListener | null;
  processorErrorListener: EventListener | null;
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

export function createAudioEngine(overrides: Partial<AudioEngineDependencies> = {}): AudioEngine {
  return new AudioEngine({
    requestMicrophone: overrides.requestMicrophone ?? requestMicrophoneAccess,
    createAudioContext: overrides.createAudioContext ?? createBrowserAudioContext,
    createAudioWorkletNode: overrides.createAudioWorkletNode ?? createBrowserAudioWorkletNode,
    workletModuleUrl: overrides.workletModuleUrl ?? pcmCaptureWorkletUrl,
  });
}

export class AudioEngine {
  readonly #dependencies: AudioEngineDependencies;
  readonly #listeners = new Set<AudioEngineListener>();
  readonly #pcmListeners = new Set<PcmCaptureListener>();
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

  readonly subscribePcmFrames = (listener: PcmCaptureListener): (() => void) => {
    this.#pcmListeners.add(listener);
    return () => this.#pcmListeners.delete(listener);
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
    this.#pcmListeners.clear();
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
      contextStateListener: null,
      workletMessageListener: null,
      processorErrorListener: null,
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
      !isPcmCaptureMessage(data, DEFAULT_PCM_CAPTURE_CONFIG.frameSize)
    ) {
      return;
    }

    for (const listener of this.#pcmListeners) {
      listener(data);
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
