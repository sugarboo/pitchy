import { expect, test } from "@playwright/test";

test("loads the local-first application shell without third-party requests", async ({ page }) => {
  const thirdPartyRequests: string[] = [];

  page.on("request", (request) => {
    const requestUrl = new URL(request.url());
    if (requestUrl.protocol.startsWith("http") && requestUrl.origin !== "http://127.0.0.1:4173") {
      thirdPartyRequests.push(request.url());
    }
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("听见每一次发声的变化");
  await expect(page.getByText("原始音频默认不保存，也不上传。", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: /开始练声/ })).toBeVisible();
  expect(thirdPartyRequests).toEqual([]);
});

test("publishes a valid web app manifest", async ({ page, request }) => {
  await page.goto("/");

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toBeTruthy();

  const response = await request.get(manifestHref ?? "/manifest.webmanifest");
  expect(response.ok()).toBe(true);

  const manifest = (await response.json()) as {
    name?: string;
    display?: string;
    icons?: Array<{ src?: string }>;
  };
  expect(manifest.name).toBe("Pitchy 实时练声");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons?.[0]?.src).toBe("/icons/pitchy.svg");
});

test("persists explicit theme and language choices across reloads", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "切换到暗色主题" }).click();
  await page.getByRole("button", { name: "切换到英文" }).click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Hear every change in your voice",
  );

  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("button", { name: "Switch to Simplified Chinese" })).toBeVisible();
});

test("requests microphone access only after a click and explains a denial", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    class PermissionTestAudioContext extends EventTarget {
      readonly sampleRate = 48_000;
      state = "suspended";

      createMediaStreamSource(): { disconnect: () => void } {
        return { disconnect: () => undefined };
      }

      async resume(): Promise<void> {
        this.state = "running";
      }

      async suspend(): Promise<void> {
        this.state = "suspended";
      }

      async close(): Promise<void> {
        this.state = "closed";
      }
    }
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: PermissionTestAudioContext,
    });
    Object.defineProperty(window, "AudioWorkletNode", { configurable: true, value: class {} });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException("Permission denied", "NotAllowedError");
        },
      },
    });
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query: async () => ({ state: "denied" }) },
    });
  });

  await page.goto("/");

  const startButton = page.getByRole("button", { name: /开始练声/ });
  await expect(startButton).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);

  await startButton.click();

  await expect(page.getByRole("alert")).toContainText("麦克风权限已被拒绝");
  await expect(page.getByRole("alert")).toContainText("网站设置中允许麦克风");
  await expect(page.getByRole("button", { name: /重新开始/ })).toBeEnabled();
});

test("runs one local AudioContext through pause, resume, and complete cleanup", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const lifecycle = {
      requests: 0,
      sources: 0,
      modules: 0,
      workletNodes: 0,
      gains: 0,
      connections: 0,
      resumes: 0,
      suspends: 0,
      disconnects: 0,
      portStarts: 0,
      portCloses: 0,
      closes: 0,
      trackStops: 0,
    };
    Object.defineProperty(window, "__pitchyAudioLifecycle", { value: lifecycle });
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });

    class FakeTrack extends EventTarget {
      stop(): void {
        lifecycle.trackStops += 1;
      }
    }

    const track = new FakeTrack();
    const stream = {
      getTracks: () => [track],
    };

    class FakeAudioNode extends EventTarget {
      connect(): FakeAudioNode {
        lifecycle.connections += 1;
        return this;
      }

      disconnect(): void {
        lifecycle.disconnects += 1;
      }
    }

    class FakeMessagePort extends EventTarget {
      start(): void {
        lifecycle.portStarts += 1;
      }

      close(): void {
        lifecycle.portCloses += 1;
      }
    }

    class FakeAudioWorkletNode extends FakeAudioNode {
      readonly port = new FakeMessagePort();

      constructor() {
        super();
        lifecycle.workletNodes += 1;
      }
    }

    class FakeAudioContext extends EventTarget {
      readonly sampleRate = 44_100;
      readonly destination = new FakeAudioNode();
      readonly audioWorklet = {
        addModule: async () => {
          lifecycle.modules += 1;
        },
      };
      state = "suspended";

      createMediaStreamSource(): FakeAudioNode {
        lifecycle.sources += 1;
        return new FakeAudioNode();
      }

      createGain(): FakeAudioNode & { gain: { value: number } } {
        lifecycle.gains += 1;
        return Object.assign(new FakeAudioNode(), { gain: { value: 1 } });
      }

      async resume(): Promise<void> {
        lifecycle.resumes += 1;
        this.state = "running";
        this.dispatchEvent(new Event("statechange"));
      }

      async suspend(): Promise<void> {
        lifecycle.suspends += 1;
        this.state = "suspended";
        this.dispatchEvent(new Event("statechange"));
      }

      async close(): Promise<void> {
        lifecycle.closes += 1;
        this.state = "closed";
        this.dispatchEvent(new Event("statechange"));
      }
    }

    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: FakeAudioContext,
    });
    Object.defineProperty(window, "AudioWorkletNode", {
      configurable: true,
      value: FakeAudioWorkletNode,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          lifecycle.requests += 1;
          return stream;
        },
      },
    });
  });

  await page.goto("/");
  await expect(page.getByText("本地音频环境已启动")).toHaveCount(0);

  await page.getByRole("button", { name: /开始练声/ }).click();

  await expect(page.getByText("本地音频环境已启动")).toBeVisible();
  await expect(page.getByText(/实际采样率 44,100 Hz/)).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __pitchyAudioLifecycle: Record<string, number>;
          }
        ).__pitchyAudioLifecycle,
    ),
  ).toMatchObject({
    requests: 1,
    sources: 1,
    modules: 1,
    workletNodes: 1,
    gains: 1,
    connections: 3,
    resumes: 1,
    portStarts: 1,
    trackStops: 0,
  });

  await page.getByRole("button", { name: /暂停练声/ }).click();
  await expect(page.getByText("音频已暂停")).toBeVisible();

  await page.getByRole("button", { name: /恢复练声/ }).click();
  await expect(page.getByText("本地音频环境已启动")).toBeVisible();

  await page.getByRole("button", { name: "停止" }).click();
  await expect(page.getByRole("button", { name: /开始练声/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: "停止" })).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __pitchyAudioLifecycle: Record<string, number>;
          }
        ).__pitchyAudioLifecycle,
    ),
  ).toMatchObject({
    requests: 1,
    sources: 1,
    resumes: 2,
    suspends: 1,
    disconnects: 3,
    portCloses: 1,
    closes: 1,
    trackStops: 1,
  });
});

test("loads production audio-thread chunks and transfers synthetic PCM through the Worker", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    const workletModuleUrls: string[] = [];
    const NativeAudioContext = window.AudioContext;
    class InstrumentedAudioContext extends NativeAudioContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        const nativeAddModule = this.audioWorklet.addModule.bind(this.audioWorklet);
        Object.defineProperty(this.audioWorklet, "addModule", {
          configurable: true,
          value: async (moduleUrl: string, moduleOptions?: WorkletOptions) => {
            workletModuleUrls.push(new URL(moduleUrl, window.location.href).pathname);
            await nativeAddModule(moduleUrl, moduleOptions);
          },
        });
      }
    }
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: InstrumentedAudioContext,
    });
    Object.defineProperty(window, "__pitchyWorkletModuleUrls", {
      configurable: true,
      value: workletModuleUrls,
    });
    const pcmCapture = {
      count: 0,
      firstSequence: null as number | null,
      firstFrameLength: null as number | null,
      firstBufferByteLength: null as number | null,
    };
    const NativeAudioWorkletNode = window.AudioWorkletNode;
    class InstrumentedAudioWorkletNode extends NativeAudioWorkletNode {
      constructor(context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions) {
        super(context, name, options);
        this.port.addEventListener("message", (event: MessageEvent<unknown>) => {
          const message = event.data;
          if (
            typeof message !== "object" ||
            message === null ||
            !("type" in message) ||
            message.type !== "pcm-frame" ||
            !("samples" in message) ||
            !(message.samples instanceof Float32Array)
          ) {
            return;
          }

          pcmCapture.count += 1;
          if (pcmCapture.firstFrameLength === null) {
            pcmCapture.firstSequence =
              "sequence" in message && typeof message.sequence === "number"
                ? message.sequence
                : null;
            pcmCapture.firstFrameLength = message.samples.length;
            pcmCapture.firstBufferByteLength = message.samples.buffer.byteLength;
          }
        });
        this.port.start();
      }
    }
    Object.defineProperty(window, "AudioWorkletNode", {
      configurable: true,
      value: InstrumentedAudioWorkletNode,
    });
    Object.defineProperty(window, "__pitchyPcmCapture", {
      configurable: true,
      value: pcmCapture,
    });
    const pitchWorker = {
      moduleUrls: [] as string[],
      optionTypes: [] as Array<WorkerType | undefined>,
      optionNames: [] as Array<string | undefined>,
      configureCount: 0,
      processFrameCount: 0,
      readyCount: 0,
      processedCount: 0,
      nonSilentCount: 0,
      voicedCount: 0,
      firstVoicedMidi: null as number | null,
      firstNonSilentRms: null as number | null,
      firstNonSilentRmsDbfs: null as number | null,
      firstSequence: null as number | null,
      firstFrameLength: null as number | null,
      firstBufferByteLengthBefore: null as number | null,
      firstBufferByteLengthAfter: null as number | null,
      terminates: 0,
    };
    const NativeWorker = window.Worker;
    class InstrumentedWorker extends NativeWorker {
      constructor(scriptURL: string | URL, options?: WorkerOptions) {
        super(scriptURL, options);
        pitchWorker.moduleUrls.push(new URL(scriptURL, window.location.href).pathname);
        pitchWorker.optionTypes.push(options?.type);
        pitchWorker.optionNames.push(options?.name);
        this.addEventListener("message", (event: MessageEvent<unknown>) => {
          const message = event.data;
          if (typeof message !== "object" || message === null || !("type" in message)) {
            return;
          }
          if (message.type === "worker-ready") {
            pitchWorker.readyCount += 1;
          } else if (message.type === "frame-processed") {
            pitchWorker.processedCount += 1;
            if (
              "voiced" in message &&
              message.voiced === true &&
              "midi" in message &&
              typeof message.midi === "number" &&
              Number.isFinite(message.midi)
            ) {
              pitchWorker.voicedCount += 1;
              pitchWorker.firstVoicedMidi ??= message.midi;
            }
            if (
              "rms" in message &&
              typeof message.rms === "number" &&
              Number.isFinite(message.rms) &&
              message.rms > 0 &&
              "rmsDbfs" in message &&
              typeof message.rmsDbfs === "number" &&
              Number.isFinite(message.rmsDbfs) &&
              message.rmsDbfs > -160
            ) {
              pitchWorker.nonSilentCount += 1;
              if (pitchWorker.firstNonSilentRms === null) {
                pitchWorker.firstNonSilentRms = message.rms;
                pitchWorker.firstNonSilentRmsDbfs = message.rmsDbfs;
              }
            }
          }
        });
      }

      override postMessage(
        message: unknown,
        transferOrOptions?: Transferable[] | StructuredSerializeOptions,
      ): void {
        let transferredBuffer: ArrayBuffer | null = null;
        if (
          typeof message === "object" &&
          message !== null &&
          "type" in message &&
          message.type === "configure"
        ) {
          pitchWorker.configureCount += 1;
        } else if (
          typeof message === "object" &&
          message !== null &&
          "type" in message &&
          message.type === "process-frame" &&
          "samples" in message &&
          message.samples instanceof Float32Array
        ) {
          pitchWorker.processFrameCount += 1;
          if (pitchWorker.firstFrameLength === null) {
            pitchWorker.firstSequence =
              "sequence" in message && typeof message.sequence === "number"
                ? message.sequence
                : null;
            pitchWorker.firstFrameLength = message.samples.length;
            transferredBuffer = message.samples.buffer;
            pitchWorker.firstBufferByteLengthBefore = transferredBuffer.byteLength;
          }
        }

        if (Array.isArray(transferOrOptions)) {
          super.postMessage(message, transferOrOptions);
        } else {
          super.postMessage(message, transferOrOptions);
        }
        if (transferredBuffer) {
          pitchWorker.firstBufferByteLengthAfter = transferredBuffer.byteLength;
        }
      }

      override terminate(): void {
        pitchWorker.terminates += 1;
        super.terminate();
      }
    }
    Object.defineProperty(window, "Worker", {
      configurable: true,
      value: InstrumentedWorker,
    });
    Object.defineProperty(window, "__pitchyWorkerLifecycle", {
      configurable: true,
      value: pitchWorker,
    });
    let generatorContext: AudioContext | null = null;
    let oscillator: OscillatorNode | null = null;

    Object.defineProperty(window, "__pitchyCloseSyntheticInput", {
      configurable: true,
      value: async () => {
        oscillator?.stop();
        oscillator = null;
        await generatorContext?.close();
        generatorContext = null;
      },
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          generatorContext = new AudioContext();
          const destination = generatorContext.createMediaStreamDestination();
          oscillator = generatorContext.createOscillator();
          oscillator.frequency.value = 440;
          oscillator.connect(destination);
          oscillator.start();
          await generatorContext.resume();
          return destination.stream;
        },
      },
    });
  });

  try {
    await page.goto("/");
    await page.getByRole("button", { name: /开始练声/ }).click();

    await expect(page.getByText("本地音频环境已启动")).toBeVisible();
    const workletModuleUrls = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __pitchyWorkletModuleUrls: string[];
          }
        ).__pitchyWorkletModuleUrls,
    );
    expect(workletModuleUrls).toHaveLength(1);
    expect(workletModuleUrls[0]).toMatch(/^\/assets\/pcm-capture\.worklet-[\w-]+\.js$/);
    expect(workletModuleUrls[0]).not.toContain(".ts");

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as typeof window & {
                __pitchyPcmCapture: { count: number };
              }
            ).__pitchyPcmCapture.count,
        ),
      )
      .toBeGreaterThan(0);
    await expect(page.locator(".note-name")).toHaveText("A4");
    await expect(page.locator(".frequency")).toContainText("440");
    await expect(page.locator(".detection-state")).toHaveText("已检测到稳定音高");
    const pcmCapture = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __pitchyPcmCapture: Record<string, number | null>;
          }
        ).__pitchyPcmCapture,
    );
    expect(pcmCapture).toMatchObject({
      firstSequence: 0,
      firstFrameLength: 4096,
      firstBufferByteLength: 4096 * Float32Array.BYTES_PER_ELEMENT,
    });
    const workerLifecycle = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __pitchyWorkerLifecycle: {
              moduleUrls: string[];
              optionTypes: Array<string | undefined>;
              optionNames: Array<string | undefined>;
              configureCount: number;
              readyCount: number;
            };
          }
        ).__pitchyWorkerLifecycle,
    );
    expect(workerLifecycle.moduleUrls).toHaveLength(1);
    expect(workerLifecycle.moduleUrls[0]).toMatch(/^\/assets\/pitch\.worker-[\w-]+\.js$/);
    expect(workerLifecycle.moduleUrls[0]).not.toContain(".ts");
    expect(workerLifecycle.optionTypes).toEqual(["module"]);
    expect(workerLifecycle.optionNames).toEqual(["pitchy-pitch-worker"]);
    expect(workerLifecycle.configureCount).toBe(1);
    expect(workerLifecycle.readyCount).toBe(1);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as typeof window & {
                __pitchyWorkerLifecycle: { processedCount: number };
              }
            ).__pitchyWorkerLifecycle.processedCount,
        ),
      )
      .toBeGreaterThan(0);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as typeof window & {
                __pitchyWorkerLifecycle: { nonSilentCount: number };
              }
            ).__pitchyWorkerLifecycle.nonSilentCount,
        ),
      )
      .toBeGreaterThan(0);
    const processedWorkerFrame = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __pitchyWorkerLifecycle: Record<string, number | null>;
          }
        ).__pitchyWorkerLifecycle,
    );
    expect(processedWorkerFrame).toMatchObject({
      processFrameCount: expect.any(Number),
      firstSequence: 0,
      firstFrameLength: 4096,
      firstBufferByteLengthBefore: 4096 * Float32Array.BYTES_PER_ELEMENT,
      firstBufferByteLengthAfter: 0,
    });
    expect(processedWorkerFrame.processFrameCount).toBeGreaterThan(0);
    expect(processedWorkerFrame.voicedCount).toBeGreaterThan(0);
    expect(processedWorkerFrame.firstVoicedMidi).toBeCloseTo(69, 1);
    const firstNonSilentRms = processedWorkerFrame.firstNonSilentRms;
    const firstNonSilentRmsDbfs = processedWorkerFrame.firstNonSilentRmsDbfs;
    expect(typeof firstNonSilentRms).toBe("number");
    expect(typeof firstNonSilentRmsDbfs).toBe("number");
    expect(firstNonSilentRms).toBeGreaterThan(0);
    expect(firstNonSilentRmsDbfs).toBeGreaterThan(-160);
    expect(firstNonSilentRmsDbfs).toBeCloseTo(20 * Math.log10(firstNonSilentRms as number), 6);
    await expect(page.getByText("本地音频环境已启动")).toBeVisible();
    await page.getByRole("button", { name: "停止" }).click();
    await expect(page.getByRole("button", { name: /开始练声/ })).toBeEnabled();
    expect(
      await page.evaluate(
        () =>
          (
            window as typeof window & {
              __pitchyWorkerLifecycle: { terminates: number };
            }
          ).__pitchyWorkerLifecycle.terminates,
      ),
    ).toBe(1);
  } finally {
    await page.evaluate(async () => {
      const closeSyntheticInput = (
        window as typeof window & { __pitchyCloseSyntheticInput?: () => Promise<void> }
      ).__pitchyCloseSyntheticInput;
      await closeSyntheticInput?.();
    });
  }
});
