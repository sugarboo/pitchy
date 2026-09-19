import { describe, expect, it } from "vitest";
import { getMessages } from "../../app/i18n";
import { frequencyHzToMidi } from "../../domain/tuning";
import { getFreePitchFeedback, tuningMidiOffset } from "./free-practice";

describe("free practice feedback", () => {
  it.each(["zh-CN", "en"] as const)("provides every free-practice translation in %s", (locale) => {
    const messages = getMessages(locale);
    for (const key of [
      "freePracticeLabel",
      "freePracticeDescription",
      "tuningA4Label",
      "tuningHelp",
      "tuningLocked",
      "centsFromNearestLabel",
      "practiceModeLabel",
      "targetPracticeLabel",
      "targetPracticeDescription",
      "targetNoteLabel",
      "centsFromTargetLabel",
      "targetToleranceHelp",
      "targetGaugeOverflow",
      "targetHitDurationLabel",
      "targetStableDurationLabel",
    ] as const) {
      expect(messages[key].trim().length).toBeGreaterThan(0);
      expect(messages[key]).not.toBe(key);
    }
  });
  it.each([415, 432, 440, 442.5, 466])(
    "uses A4 = %s coherently without changing measured Hz",
    (tuning) => {
      const canonical = frequencyHzToMidi(tuning);
      const feedback = getFreePitchFeedback(canonical, tuning);
      expect(feedback?.noteName).toBe("A4");
      expect(feedback?.midi).toBeCloseTo(69, 10);
      expect(feedback?.frequencyHz).toBeCloseTo(tuning, 10);
      expect(feedback?.centsFromNearest).toBeCloseTo(0, 8);
      expect(feedback?.centsFromTarget).toBeNull();
      expect(canonical + tuningMidiOffset(tuning)).toBeCloseTo(69, 10);
    },
  );

  it("changes the nearest note at the half-semitone boundary while retaining continuous pitch", () => {
    const below = getFreePitchFeedback(69.499);
    const above = getFreePitchFeedback(69.501);
    expect(below?.noteName).toBe("A4");
    expect(above?.noteName).toBe("A#4");
    expect(below?.centsFromNearest).toBeCloseTo(49.9, 8);
    expect(above?.centsFromNearest).toBeCloseTo(-49.9, 8);
    expect(above?.midi).toBe(69.501);
  });

  it("retunes 440 Hz to A#4 at a 415 Hz reference", () => {
    const feedback = getFreePitchFeedback(69, 415);
    expect(feedback?.noteName).toBe("A#4");
    expect(feedback?.frequencyHz).toBe(440);
    expect(feedback?.centsFromNearest).toBeCloseTo(1.27, 1);
  });

  it.each([null, Number.NaN, Number.POSITIVE_INFINITY])(
    "withholds missing/invalid pitch %s",
    (midi) => {
      expect(getFreePitchFeedback(midi)).toBeNull();
    },
  );

  it.each([414.99, 466.01, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid tuning %s",
    (tuning) => {
      expect(() => getFreePitchFeedback(69, tuning)).toThrow(RangeError);
    },
  );
});
