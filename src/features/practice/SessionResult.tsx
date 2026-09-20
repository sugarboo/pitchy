import type { Locale, Messages } from "../../app/i18n";
import { midiToNoteName } from "../../domain/notes";
import { nearestMidi } from "../../domain/pitch";
import type { CompletedPracticeSession } from "../../domain/session";
import { SessionStorage } from "./SessionStorage";

interface SessionResultProps {
  readonly session: CompletedPracticeSession;
  readonly locale: Locale;
  readonly messages: Messages;
}

/** In-memory result preview; history and persistence are owned by VT-021/VT-022. */
export function SessionResult({ session, locale, messages }: SessionResultProps) {
  const summary = session.summary;
  const seconds = (value: number): string =>
    `${(value / 1000).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${messages.secondsUnit}`;
  const percent = (value: number | null): string =>
    value === null
      ? messages.insufficientData
      : value.toLocaleString(locale, { style: "percent", maximumFractionDigits: 1 });
  const note = (value: number | null): string =>
    value === null ? messages.insufficientData : midiToNoteName(nearestMidi(value));
  return (
    <section className="status-card session-result" aria-labelledby="session-result-title">
      <h2 id="session-result-title">{messages.sessionResultTitle}</h2>
      <p>
        {session.endReason === "interrupted"
          ? messages.sessionInterrupted
          : messages.sessionMemoryOnly}
      </p>
      <p>
        {summary.mode === "free"
          ? messages.freePracticeLabel
          : `${messages.targetPracticeLabel} · ${note(summary.targetMidi)}`}{" "}
        · {messages.tuningA4Label}: {summary.tuningA4Hz.toLocaleString(locale)}
      </p>
      <dl className="readout-metrics">
        <div>
          <dt>{messages.sessionDurationLabel}</dt>
          <dd>{seconds(summary.durationMs)}</dd>
        </div>
        <div>
          <dt>{messages.voicedDurationLabel}</dt>
          <dd data-testid="session-voiced">{seconds(summary.voicedDurationMs)}</dd>
        </div>
        <div>
          <dt>{messages.stableDurationLabel}</dt>
          <dd>{seconds(summary.stableDurationMs)}</dd>
        </div>
        <div>
          <dt>{messages.stableRatioLabel}</dt>
          <dd>
            {percent(
              summary.voicedDurationMs > 0
                ? summary.stableDurationMs / summary.voicedDurationMs
                : null,
            )}
          </dd>
        </div>
        <div>
          <dt>{messages.longestStableLabel}</dt>
          <dd>{seconds(summary.longestStableDurationMs)}</dd>
        </div>
        <div>
          <dt>{messages.stableRangeLabel}</dt>
          <dd>
            {note(summary.minStableMidi)} – {note(summary.maxStableMidi)}
          </dd>
        </div>
        <div>
          <dt>{messages.medianStabilityLabel}</dt>
          <dd>
            {summary.medianStabilityScore === null
              ? messages.insufficientData
              : summary.medianStabilityScore.toLocaleString(locale, { maximumFractionDigits: 1 })}
          </dd>
        </div>
      </dl>
      {summary.mode === "target" && (
        <dl className="target-metrics">
          <div>
            <dt>{messages.within10Label}</dt>
            <dd data-testid="session-within10">{percent(summary.within10CentsRatio)}</dd>
          </div>
          <div>
            <dt>{messages.within20Label}</dt>
            <dd>{percent(summary.within20CentsRatio)}</dd>
          </div>
          <div>
            <dt>{messages.within30Label}</dt>
            <dd>{percent(summary.within30CentsRatio)}</dd>
          </div>
        </dl>
      )}
      <p>{messages.sessionMetricHelp}</p>
      <SessionStorage key={summary.id} session={session} messages={messages} />
    </section>
  );
}
