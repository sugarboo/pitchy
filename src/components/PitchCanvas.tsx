import { useEffect, useRef } from "react";
import type { Theme } from "../app/preferences";
import {
  DEFAULT_PITCH_TRACE_MAX_MIDI,
  DEFAULT_PITCH_TRACE_MIN_MIDI,
  DEFAULT_PITCH_TRACE_WINDOW_MS,
  type PitchTraceBuffer,
} from "./pitch-trace";

interface PitchCanvasPalette {
  readonly grid: string;
  readonly trace: string;
  readonly traceGlow: string;
}

export interface PitchCanvasProps {
  readonly label: string;
  readonly theme: Theme;
  readonly trace: PitchTraceBuffer;
  readonly windowMs?: number;
  readonly minMidi?: number;
  readonly maxMidi?: number;
}

interface CanvasMetrics {
  readonly width: number;
  readonly height: number;
  readonly devicePixelRatio: number;
}

function resolvePositiveFinite(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement): CanvasMetrics | null {
  const bounds = canvas.getBoundingClientRect();
  const width = resolvePositiveFinite(bounds.width, canvas.clientWidth);
  const height = resolvePositiveFinite(bounds.height, canvas.clientHeight);
  if (width <= 0 || height <= 0) {
    return null;
  }

  const devicePixelRatio = resolvePositiveFinite(window.devicePixelRatio, 1);
  const pixelWidth = Math.max(1, Math.round(width * devicePixelRatio));
  const pixelHeight = Math.max(1, Math.round(height * devicePixelRatio));
  if (canvas.width !== pixelWidth) {
    canvas.width = pixelWidth;
  }
  if (canvas.height !== pixelHeight) {
    canvas.height = pixelHeight;
  }

  return { width, height, devicePixelRatio };
}

function readPalette(canvas: HTMLCanvasElement): PitchCanvasPalette {
  const styles = getComputedStyle(canvas);
  const read = (property: string, fallback: string): string =>
    styles.getPropertyValue(property).trim() || fallback;

  return {
    grid: read("--color-trace-grid", "rgba(158, 175, 198, 0.22)"),
    trace: read("--color-trace-line", "#62e5c2"),
    traceGlow: read("--color-trace-glow", "rgba(98, 229, 194, 0.3)"),
  };
}

function drawGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  minMidi: number,
  maxMidi: number,
  palette: PitchCanvasPalette,
): void {
  context.beginPath();
  for (let division = 1; division < 5; division += 1) {
    const x = (width * division) / 5;
    context.moveTo(x, 0);
    context.lineTo(x, height);
  }

  const firstOctaveMidi = Math.ceil(minMidi / 12) * 12;
  for (let midi = firstOctaveMidi; midi <= maxMidi; midi += 12) {
    const y = ((maxMidi - midi) / (maxMidi - minMidi)) * height;
    context.moveTo(0, y);
    context.lineTo(width, y);
  }

  context.lineWidth = 1;
  context.strokeStyle = palette.grid;
  context.stroke();
}

function drawTrace(
  context: CanvasRenderingContext2D,
  trace: PitchTraceBuffer,
  width: number,
  height: number,
  windowMs: number,
  minMidi: number,
  maxMidi: number,
  palette: PitchCanvasPalette,
): void {
  const viewportEndMs = trace.latestTimestampMs;
  if (viewportEndMs === null) {
    return;
  }

  const viewportStartMs = viewportEndMs - windowMs;
  let segmentOpen = false;
  let latestVisibleX = 0;
  let latestVisibleY = 0;
  let hasLatestVisiblePoint = false;

  context.beginPath();
  trace.forEach((point) => {
    if (point.timestampMs < viewportStartMs) {
      return;
    }
    if (point.midi === null) {
      segmentOpen = false;
      hasLatestVisiblePoint = false;
      return;
    }

    const x = ((point.timestampMs - viewportStartMs) / windowMs) * width;
    const boundedMidi = Math.min(maxMidi, Math.max(minMidi, point.midi));
    const y = ((maxMidi - boundedMidi) / (maxMidi - minMidi)) * height;
    if (segmentOpen) {
      context.lineTo(x, y);
    } else {
      context.moveTo(x, y);
      segmentOpen = true;
    }
    latestVisibleX = x;
    latestVisibleY = y;
    hasLatestVisiblePoint = true;
  });

  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = 2.25;
  context.shadowBlur = 8;
  context.shadowColor = palette.traceGlow;
  context.strokeStyle = palette.trace;
  context.stroke();

  if (hasLatestVisiblePoint) {
    context.beginPath();
    context.arc(latestVisibleX, latestVisibleY, 2.75, 0, Math.PI * 2);
    context.fillStyle = palette.trace;
    context.fill();
  }
}

export function renderPitchCanvas(
  canvas: HTMLCanvasElement,
  trace: PitchTraceBuffer,
  windowMs: number,
  minMidi: number,
  maxMidi: number,
): boolean {
  if (
    !Number.isFinite(windowMs) ||
    windowMs <= 0 ||
    !Number.isFinite(minMidi) ||
    !Number.isFinite(maxMidi) ||
    minMidi >= maxMidi
  ) {
    throw new RangeError("Pitch canvas ranges must be finite and ordered");
  }

  const metrics = resizeCanvasToDisplaySize(canvas);
  const context = canvas.getContext("2d");
  if (!metrics || !context) {
    return false;
  }

  const palette = readPalette(canvas);
  context.setTransform(metrics.devicePixelRatio, 0, 0, metrics.devicePixelRatio, 0, 0);
  context.clearRect(0, 0, metrics.width, metrics.height);
  context.save();
  drawGrid(context, metrics.width, metrics.height, minMidi, maxMidi, palette);
  drawTrace(context, trace, metrics.width, metrics.height, windowMs, minMidi, maxMidi, palette);
  context.restore();
  return true;
}

export function PitchCanvas({
  label,
  theme,
  trace,
  windowMs = DEFAULT_PITCH_TRACE_WINDOW_MS,
  minMidi = DEFAULT_PITCH_TRACE_MIN_MIDI,
  maxMidi = DEFAULT_PITCH_TRACE_MAX_MIDI,
}: PitchCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    canvas.dataset.renderTheme = theme;

    let animationFrameId: number | null = null;
    const draw = (): void => {
      animationFrameId = null;
      renderPitchCanvas(canvas, trace, windowMs, minMidi, maxMidi);
    };
    const scheduleDraw = (): void => {
      if (document.visibilityState === "hidden" || animationFrameId !== null) {
        return;
      }
      animationFrameId = window.requestAnimationFrame(draw);
    };
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") {
        if (animationFrameId !== null) {
          window.cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        return;
      }
      scheduleDraw();
    };

    const unsubscribe = trace.subscribe(scheduleDraw);
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleDraw);
    resizeObserver?.observe(canvas);
    window.addEventListener("resize", scheduleDraw);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    scheduleDraw();

    return () => {
      unsubscribe();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleDraw);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [maxMidi, minMidi, theme, trace, windowMs]);

  return (
    <canvas ref={canvasRef} className="pitch-canvas" role="img" aria-label={label}>
      {label}
    </canvas>
  );
}
