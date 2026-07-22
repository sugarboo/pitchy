import { describe, expect, it } from "vitest";
import { type BrowserCapabilityScope, detectBrowserCapabilities } from "./browser-capabilities";

function createSupportedScope(): BrowserCapabilityScope {
  return {
    isSecureContext: true,
    navigator: {
      mediaDevices: { getUserMedia: () => Promise.resolve() },
      serviceWorker: {},
    },
    AudioContext: class {},
    AudioWorkletNode: class {},
    Worker: class {},
    indexedDB: {},
  };
}

describe("detectBrowserCapabilities", () => {
  it("allows practice when every required capability is available", () => {
    const result = detectBrowserCapabilities(createSupportedScope());

    expect(result.canStartPractice).toBe(true);
    expect(result.missingRequiredIds).toEqual([]);
    expect(result.capabilities.every((capability) => capability.supported)).toBe(true);
  });

  it("reports missing required capabilities by their user-facing labels", () => {
    const scope = createSupportedScope();
    scope.AudioWorkletNode = undefined;
    scope.navigator = { mediaDevices: {} };

    const result = detectBrowserCapabilities(scope);

    expect(result.canStartPractice).toBe(false);
    expect(result.missingRequiredIds).toEqual(["microphone", "audio-worklet"]);
  });

  it("does not block practice when only offline persistence is unavailable", () => {
    const scope = createSupportedScope();
    scope.indexedDB = undefined;
    scope.navigator = {
      mediaDevices: { getUserMedia: () => Promise.resolve() },
    };

    const result = detectBrowserCapabilities(scope);

    expect(result.canStartPractice).toBe(true);
    expect(result.capabilities.find((item) => item.id === "indexed-db")?.supported).toBe(false);
    expect(result.capabilities.find((item) => item.id === "service-worker")?.supported).toBe(false);
  });
});
