import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PitchCanvas, renderPitchCanvas } from "../../src/components/PitchCanvas";
import { PitchTraceBuffer } from "../../src/components/pitch-trace";
import "../../src/styles/tokens.css";
import "../../src/styles/global.css";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let originalDevicePixelRatio: PropertyDescriptor | undefined;
let originalVisibilityState: PropertyDescriptor | undefined;

function setDevicePixelRatio(value: number): void {
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, value });
}

function setVisibilityState(value: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, value });
}

async function allowCanvasFrame(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 50));
}

beforeEach(() => {
  originalDevicePixelRatio = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
  originalVisibilityState = Object.getOwnPropertyDescriptor(document, "visibilityState");
  setDevicePixelRatio(1);
  setVisibilityState("visible");
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  document.body.replaceChildren();
  if (originalDevicePixelRatio) {
    Object.defineProperty(window, "devicePixelRatio", originalDevicePixelRatio);
  } else {
    Reflect.deleteProperty(window, "devicePixelRatio");
  }
  if (originalVisibilityState) {
    Object.defineProperty(document, "visibilityState", originalVisibilityState);
  } else {
    Reflect.deleteProperty(document, "visibilityState");
  }
  vi.restoreAllMocks();
});

describe("PitchCanvas", () => {
  it("uses DPR-sized backing pixels and coalesces high-rate writes without React renders", async () => {
    setDevicePixelRatio(2);
    const requestFrame = vi.spyOn(window, "requestAnimationFrame");
    const trace = new PitchTraceBuffer();
    const host = document.createElement("div");
    host.style.width = "240px";
    document.body.append(host);
    root = createRoot(host);
    let renderCount = 0;

    function Harness() {
      renderCount += 1;
      return <PitchCanvas label="Pitch trace" theme="dark" trace={trace} />;
    }

    await act(async () => root?.render(<Harness />));
    await allowCanvasFrame();

    const canvas = document.querySelector<HTMLCanvasElement>(".pitch-canvas");
    expect(canvas).not.toBeNull();
    const bounds = canvas?.getBoundingClientRect();
    expect(canvas?.width).toBe(Math.round((bounds?.width ?? 0) * 2));
    expect(canvas?.height).toBe(Math.round((bounds?.height ?? 0) * 2));
    expect(canvas?.getAttribute("aria-label")).toBe("Pitch trace");

    const framesBeforeWrites = requestFrame.mock.calls.length;
    for (let index = 0; index < 600; index += 1) {
      trace.append({ timestampMs: index * 20, midi: 69 + Math.sin(index / 10) });
    }

    expect(trace.size).toBe(512);
    expect(trace.at(0).timestampMs).toBe(88 * 20);
    expect(requestFrame.mock.calls.length).toBe(framesBeforeWrites + 1);
    expect(renderCount).toBe(1);
    await allowCanvasFrame();
  });

  it("does not connect voiced segments across an unvoiced gap", () => {
    const canvas = document.createElement("canvas");
    canvas.style.width = "200px";
    canvas.style.height = "100px";
    document.body.append(canvas);
    const trace = new PitchTraceBuffer();
    trace.append({ timestampMs: 0, midi: 60 });
    trace.append({ timestampMs: 500, midi: null });
    trace.append({ timestampMs: 1000, midi: 80 });

    expect(renderPitchCanvas(canvas, trace, 1000, 60, 80)).toBe(true);
    const context = canvas.getContext("2d");
    const gapPixels = context?.getImageData(95, 45, 10, 10).data ?? [];
    const gapAlpha = Array.from(gapPixels).filter((_, index) => index % 4 === 3);
    expect(gapAlpha.every((alpha) => alpha === 0)).toBe(true);

    trace.clear();
    trace.append({ timestampMs: 0, midi: 60 });
    trace.append({ timestampMs: 1000, midi: 80 });
    renderPitchCanvas(canvas, trace, 1000, 60, 80);
    const connectedPixels = context?.getImageData(95, 45, 10, 10).data ?? [];
    const connectedAlpha = Array.from(connectedPixels).filter((_, index) => index % 4 === 3);
    expect(connectedAlpha.some((alpha) => alpha > 0)).toBe(true);
  });

  it("cancels pending drawing while hidden and redraws once visible", async () => {
    const requestFrame = vi.spyOn(window, "requestAnimationFrame");
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame");
    const trace = new PitchTraceBuffer();
    const host = document.createElement("div");
    host.style.width = "240px";
    document.body.append(host);
    root = createRoot(host);
    await act(async () =>
      root?.render(<PitchCanvas label="Pitch trace" theme="dark" trace={trace} />),
    );
    await allowCanvasFrame();

    trace.append({ timestampMs: 0, midi: 69 });
    setVisibilityState("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(cancelFrame).toHaveBeenCalled();
    const requestsWhenHidden = requestFrame.mock.calls.length;

    trace.append({ timestampMs: 20, midi: 69.1 });
    window.dispatchEvent(new Event("resize"));
    expect(requestFrame.mock.calls.length).toBe(requestsWhenHidden);

    setVisibilityState("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(requestFrame.mock.calls.length).toBe(requestsWhenHidden + 1);
    await allowCanvasFrame();

    await act(async () => root?.unmount());
    root = null;
    const requestsAfterUnmount = requestFrame.mock.calls.length;
    trace.append({ timestampMs: 40, midi: 69.2 });
    expect(requestFrame.mock.calls.length).toBe(requestsAfterUnmount);
  });
});
