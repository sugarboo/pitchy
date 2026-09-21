import { expect, type Page, test } from "@playwright/test";
import { preview } from "vite";

// Only the microphone source is replaced. Native audio threads and DSP still run.
async function installToneSource(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = { requests: 0, tracks: [] as MediaStreamTrack[] };
    Object.defineProperty(window, "__offlineInput", { value: state });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        state.requests += 1;
        const context = new AudioContext();
        const destination = context.createMediaStreamDestination();
        const tone = context.createOscillator();
        tone.frequency.value = 440;
        tone.connect(destination);
        tone.start();
        state.tracks.push(...destination.stream.getTracks());
        // Native track.stop does not dispatch ended; close the test generator too.
        for (const track of destination.stream.getTracks()) {
          const stop = track.stop.bind(track);
          track.stop = () => {
            stop();
            tone.stop();
            void context.close();
          };
        }
        await context.resume();
        return destination.stream;
      },
    });
  });
}

async function cachePaths(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const paths: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) {
        const url = new URL(request.url);
        if (url.origin !== location.origin || request.method !== "GET") {
          throw new Error("Unexpected cache origin or method");
        }
        paths.push(url.pathname);
      }
    }
    return paths.sort();
  });
}

for (const mode of ["free", "target"] as const) {
  test(`opens a cold page and completes ${mode} practice offline`, async ({ page, context }) => {
    // A private server can be shut down without disturbing parallel E2E tests.
    // This also rules out network-emulation gaps in Worklet fetch instrumentation.
    const server = await preview({ preview: { host: "127.0.0.1", port: 0, strictPort: true } });
    const address = server.httpServer.address();
    if (!address || typeof address === "string") throw new Error("Missing preview port");
    const appUrl = `http://127.0.0.1:${address.port}/`;
    let stopped = false;
    const stopServer = async (): Promise<void> => {
      if (stopped) return;
      stopped = true;
      const closed = new Promise<void>((resolve, reject) =>
        server.httpServer.close((error) => (error ? reject(error) : resolve())),
      );
      server.httpServer.closeAllConnections();
      await closed;
    };
    try {
      const requests: Array<{ url: string; method: string; body: string | null }> = [];
      context.on("request", (request) =>
        requests.push({
          url: request.url(),
          method: request.method(),
          body: request.postData(),
        }),
      );
      await page.goto(appUrl);
      await expect(page.getByText("应用已可离线打开。", { exact: true })).toBeVisible();
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      const initialCache = await cachePaths(page);
      expect(initialCache).toContain("/index.html");
      expect(initialCache).toContain("/manifest.webmanifest");
      expect(initialCache).toContain("/icons/pitchy.svg");
      expect(initialCache.some((path) => /\/pitch\.worker-[\w-]+\.js$/.test(path))).toBe(true);
      expect(initialCache.some((path) => /\/pcm-capture\.worklet-[\w-]+\.js$/.test(path))).toBe(
        true,
      );
      for (const path of initialCache) {
        expect(path).toMatch(
          /^\/(?:index\.html|manifest\.webmanifest|icons\/pitchy\.svg|assets\/[\w.-]+\.(?:js|css))$/,
        );
      }

      await page.getByRole("button", { name: "切换到暗色主题" }).click();
      await page.getByRole("spinbutton", { name: "A4 基准频率（Hz）" }).fill("432");
      await page.getByRole("spinbutton", { name: "A4 基准频率（Hz）" }).blur();
      await page.getByRole("button", { name: "切换到英文" }).click();
      // Reload once online to prove that the preference write completed before closing.
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(
        page.getByRole("spinbutton", { name: "A4 reference frequency (Hz)" }),
      ).toHaveValue("432");
      await page.close();
      await stopServer();
      await context.setOffline(true);
      const offline = await context.newPage();
      const cdp = await context.newCDPSession(offline);
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await installToneSource(offline);
      const errors: string[] = [];
      offline.on("pageerror", (error) => errors.push(error.message));
      const fromCache: string[] = [];
      context.on("response", (response) => {
        if (response.fromServiceWorker()) fromCache.push(new URL(response.url()).pathname);
      });
      const navigation = await offline.goto(appUrl);
      expect(navigation?.fromServiceWorker()).toBe(true);
      await expect(offline.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect(offline.locator("html")).toHaveAttribute("lang", "en");
      await expect(
        offline.getByRole("spinbutton", { name: "A4 reference frequency (Hz)" }),
      ).toHaveValue("432");
      expect(await offline.evaluate(() => navigator.onLine)).toBe(false);
      const inputState = () =>
        offline.evaluate(() => {
          const state = (
            window as typeof window & {
              __offlineInput: { requests: number; tracks: MediaStreamTrack[] };
            }
          ).__offlineInput;
          return {
            requests: state.requests,
            ended: state.tracks.every((track) => track.readyState === "ended"),
          };
        });
      expect((await inputState()).requests).toBe(0);
      await offline.getByRole("button", { name: "Switch to Simplified Chinese" }).click();
      const tuning = offline.getByRole("spinbutton", { name: "A4 基准频率（Hz）" });
      await tuning.fill("440");
      await tuning.blur();
      await offline.getByLabel("练习模式", { exact: true }).selectOption(mode);
      if (mode === "target") await offline.getByLabel("目标音", { exact: true }).selectOption("69");
      await offline.getByRole("button", { name: /开始练声/ }).click();
      await expect(offline.locator(".note-name")).toHaveText("A4");
      await expect(offline.locator(".frequency")).toContainText("440");
      await expect(offline.locator(".detection-state")).toHaveText("稳定");
      await offline.getByRole("button", { name: /暂停练声/ }).click();
      await offline.getByRole("button", { name: /恢复练声/ }).click();
      await expect(offline.locator(".note-name")).toHaveText("A4");
      await offline.getByRole("button", { name: "停止", exact: true }).click();
      await expect(offline.getByTestId("session-voiced")).not.toHaveText("0.0 秒");
      expect(await inputState()).toEqual({ requests: 1, ended: true });
      if (mode === "target")
        await expect(offline.getByTestId("session-within10")).toHaveText("100%");
      await offline.getByRole("button", { name: "保存本次摘要", exact: true }).click();
      await expect(offline.getByText("已保存 1 次练习摘要", { exact: true })).toBeVisible();
      await offline.reload();
      await expect(offline.locator("html")).toHaveAttribute("lang", "zh-CN");
      await expect(offline.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect(tuning).toHaveValue("440");
      await offline
        .getByRole("list", { name: "练习历史列表" })
        .locator("li button")
        .first()
        .click();
      await expect(offline.getByRole("heading", { name: "已保存的练习摘要" })).toBeVisible();
      await expect(offline.getByRole("img", { name: "练习音高概览" })).toBeVisible();
      if (mode === "target")
        await expect(offline.getByTestId("session-within10")).toHaveText("100%");
      await offline.getByRole("button", { name: "删除此记录", exact: true }).click();
      await offline.getByRole("button", { name: "确认删除此记录", exact: true }).click();
      await expect(offline.getByText("已保存 0 次练习摘要", { exact: true })).toBeVisible();
      expect(await cachePaths(offline)).toEqual(initialCache);
      expect(fromCache.some((path) => /\/pitch\.worker-/.test(path))).toBe(true);
      // Worklet response events are not exposed here; successful native DSP with
      // the server closed and HTTP cache disabled is the loading acceptance proof.
      expect(errors).toEqual([]);
      const origin = new URL(offline.url()).origin;
      for (const request of requests) {
        const url = new URL(request.url);
        expect(url.origin).toBe(origin);
        expect(request.method).toBe("GET");
        expect(request.body).toBeNull();
        expect(url.pathname).toMatch(
          /^\/(?:$|index\.html|manifest\.webmanifest|icons\/pitchy\.svg|sw\.js|workbox-[\w-]+\.js|assets\/[\w.-]+\.(?:js|css))$/,
        );
      }
    } finally {
      await stopServer();
    }
  });
}
