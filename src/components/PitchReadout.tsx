import type { CSSProperties } from "react";
import type { Locale, Messages, PitchReadoutState } from "../app/i18n";
import { midiToNoteName } from "../domain/notes";
import { centsFromNearestMidi, nearestMidi } from "../domain/pitch";
import { midiToFrequencyHz } from "../domain/tuning";
import type { LivePitchSnapshot } from "../features/practice/live-pitch";

export interface PitchReadoutProps {
  readonly active: boolean;
  readonly locale: Locale;
  readonly messages: Messages;
  readonly snapshot: LivePitchSnapshot;
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

export function PitchReadout({ active, locale, messages, snapshot }: PitchReadoutProps) {
  const state = resolveReadoutState(active, snapshot);
  const midi = active ? (snapshot?.midi ?? null) : null;
  const noteName =
    midi === null || midi === undefined ? messages.notAvailable : midiToNoteName(nearestMidi(midi));
  const frequencyHz = midi === null || midi === undefined ? null : midiToFrequencyHz(midi);
  const cents = midi === null || midi === undefined ? null : centsFromNearestMidi(midi);
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
          midiToNoteName(nearestMidi(snapshot.minStableMidi)),
          midiToNoteName(nearestMidi(snapshot.maxStableMidi)),
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
        <span>{messages.centsFromNearestLabel}</span>
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
