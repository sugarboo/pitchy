import type { CSSProperties } from "react";
import type { Locale, Messages, PitchReadoutState } from "../app/i18n";
import { midiToNoteName } from "../domain/notes";
import { nearestMidi } from "../domain/pitch";
import { targetDeviation } from "../domain/target-practice";
import { DEFAULT_TUNING_A4_HZ, midiToFrequencyHz } from "../domain/tuning";
import { getFreePitchFeedback, tuningMidiOffset } from "../features/practice/free-practice";
import type { LivePitchSnapshot } from "../features/practice/live-pitch";

export interface PitchReadoutProps {
  readonly active: boolean;
  readonly locale: Locale;
  readonly messages: Messages;
  readonly snapshot: LivePitchSnapshot;
  readonly tuningA4Hz?: number;
  readonly targetMidi?: number | null;
}

function resolveReadoutState(active: boolean, snapshot: LivePitchSnapshot): PitchReadoutState {
  if (!active || snapshot === null) {
    return "waiting";
  }
  return snapshot.state;
}

function formatSignedValue(value: number, locale: Locale, unit: string): string {
  const formatted = Math.abs(value).toLocaleString(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatted} ${unit}`;
}

export function PitchReadout({
  active,
  locale,
  messages,
  snapshot,
  tuningA4Hz = DEFAULT_TUNING_A4_HZ,
  targetMidi = null,
}: PitchReadoutProps) {
  const state = resolveReadoutState(active, snapshot);
  const midi = active ? (snapshot?.midi ?? null) : null;
  const feedback = getFreePitchFeedback(midi, tuningA4Hz);
  const noteName = feedback?.noteName ?? messages.notAvailable;
  const frequencyHz = feedback?.frequencyHz ?? null;
  const cents =
    targetMidi === null
      ? (feedback?.centsFromNearest ?? null)
      : targetDeviation(feedback?.midi ?? null, targetMidi);
  const targetProgress = active ? snapshot?.targetProgress : null;
  const midiOffset = tuningMidiOffset(tuningA4Hz);
  const confidence = active && snapshot !== null ? snapshot.confidence : null;
  const rmsDbfs = active && snapshot !== null ? snapshot.rmsDbfs : null;
  const stabilityScore = active && snapshot !== null ? snapshot.stabilityScore : null;
  const pitchSpreadCents = active && snapshot !== null ? snapshot.pitchSpreadCents : null;
  const trendCentsPerSecond = active && snapshot !== null ? snapshot.trendCentsPerSecond : null;
  const continuousVoicedDurationMs =
    active && snapshot !== null ? snapshot.continuousVoicedDurationMs : null;
  const currentStableDurationMs =
    active && snapshot !== null ? snapshot.currentStableDurationMs : null;
  const stableRange =
    active &&
    snapshot !== null &&
    snapshot.minStableMidi !== null &&
    snapshot.maxStableMidi !== null
      ? [
          midiToNoteName(nearestMidi(snapshot.minStableMidi + midiOffset)),
          midiToNoteName(nearestMidi(snapshot.maxStableMidi + midiOffset)),
        ]
      : null;
  const markerPosition = cents === null ? 50 : Math.min(100, Math.max(0, cents + 50));
  const markerStyle = { "--cents-position": `${markerPosition}%` } as CSSProperties;

  return (
    <div className={`pitch-readout is-${state}`}>
      <div className="note-preview">
        <span className="note-name">{noteName}</span>
        <span className="frequency">
          {frequencyHz === null
            ? messages.notAvailable
            : `${frequencyHz.toLocaleString(locale, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })} Hz`}
        </span>
        <span className="detection-state" role="status" aria-live="polite">
          {messages.pitchStates[state]}
        </span>
      </div>

      <div className="cents-value">
        <span>
          {targetMidi === null ? messages.centsFromNearestLabel : messages.centsFromTargetLabel}
        </span>
        <strong>
          {cents === null
            ? messages.notAvailable
            : formatSignedValue(cents, locale, messages.centsUnit)}
        </strong>
      </div>
      <div className="cents-track" style={markerStyle} aria-hidden="true">
        <span>−50</span>
        <span className="track-line">
          <span className="track-center" />
          {cents !== null && <span className="track-marker" />}
        </span>
        <span>+50</span>
      </div>

      {targetMidi !== null && (
        <div className="target-feedback">
          <p className="target-reference">
            {messages.targetNoteLabel}: {midiToNoteName(targetMidi)} ·{" "}
            {midiToFrequencyHz(targetMidi, tuningA4Hz).toLocaleString(locale, {
              maximumFractionDigits: 1,
            })}{" "}
            Hz
          </p>
          <p>{messages.targetToleranceHelp}</p>
          {cents !== null && Math.abs(cents) > 50 && <p>{messages.targetGaugeOverflow}</p>}
          <dl className="target-metrics">
            <div>
              <dt>{messages.targetHitDurationLabel}</dt>
              <dd data-testid="target-hit-duration">
                {targetProgress == null
                  ? messages.notAvailable
                  : `${(targetProgress.hitDurationMs / 1000).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${messages.secondsUnit}`}
              </dd>
            </div>
            <div>
              <dt>{messages.targetStableDurationLabel}</dt>
              <dd data-testid="target-stable-duration">
                {targetProgress == null
                  ? messages.notAvailable
                  : `${(targetProgress.stableHitDurationMs / 1000).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${messages.secondsUnit}`}
              </dd>
            </div>
          </dl>
        </div>
      )}

      <dl className="readout-metrics">
        <div>
          <dt>{messages.confidenceLabel}</dt>
          <dd>
            {confidence === null
              ? messages.notAvailable
              : confidence.toLocaleString(locale, {
                  style: "percent",
                  maximumFractionDigits: 0,
                })}
          </dd>
        </div>
        <div>
          <dt>{messages.inputLevelLabel}</dt>
          <dd>
            {rmsDbfs === null
              ? messages.notAvailable
              : `${rmsDbfs.toLocaleString(locale, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })} dBFS`}
          </dd>
        </div>
        <div>
          <dt>{messages.stabilityLabel}</dt>
          <dd>
            {stabilityScore === null
              ? messages.notAvailable
              : `${stabilityScore.toLocaleString(locale, { maximumFractionDigits: 0 })} / 100`}
          </dd>
        </div>
        <div>
          <dt>{messages.pitchSpreadLabel}</dt>
          <dd>
            {pitchSpreadCents === null
              ? messages.notAvailable
              : `${pitchSpreadCents.toLocaleString(locale, { maximumFractionDigits: 1 })} ${messages.centsUnit}`}
          </dd>
        </div>
        <div>
          <dt>{messages.pitchTrendLabel}</dt>
          <dd>
            {trendCentsPerSecond === null
              ? messages.notAvailable
              : formatSignedValue(trendCentsPerSecond, locale, messages.centsPerSecondUnit)}
          </dd>
        </div>
        <div>
          <dt>{messages.continuousVoiceLabel}</dt>
          <dd>
            {continuousVoicedDurationMs === null
              ? messages.notAvailable
              : `${(continuousVoicedDurationMs / 1000).toLocaleString(locale, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })} ${messages.secondsUnit}`}
          </dd>
        </div>
        <div>
          <dt>{messages.stableDurationLabel}</dt>
          <dd>
            {currentStableDurationMs === null
              ? messages.notAvailable
              : `${(currentStableDurationMs / 1000).toLocaleString(locale, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })} ${messages.secondsUnit}`}
          </dd>
        </div>
        <div>
          <dt>{messages.stableRangeLabel}</dt>
          <dd>
            {stableRange === null
              ? messages.notAvailable
              : stableRange[0] === stableRange[1]
                ? stableRange[0]
                : `${stableRange[0]} – ${stableRange[1]}`}
          </dd>
        </div>
      </dl>
    </div>
  );
}
