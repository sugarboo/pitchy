import { z } from "zod";

const duration = z.number().finite().nonnegative();
const midi = z
  .number()
  .finite()
  .refine((value) => Number.isSafeInteger(Math.round(value)));
const ratio = z.number().min(0).max(1).nullable();
export const settingsSchema = z.strictObject({
  theme: z.enum(["dark", "light"]),
  locale: z.enum(["zh-CN", "en"]),
  tuningA4Hz: z.number().min(415).max(466),
});
export type StoredPreferences = z.infer<typeof settingsSchema>;
export const settingRecordSchema = z.strictObject({
  key: z.literal("preferences"),
  value: settingsSchema,
  updatedAt: z.iso.datetime(),
  schemaVersion: z.literal(1),
});

export const summarySchema = z
  .strictObject({
    id: z.string().min(1).max(200),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime(),
    mode: z.enum(["free", "target"]),
    targetMidi: z.number().int().min(38).max(84).nullable(),
    tuningA4Hz: z.number().min(415).max(466),
    durationMs: duration,
    voicedDurationMs: duration,
    stableDurationMs: duration,
    longestStableDurationMs: duration,
    minStableMidi: midi.nullable(),
    maxStableMidi: midi.nullable(),
    medianStabilityScore: z.number().min(0).max(100).nullable(),
    within10CentsRatio: ratio,
    within20CentsRatio: ratio,
    within30CentsRatio: ratio,
    inputDeviceLabel: z.string().max(1000).nullable(),
    actualSampleRate: z.number().finite().positive(),
    schemaVersion: z.literal(1),
  })
  .refine((value) => {
    const ratios = [value.within10CentsRatio, value.within20CentsRatio, value.within30CentsRatio];
    return (
      (value.mode === "free"
        ? value.targetMidi === null && ratios.every((v) => v === null)
        : value.targetMidi !== null &&
          (value.voicedDurationMs === 0
            ? ratios.every((v) => v === null)
            : ratios.every((v) => v !== null))) &&
      value.stableDurationMs <= value.voicedDurationMs &&
      (value.stableDurationMs > 0
        ? value.minStableMidi !== null && value.maxStableMidi !== null
        : value.minStableMidi === null && value.maxStableMidi === null) &&
      (value.voicedDurationMs > 0 || value.medianStabilityScore === null) &&
      value.longestStableDurationMs <= value.stableDurationMs &&
      (value.minStableMidi === null
        ? value.maxStableMidi === null
        : value.maxStableMidi !== null && value.minStableMidi <= value.maxStableMidi) &&
      (value.within10CentsRatio === null ||
        (value.within20CentsRatio !== null &&
          value.within30CentsRatio !== null &&
          value.within10CentsRatio <= value.within20CentsRatio &&
          value.within20CentsRatio <= value.within30CentsRatio))
    );
  }, "Inconsistent summary metrics");

export const completedSessionSchema = z.strictObject({
  summary: summarySchema,
  trace: z
    .array(z.strictObject({ timestampMs: duration, midi: midi.nullable() }))
    .max(300)
    .refine((points) =>
      points.every(
        (point, index) => index === 0 || point.timestampMs >= (points[index - 1]?.timestampMs ?? 0),
      ),
    ),
  endReason: z.enum(["stopped", "interrupted"]),
});

export const sessionRecordSchema = z
  .strictObject({
    id: z.string(),
    startedAt: z.string(),
    mode: z.enum(["free", "target"]),
    schemaVersion: z.literal(1),
    result: completedSessionSchema,
  })
  .refine(
    (row) =>
      row.id === row.result.summary.id &&
      row.startedAt === row.result.summary.startedAt &&
      row.mode === row.result.summary.mode,
  );

export type SessionRecord = z.infer<typeof sessionRecordSchema>;
export interface SettingRecord {
  key: string;
  value: unknown;
  updatedAt: string;
  schemaVersion: number;
}
