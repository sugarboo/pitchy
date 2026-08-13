import { describe, expect, it } from "vitest";
import { DEFAULT_ADAPTIVE_NOISE_GATE_CONFIG } from "./dsp-config";
import {
  advanceAdaptiveNoiseGate,
  calculateNoiseGateThreshold,
  createAdaptiveNoiseGateState,
  isAboveNoiseGate,
} from "./noise-gate";
import { SILENCE_DBFS } from "./rms";

const MIN_RMS_DBFS = -55;
const FRAME_ELAPSED_MS = (2048 / 48_000) * 1000;

describe("adaptive noise gate", () => {
  it("starts at the configured minimum gate without shared mutable state", () => {
    const first = createAdaptiveNoiseGateState();
    const second = createAdaptiveNoiseGateState();

    expect(first).toEqual({ noiseFloorDbfs: null });
    expect(calculateNoiseGateThreshold(first, MIN_RMS_DBFS)).toBe(MIN_RMS_DBFS);
    expect(first).not.toBe(second);
  });

  it("uses the greater of the minimum gate and learned floor plus margin", () => {
    expect(calculateNoiseGateThreshold({ noiseFloorDbfs: -80 }, MIN_RMS_DBFS)).toBe(-55);
    expect(calculateNoiseGateThreshold({ noiseFloorDbfs: -50 }, MIN_RMS_DBFS)).toBe(-44);
  });

  it("opens only when finite RMS evidence is strictly above the threshold", () => {
    expect(isAboveNoiseGate(-54.999, -55)).toBe(true);
    expect(isAboveNoiseGate(-55, -55)).toBe(false);
    expect(isAboveNoiseGate(-55.001, -55)).toBe(false);
    expect(isAboveNoiseGate(Number.NaN, -55)).toBe(false);
    expect(isAboveNoiseGate(-20, Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("classifies with the old threshold before learning an aperiodic floor", () => {
    const initial = createAdaptiveNoiseGateState();
    const first = advanceAdaptiveNoiseGate(
      initial,
      { rmsDbfs: -30, periodicCandidateFound: false },
      FRAME_ELAPSED_MS,
      MIN_RMS_DBFS,
    );
    const second = advanceAdaptiveNoiseGate(
      first.state,
      { rmsDbfs: -30, periodicCandidateFound: false },
      FRAME_ELAPSED_MS,
      MIN_RMS_DBFS,
    );

    expect(first.thresholdDbfs).toBe(-55);
    expect(first.open).toBe(true);
    expect(first.state.noiseFloorDbfs).toBeGreaterThan(-61);
    expect(first.state.noiseFloorDbfs).toBeLessThan(-30);
    expect(second.thresholdDbfs).toBeGreaterThan(-55);
    expect(second.thresholdDbfs).toBeLessThan(-24);
    expect(second.open).toBe(true);
    expect(initial).toEqual({ noiseFloorDbfs: null });
  });

  it("does not initialize from silence or learn periodic candidates as noise", () => {
    const state = { noiseFloorDbfs: -60 };
    const silent = advanceAdaptiveNoiseGate(
      createAdaptiveNoiseGateState(),
      { rmsDbfs: SILENCE_DBFS, periodicCandidateFound: false },
      FRAME_ELAPSED_MS,
      MIN_RMS_DBFS,
    );
    const periodic = advanceAdaptiveNoiseGate(
      state,
      { rmsDbfs: -20, periodicCandidateFound: true },
      FRAME_ELAPSED_MS,
      MIN_RMS_DBFS,
    );

    expect(silent.state).toEqual({ noiseFloorDbfs: null });
    expect(periodic.state).toEqual(state);
    expect(periodic.open).toBe(true);
  });

  it("releases an elevated floor when a periodic candidate remains below the gate", () => {
    const state = { noiseFloorDbfs: -20 };
    const result = advanceAdaptiveNoiseGate(
      state,
      { rmsDbfs: -30, periodicCandidateFound: true },
      100,
      MIN_RMS_DBFS,
    );

    expect(result.open).toBe(false);
    expect(result.state.noiseFloorDbfs).toBeLessThan(-20);
    expect(result.state.noiseFloorDbfs).toBeGreaterThan(-61);
  });

  it("relaxes an elevated floor toward the fixed baseline during silence", () => {
    const state = { noiseFloorDbfs: -20 };
    const silent = advanceAdaptiveNoiseGate(
      state,
      { rmsDbfs: SILENCE_DBFS, periodicCandidateFound: false },
      100,
      MIN_RMS_DBFS,
    );

    expect(silent.state.noiseFloorDbfs).toBeLessThan(-20);
    expect(silent.state.noiseFloorDbfs).toBeGreaterThan(-61);
    expect(silent.open).toBe(false);
  });

  it("tracks a rising floor more slowly than an equally distant falling floor", () => {
    const rising = advanceAdaptiveNoiseGate(
      { noiseFloorDbfs: -60 },
      { rmsDbfs: -40, periodicCandidateFound: false },
      100,
      MIN_RMS_DBFS,
    );
    const falling = advanceAdaptiveNoiseGate(
      { noiseFloorDbfs: -40 },
      { rmsDbfs: -60, periodicCandidateFound: false },
      100,
      MIN_RMS_DBFS,
    );
    const riseDistance = (rising.state.noiseFloorDbfs as number) - -60;
    const fallDistance = -40 - (falling.state.noiseFloorDbfs as number);

    expect(rising.state.noiseFloorDbfs).toBeGreaterThan(-60);
    expect(rising.state.noiseFloorDbfs).toBeLessThan(-40);
    expect(falling.state.noiseFloorDbfs).toBeLessThan(-40);
    expect(falling.state.noiseFloorDbfs).toBeGreaterThan(-60);
    expect(riseDistance).toBeLessThan(fallDistance);
  });

  it("fails closed and preserves state for non-finite frame evidence", () => {
    const state = { noiseFloorDbfs: -60 };
    const result = advanceAdaptiveNoiseGate(
      state,
      { rmsDbfs: Number.NaN, periodicCandidateFound: false },
      FRAME_ELAPSED_MS,
      MIN_RMS_DBFS,
    );

    expect(result.open).toBe(false);
    expect(result.state).toEqual(state);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid elapsed time %s",
    (elapsedMs) => {
      expect(() =>
        advanceAdaptiveNoiseGate(
          createAdaptiveNoiseGateState(),
          { rmsDbfs: -60, periodicCandidateFound: false },
          elapsedMs,
          MIN_RMS_DBFS,
        ),
      ).toThrow(RangeError);
    },
  );

  it("rejects invalid state, minimum, or calibration parameters", () => {
    expect(() => calculateNoiseGateThreshold({ noiseFloorDbfs: Number.NaN }, MIN_RMS_DBFS)).toThrow(
      RangeError,
    );
    expect(() => calculateNoiseGateThreshold(createAdaptiveNoiseGateState(), Number.NaN)).toThrow(
      RangeError,
    );
    expect(() =>
      calculateNoiseGateThreshold(createAdaptiveNoiseGateState(), MIN_RMS_DBFS, {
        ...DEFAULT_ADAPTIVE_NOISE_GATE_CONFIG,
        marginDb: -1,
      }),
    ).toThrow(RangeError);
  });
});
