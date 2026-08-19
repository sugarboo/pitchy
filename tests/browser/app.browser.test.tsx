import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type AppProps } from "../../src/app/App";
import { detectBrowserCapabilities } from "../../src/app/browser-capabilities";
import { PreferenceProvider } from "../../src/app/preferences";
import type {
  ManagedAudioContext,
  ManagedAudioContextState,
  ManagedAudioNode,
  ManagedAudioWorkletNode,
  ManagedMessageListener,
  ManagedWorker,
  ManagedWorkerMessageListener,
} from "../../src/audio/audio-engine";
import { AppError } from "../../src/audio/audio-types";
import {
  isConfigurePitchWorkerMessage,
  PITCH_WORKER_PROTOCOL_VERSION,
} from "../../src/audio/workers/worker-protocol";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

class FakeTrack extends EventTarget {
  readonly stop = vi.fn();

  end(): void {
    this.dispatchEvent(new Event("ended"));
  }
}

function createStream(...tracks: FakeTrack[]): MediaStream {
  return {
    getTracks: () => tracks as unknown as MediaStreamTrack[],
  } as unknown as MediaStream;
}

class FakeAudioNode implements ManagedAudioNode {
  readonly connect = vi.fn((_destination: ManagedAudioNode): ManagedAudioNode => _destination);
  readonly disconnect = vi.fn();
}

class FakeMessagePort {
  readonly #listeners = new Set<ManagedMessageListener>();
  readonly start = vi.fn();
  readonly close = vi.fn();

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
}

class FakeWorker implements ManagedWorker {
  readonly #messageListeners = new Set<ManagedWorkerMessageListener>();
  readonly #errorListeners = new Set<EventListener>();
  readonly #messageErrorListeners = new Set<EventListener>();
  readonly terminate = vi.fn();
  readonly postMessage = vi.fn((message: unknown, _transfer: Transferable[]): void => {
    if (!isConfigurePitchWorkerMessage(message)) {
      return;
    }

    const event = {
      data: {
        type: "worker-ready",
        protocolVersion: PITCH_WORKER_PROTOCOL_VERSION,
        sampleRate: message.sampleRate,
        frameSize: message.frameSize,
      },
    } as MessageEvent<unknown>;
    for (const listener of this.#messageListeners) {
      listener(event);
    }
  });

  addEventListener(
    type: "message" | "error" | "messageerror",
    listener: ManagedWorkerMessageListener | EventListener,
  ): void {
    if (type === "message") {
      this.#messageListeners.add(listener as ManagedWorkerMessageListener);
    } else if (type === "error") {
      this.#errorListeners.add(listener as EventListener);
    } else {
      this.#messageErrorListeners.add(listener as EventListener);
    }
  }

  removeEventListener(
    type: "message" | "error" | "messageerror",
    listener: ManagedWorkerMessageListener | EventListener,
  ): void {
    if (type === "message") {
      this.#messageListeners.delete(listener as ManagedWorkerMessageListener);
    } else if (type === "error") {
      this.#errorListeners.delete(listener as EventListener);
    } else {
      this.#messageErrorListeners.delete(listener as EventListener);
    }
  }

  get listenerCount(): number {
    return (
      this.#messageListeners.size + this.#errorListeners.size + this.#messageErrorListeners.size
    );
  }
}

class FakeAudioContext extends EventTarget implements ManagedAudioContext {
  readonly sampleRate: number;
  readonly sourceNode = new FakeAudioNode();
  readonly muteGainNode = Object.assign(new FakeAudioNode(), { gain: { value: 1 } });
  readonly destination = new FakeAudioNode();
  readonly addModule = vi.fn(async (_moduleUrl: string): Promise<void> => undefined);
  readonly audioWorklet = { addModule: this.addModule };
  state: ManagedAudioContextState;

  readonly createMediaStreamSource = vi.fn((_stream: MediaStream) => this.sourceNode);
  readonly createGain = vi.fn(() => this.muteGainNode);
  readonly resume = vi.fn(async () => this.transitionTo("running"));
  readonly suspend = vi.fn(async () => this.transitionTo("suspended"));
  readonly close = vi.fn(async () => this.transitionTo("closed"));

  constructor(state: ManagedAudioContextState = "suspended", sampleRate = 48_000) {
    super();
    this.state = state;
    this.sampleRate = sampleRate;
  }

  transitionTo(state: ManagedAudioContextState): void {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}

let root: Root | null = null;

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("pitchy.ui.locale", "zh-CN");
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  document.body.replaceChildren();
  window.localStorage.clear();
  Reflect.deleteProperty(document, "visibilityState");
  vi.restoreAllMocks();
});

function createSupportedSnapshot() {
  return detectBrowserCapabilities({
    isSecureContext: true,
    navigator: {
      mediaDevices: { getUserMedia: () => Promise.resolve() },
      serviceWorker: {},
    },
    AudioContext: class {},
    AudioWorkletNode: class {},
    Worker: class {},
    indexedDB: {},
  });
}

interface RenderAppOptions {
  strictMode?: boolean;
}

async function renderApp(props: AppProps = {}, options: RenderAppOptions = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const resolvedProps: AppProps = {
    createAudioWorkletNode: vi.fn(() => new FakeAudioWorkletNode()),
    createWorker: vi.fn(() => new FakeWorker()),
    workletModuleUrl: "/assets/pcm-capture.browser-test.js",
    workerModuleUrl: "/assets/pitch-worker.browser-test.js",
    ...props,
  };
  const app = (
    <PreferenceProvider>
      <App {...resolvedProps} />
    </PreferenceProvider>
  );

  await act(async () => {
    root?.render(options.strictMode ? <StrictMode>{app}</StrictMode> : app);
  });
}

describe("App", () => {
  it("renders the privacy-first welcome screen in a real browser", async () => {
    await renderApp();

    expect(document.querySelector("h1")?.textContent).toContain("听见每一次发声的变化");
    expect(document.body.textContent).toContain("原始音频默认不保存，也不上传");
    expect(document.querySelectorAll(".capability-list li")).toHaveLength(7);
    expect(document.querySelector<HTMLButtonElement>(".primary-button")?.disabled).toBe(
      !detectBrowserCapabilities().canStartPractice,
    );
  });

  it("switches and persists the theme and locale without remounting the app", async () => {
    await renderApp();

    const initialTheme = document.documentElement.dataset.theme;
    const themeButton = document.querySelector<HTMLButtonElement>(".theme-toggle");
    const languageButton = document.querySelector<HTMLButtonElement>(".language-toggle");
    const pitchCanvas = document.querySelector<HTMLCanvasElement>(".pitch-canvas");
    expect(themeButton).not.toBeNull();
    expect(languageButton).not.toBeNull();
    expect(pitchCanvas?.getAttribute("aria-label")).toBe("最近十秒音高轨迹");

    await act(async () => languageButton?.click());

    expect(document.querySelector("h1")?.textContent).toBe("Hear every change in your voice");
    expect(pitchCanvas?.getAttribute("aria-label")).toBe("Pitch trace for the last ten seconds");
    expect(document.documentElement.lang).toBe("en");
    expect(window.localStorage.getItem("pitchy.ui.locale")).toBe("en");

    await act(async () => themeButton?.click());

    const expectedTheme = initialTheme === "dark" ? "light" : "dark";
    expect(document.documentElement.dataset.theme).toBe(expectedTheme);
    expect(document.documentElement.style.colorScheme).toBe(expectedTheme);
    expect(window.localStorage.getItem("pitchy.ui.theme")).toBe(expectedTheme);
    expect(pitchCanvas?.dataset.renderTheme).toBe(expectedTheme);
  });

  it("runs, pauses, resumes, and stops one engine without rebuilding it for UI preferences", async () => {
    const firstTrack = new FakeTrack();
    const secondTrack = new FakeTrack();
    const stream = createStream(firstTrack, secondTrack);
    const context = new FakeAudioContext("suspended", 44_100);
    const requestMicrophone = vi.fn(async () => stream);
    const createAudioContext = vi.fn(() => context);
    const workletNode = new FakeAudioWorkletNode();
    const createAudioWorkletNode = vi.fn(() => workletNode);
    const worker = new FakeWorker();
    const createWorker = vi.fn(() => worker);
    await renderApp({
      supportOverride: createSupportedSnapshot(),
      requestMicrophone,
      createAudioContext,
      createAudioWorkletNode,
      createWorker,
      workletModuleUrl: "/assets/pcm-capture.integration.js",
      workerModuleUrl: "/assets/pitch-worker.integration.js",
    });

    const startButton = document.querySelector<HTMLButtonElement>(".primary-button");
    expect(startButton?.disabled).toBe(false);
    expect(requestMicrophone).not.toHaveBeenCalled();
    expect(createAudioContext).not.toHaveBeenCalled();

    await act(async () => startButton?.click());

    expect(requestMicrophone).toHaveBeenCalledOnce();
    expect(createAudioContext).toHaveBeenCalledOnce();
    expect(createWorker).toHaveBeenCalledExactlyOnceWith("/assets/pitch-worker.integration.js", {
      type: "module",
      name: "pitchy-pitch-worker",
    });
    expect(context.addModule).toHaveBeenCalledExactlyOnceWith("/assets/pcm-capture.integration.js");
    expect(createAudioWorkletNode).toHaveBeenCalledOnce();
    expect(context.sourceNode.connect).toHaveBeenCalledExactlyOnceWith(workletNode);
    expect(workletNode.connect).toHaveBeenCalledExactlyOnceWith(context.muteGainNode);
    expect(context.muteGainNode.connect).toHaveBeenCalledExactlyOnceWith(context.destination);
    expect(context.muteGainNode.gain.value).toBe(0);
    expect(context.resume).toHaveBeenCalledOnce();
    expect(firstTrack.stop).not.toHaveBeenCalled();
    expect(secondTrack.stop).not.toHaveBeenCalled();
    expect(document.querySelector(".permission-feedback")?.textContent).toContain(
      "本地音频环境已启动",
    );
    expect(document.querySelector(".permission-feedback")?.textContent).toContain("44,100 Hz");

    await act(async () => document.querySelector<HTMLButtonElement>(".language-toggle")?.click());
    await act(async () => document.querySelector<HTMLButtonElement>(".theme-toggle")?.click());

    expect(requestMicrophone).toHaveBeenCalledOnce();
    expect(createAudioContext).toHaveBeenCalledOnce();
    expect(createAudioWorkletNode).toHaveBeenCalledOnce();
    expect(createWorker).toHaveBeenCalledOnce();
    expect(document.querySelector(".permission-feedback")?.textContent).toContain(
      "Local audio is running",
    );

    await act(async () => document.querySelector<HTMLButtonElement>(".primary-button")?.click());
    expect(context.suspend).toHaveBeenCalledOnce();
    expect(document.querySelector(".permission-feedback")?.textContent).toContain(
      "Audio is paused",
    );
    expect(firstTrack.stop).not.toHaveBeenCalled();

    await act(async () => document.querySelector<HTMLButtonElement>(".primary-button")?.click());
    expect(context.resume).toHaveBeenCalledTimes(2);
    expect(document.querySelector(".permission-feedback")?.textContent).toContain(
      "Local audio is running",
    );

    await act(async () => document.querySelector<HTMLButtonElement>(".secondary-button")?.click());
    expect(context.sourceNode.disconnect).toHaveBeenCalledOnce();
    expect(workletNode.disconnect).toHaveBeenCalledOnce();
    expect(context.muteGainNode.disconnect).toHaveBeenCalledOnce();
    expect(workletNode.port.close).toHaveBeenCalledOnce();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.listenerCount).toBe(0);
    expect(firstTrack.stop).toHaveBeenCalledOnce();
    expect(secondTrack.stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
    expect(document.querySelector(".secondary-button")).toBeNull();
    expect(document.querySelector<HTMLButtonElement>(".primary-button")?.textContent).toContain(
      "Start practicing",
    );
  });

  it("keeps the retained audio engine usable when StrictMode replays its mount effect", async () => {
    const track = new FakeTrack();
    const context = new FakeAudioContext("suspended", 48_000);
    const workletNode = new FakeAudioWorkletNode();
    const requestMicrophone = vi.fn(async () => createStream(track));
    const createAudioContext = vi.fn(() => context);
    const createAudioWorkletNode = vi.fn(() => workletNode);
    const worker = new FakeWorker();
    const createWorker = vi.fn(() => worker);
    await renderApp(
      {
        supportOverride: createSupportedSnapshot(),
        requestMicrophone,
        createAudioContext,
        createAudioWorkletNode,
        createWorker,
      },
      { strictMode: true },
    );

    await act(async () => document.querySelector<HTMLButtonElement>(".primary-button")?.click());

    expect(requestMicrophone).toHaveBeenCalledOnce();
    expect(createAudioContext).toHaveBeenCalledOnce();
    expect(createAudioWorkletNode).toHaveBeenCalledOnce();
    expect(createWorker).toHaveBeenCalledOnce();
    expect(context.resume).toHaveBeenCalledOnce();
    expect(document.querySelector(".permission-feedback")?.textContent).toContain(
      "本地音频环境已启动",
    );

    await act(async () => {
      root?.unmount();
      root = null;
      await Promise.resolve();
    });

    expect(context.sourceNode.disconnect).toHaveBeenCalledOnce();
    expect(workletNode.disconnect).toHaveBeenCalledOnce();
    expect(context.muteGainNode.disconnect).toHaveBeenCalledOnce();
    expect(workletNode.port.close).toHaveBeenCalledOnce();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("requires a click to recover after a browser-driven AudioContext suspension", async () => {
    const context = new FakeAudioContext("running");
    await renderApp({
      supportOverride: createSupportedSnapshot(),
      requestMicrophone: vi.fn(async () => createStream(new FakeTrack())),
      createAudioContext: vi.fn(() => context),
    });
    await act(async () => document.querySelector<HTMLButtonElement>(".primary-button")?.click());

    await act(async () => context.transitionTo("suspended"));

    expect(document.querySelector<HTMLButtonElement>(".primary-button")?.textContent).toContain(
      "恢复练声",
    );
    expect(context.resume).not.toHaveBeenCalled();

    await act(async () => document.querySelector<HTMLButtonElement>(".primary-button")?.click());
    expect(context.resume).toHaveBeenCalledOnce();
    expect(document.querySelector(".permission-feedback")?.textContent).toContain(
      "本地音频环境已启动",
    );
  });

  it("pauses on page hide and does not resume automatically when visible again", async () => {
    const context = new FakeAudioContext("running");
    await renderApp({
      supportOverride: createSupportedSnapshot(),
      requestMicrophone: vi.fn(async () => createStream(new FakeTrack())),
      createAudioContext: vi.fn(() => context),
    });
    await act(async () => document.querySelector<HTMLButtonElement>(".primary-button")?.click());

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));

    expect(context.suspend).toHaveBeenCalledOnce();
    expect(document.querySelector(".permission-feedback")?.textContent).toContain("音频已暂停");

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(context.resume).not.toHaveBeenCalled();
    expect(document.querySelector(".permission-feedback")?.textContent).toContain("音频已暂停");
  });

  it("cancels startup on page hide and releases a stream that arrives later", async () => {
    const track = new FakeTrack();
    const context = new FakeAudioContext();
    let resolveRequest: ((stream: MediaStream) => void) | null = null;
    const requestMicrophone = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    await renderApp({
      supportOverride: createSupportedSnapshot(),
      requestMicrophone,
      createAudioContext: vi.fn(() => context),
    });
    await act(async () => document.querySelector<HTMLButtonElement>(".primary-button")?.click());

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(context.close).toHaveBeenCalledOnce();

    await act(async () => {
      resolveRequest?.(createStream(track));
      await Promise.resolve();
    });

    expect(track.stop).toHaveBeenCalledOnce();
    expect(document.querySelector<HTMLButtonElement>(".primary-button")?.textContent).toContain(
      "开始练声",
    );
  });

  it("stops a permission stream that resolves after the app unmounts", async () => {
    const track = new FakeTrack();
    let resolveRequest: ((stream: MediaStream) => void) | null = null;
    const requestMicrophone = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const context = new FakeAudioContext();
    const createAudioContext = vi.fn(() => context);
    await renderApp({
      supportOverride: createSupportedSnapshot(),
      requestMicrophone,
      createAudioContext,
    });

    await act(async () => document.querySelector<HTMLButtonElement>(".primary-button")?.click());
    await act(async () => {
      root?.unmount();
      root = null;
    });
    await act(async () => {
      resolveRequest?.(createStream(track));
      await Promise.resolve();
    });

    expect(track.stop).toHaveBeenCalledOnce();
    expect(createAudioContext).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("releases a running context and stream when the app unmounts", async () => {
    const track = new FakeTrack();
    const context = new FakeAudioContext("running");
    await renderApp({
      supportOverride: createSupportedSnapshot(),
      requestMicrophone: vi.fn(async () => createStream(track)),
      createAudioContext: vi.fn(() => context),
    });
    await act(async () => document.querySelector<HTMLButtonElement>(".primary-button")?.click());

    await act(async () => {
      root?.unmount();
      root = null;
      await Promise.resolve();
    });

    expect(context.sourceNode.disconnect).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("renders actionable permission errors from codes and retranslates them in place", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const requestMicrophone = vi.fn(async (): Promise<MediaStream> => {
      throw new AppError("permission-denied");
    });
    const context = new FakeAudioContext();
    const createAudioContext = vi.fn(() => context);
    await renderApp({
      supportOverride: createSupportedSnapshot(),
      requestMicrophone,
      createAudioContext,
    });

    await act(async () => document.querySelector<HTMLButtonElement>(".primary-button")?.click());

    expect(document.querySelector('[role="alert"]')?.textContent).toContain("麦克风权限已被拒绝");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("网站设置中允许麦克风");
    expect(createAudioContext).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();

    await act(async () => document.querySelector<HTMLButtonElement>(".language-toggle")?.click());

    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Microphone permission was denied",
    );
    expect(document.querySelector<HTMLButtonElement>(".primary-button")?.textContent).toContain(
      "Start again",
    );
  });
});
