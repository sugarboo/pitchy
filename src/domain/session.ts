import type { PracticeConfiguration } from "./target-practice";

export interface PracticeSessionSummary extends PracticeConfiguration {
  readonly id: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly voicedDurationMs: number;
  readonly stableDurationMs: number;
  readonly longestStableDurationMs: number;
  readonly minStableMidi: number | null;
  readonly maxStableMidi: number | null;
  readonly medianStabilityScore: number | null;
  readonly within10CentsRatio: number | null;
  readonly within20CentsRatio: number | null;
  readonly within30CentsRatio: number | null;
  readonly inputDeviceLabel: string | null;
  readonly actualSampleRate: number;
  readonly schemaVersion: 1;
}

export interface SessionTracePoint {
  readonly timestampMs: number;
  readonly midi: number | null;
}

export interface CompletedPracticeSession {
  readonly summary: PracticeSessionSummary;
  readonly trace: readonly SessionTracePoint[];
  readonly endReason: "stopped" | "interrupted";
}
