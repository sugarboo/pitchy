import { useMemo } from "react";
import type { Messages } from "../../app/i18n";
import type { Theme } from "../../app/preferences";
import { PitchCanvas } from "../../components/PitchCanvas";
import { PitchTraceBuffer } from "../../components/pitch-trace";
import type { SessionTracePoint } from "../../domain/session";

export function SessionTrace({
  points,
  theme,
  messages,
}: {
  points: readonly SessionTracePoint[];
  theme: Theme;
  messages: Messages;
}) {
  const trace = useMemo(() => {
    const buffer = new PitchTraceBuffer();
    for (const point of points) buffer.append(point);
    return buffer;
  }, [points]);
  const hasPitch = points.some((point) => point.midi !== null);
  const windowMs = Math.max(1, (points.at(-1)?.timestampMs ?? 0) - (points[0]?.timestampMs ?? 0));
  return (
    <div className="session-trace">
      <h3>{messages.sessionTraceTitle}</h3>
      {hasPitch ? (
        <PitchCanvas
          label={messages.sessionTraceTitle}
          theme={theme}
          trace={trace}
          windowMs={windowMs}
        />
      ) : (
        <p>{messages.insufficientData}</p>
      )}
      <p>{messages.sessionTraceHelp}</p>
    </div>
  );
}
