import { describe, expect, it } from "vitest";
import { resolveInitialLocale, resolveInitialTheme } from "./preferences";

function createStorage(values: Record<string, string> = {}) {
  const data = new Map(Object.entries(values));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  };
}

describe("UI preference resolution", () => {
  it("uses a stored theme before the system preference", () => {
    expect(resolveInitialTheme(createStorage({ "pitchy.ui.theme": "light" }), true)).toBe("light");
  });

  it("falls back to the system theme when storage is absent or invalid", () => {
    expect(resolveInitialTheme(null, true)).toBe("dark");
    expect(resolveInitialTheme(createStorage({ "pitchy.ui.theme": "unknown" }), false)).toBe(
      "light",
    );
  });

  it("uses a stored locale before browser languages", () => {
    expect(resolveInitialLocale(createStorage({ "pitchy.ui.locale": "en" }), ["zh-CN"])).toBe("en");
  });

  it("selects Chinese or English from browser languages and otherwise falls back to Chinese", () => {
    expect(resolveInitialLocale(null, ["fr-FR", "en-US"])).toBe("en");
    expect(resolveInitialLocale(null, ["zh-Hant", "en-US"])).toBe("zh-CN");
    expect(resolveInitialLocale(null, ["fr-FR"])).toBe("zh-CN");
  });
});
