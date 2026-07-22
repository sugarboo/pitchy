import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type AppProps } from "../../src/app/App";
import { detectBrowserCapabilities } from "../../src/app/browser-capabilities";
import { PreferenceProvider } from "../../src/app/preferences";
import { AppError } from "../../src/audio/audio-types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("pitchy.ui.locale", "zh-CN");
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  document.body.replaceChildren();
  window.localStorage.clear();
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

async function renderApp(props: AppProps = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(
      <PreferenceProvider>
        <App {...props} />
      </PreferenceProvider>,
    );
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
    expect(themeButton).not.toBeNull();
    expect(languageButton).not.toBeNull();

    await act(async () => languageButton?.click());

    expect(document.querySelector("h1")?.textContent).toBe("Hear every change in your voice");
    expect(document.documentElement.lang).toBe("en");
    expect(window.localStorage.getItem("pitchy.ui.locale")).toBe("en");

    await act(async () => themeButton?.click());

    const expectedTheme = initialTheme === "dark" ? "light" : "dark";
    expect(document.documentElement.dataset.theme).toBe(expectedTheme);
    expect(document.documentElement.style.colorScheme).toBe(expectedTheme);
    expect(window.localStorage.getItem("pitchy.ui.theme")).toBe(expectedTheme);
  });

  it("requests microphone access only after a click and stops every probe track", async () => {
    const firstStop = vi.fn();
    const secondStop = vi.fn();
    const requestMicrophone = vi.fn(
      async () =>
        ({
          getTracks: () => [{ stop: firstStop }, { stop: secondStop }],
        }) as unknown as MediaStream,
    );
    await renderApp({ supportOverride: createSupportedSnapshot(), requestMicrophone });

    const startButton = document.querySelector<HTMLButtonElement>(".primary-button");
    expect(startButton?.disabled).toBe(false);
    expect(requestMicrophone).not.toHaveBeenCalled();

    await act(async () => startButton?.click());

    expect(requestMicrophone).toHaveBeenCalledOnce();
    expect(firstStop).toHaveBeenCalledOnce();
    expect(secondStop).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain("麦克风权限已确认");
    expect(document.body.textContent).toContain("权限探测使用的轨道已停止");
    expect(startButton?.disabled).toBe(true);
  });

  it("stops a permission stream that resolves after the app unmounts", async () => {
    const stop = vi.fn();
    let resolveRequest: ((stream: MediaStream) => void) | null = null;
    const requestMicrophone = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    await renderApp({ supportOverride: createSupportedSnapshot(), requestMicrophone });

    await act(async () => document.querySelector<HTMLButtonElement>(".primary-button")?.click());
    await act(async () => {
      root?.unmount();
      root = null;
    });
    await act(async () => {
      resolveRequest?.({ getTracks: () => [{ stop }] } as unknown as MediaStream);
      await Promise.resolve();
    });

    expect(stop).toHaveBeenCalledOnce();
  });

  it("renders actionable permission errors from codes and retranslates them in place", async () => {
    const requestMicrophone = vi.fn(async (): Promise<MediaStream> => {
      throw new AppError("permission-denied");
    });
    await renderApp({ supportOverride: createSupportedSnapshot(), requestMicrophone });

    await act(async () => document.querySelector<HTMLButtonElement>(".primary-button")?.click());

    expect(document.querySelector('[role="alert"]')?.textContent).toContain("麦克风权限已被拒绝");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("网站设置中允许麦克风");

    await act(async () => document.querySelector<HTMLButtonElement>(".language-toggle")?.click());

    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Microphone permission was denied",
    );
    expect(document.querySelector<HTMLButtonElement>(".primary-button")?.textContent).toContain(
      "Request permission again",
    );
  });
});
