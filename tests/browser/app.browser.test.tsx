import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../../src/app/App";
import { PreferenceProvider } from "../../src/app/preferences";

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

async function renderApp() {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(
      <PreferenceProvider>
        <App />
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
    expect(document.querySelector<HTMLButtonElement>(".primary-button")?.disabled).toBe(true);
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
});
