import type { CSSProperties } from "react";
import type { Locale, Messages, PitchReadoutState } from "../app/i18n";
import { midiToNoteName } from "../domain/notes";
import { centsFromNearestMidi, nearestMidi } from "../domain/pitch";
import { midiToFrequencyHz } from "../domain/tuning";
import { DEFAULT_YIN_CONFIG } from "../dsp/dsp-config";
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
  if (snapshot.midi !== null) {
    return "detected";
  }
  if (snapshot.voiced) {
    return "stabilizing";
  }
  if (snapshot.rmsDbfs <= DEFAULT_YIN_CONFIG.minRmsDbfs) {
    return "silent";
  }
  return "unstable";
}

function formatSignedCents(cents: number, locale: Locale): string {
  const formatted = Math.abs(cents).toLocaleString(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const sign = cents > 0 ? "+" : cents < 0 ? "−" : "";
  return `${sign}${formatted} ${locale === "zh-CN" ? "音分" : "cents"}`;
}

export function PitchReadout({ active, locale, messages, snapshot }: PitchReadoutProps) {
  const state = resolveReadoutState(active, snapshot);
  const midi = state === "detected" ? snapshot?.midi : null;
  const noteName =
    midi === null || midi === undefined ? messages.notAvailable : midiToNoteName(nearestMidi(midi));
  const frequencyHz = midi === null || midi === undefined ? null : midiToFrequencyHz(midi);
  const cents = midi === null || midi === undefined ? null : centsFromNearestMidi(midi);
  const confidence = active && snapshot !== null ? snapshot.confidence : null;
  const rmsDbfs = active && snapshot !== null ? snapshot.rmsDbfs : null;
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
        <strong>{cents === null ? messages.notAvailable : formatSignedCents(cents, locale)}</strong>
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
      </dl>
    </div>
  );
}
