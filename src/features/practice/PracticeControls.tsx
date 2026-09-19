import type { Messages } from "../../app/i18n";
import { midiToNoteName } from "../../domain/notes";
import { MAX_TARGET_MIDI, MIN_TARGET_MIDI, type PracticeMode } from "../../domain/target-practice";
import { MAX_TUNING_A4_HZ, MIN_TUNING_A4_HZ } from "../../domain/tuning";

interface PracticeControlsProps {
  readonly messages: Messages;
  readonly tuningA4Hz: number;
  readonly locked: boolean;
  readonly onTuningChange: (value: number) => void;
  readonly mode: PracticeMode;
  readonly targetMidi: number;
  readonly onModeChange: (mode: PracticeMode) => void;
  readonly onTargetChange: (midi: number) => void;
}

export function PracticeControls({
  messages,
  tuningA4Hz,
  locked,
  onTuningChange,
  mode,
  targetMidi,
  onModeChange,
  onTargetChange,
}: PracticeControlsProps) {
  return (
    <section className="practice-controls" aria-labelledby="practice-mode-title">
      <h2 id="practice-mode-title">
        {mode === "free" ? messages.freePracticeLabel : messages.targetPracticeLabel}
      </h2>
      <label htmlFor="practice-mode">{messages.practiceModeLabel}</label>
      <select
        id="practice-mode"
        value={mode}
        disabled={locked}
        onChange={(event) => {
          const value = event.currentTarget.value;
          if (value === "free" || value === "target") onModeChange(value);
        }}
      >
        <option value="free">{messages.freePracticeLabel}</option>
        <option value="target">{messages.targetPracticeLabel}</option>
      </select>
      <p>
        {mode === "free" ? messages.freePracticeDescription : messages.targetPracticeDescription}
      </p>
      {mode === "target" && (
        <>
          <label htmlFor="target-note">{messages.targetNoteLabel}</label>
          <select
            id="target-note"
            value={targetMidi}
            disabled={locked}
            onChange={(event) => {
              const value = Number(event.currentTarget.value);
              if (Number.isInteger(value) && value >= MIN_TARGET_MIDI && value <= MAX_TARGET_MIDI)
                onTargetChange(value);
            }}
          >
            {Array.from(
              { length: MAX_TARGET_MIDI - MIN_TARGET_MIDI + 1 },
              (_, index) => MIN_TARGET_MIDI + index,
            ).map((midi) => (
              <option key={midi} value={midi}>
                {midiToNoteName(midi)}
              </option>
            ))}
          </select>
        </>
      )}
      <label htmlFor="tuning-a4">{messages.tuningA4Label}</label>
      <input
        id="tuning-a4"
        type="number"
        min={MIN_TUNING_A4_HZ}
        max={MAX_TUNING_A4_HZ}
        step="any"
        defaultValue={tuningA4Hz}
        disabled={locked}
        aria-describedby="tuning-help"
        onBlur={(event) => {
          event.currentTarget.value = String(tuningA4Hz);
        }}
        onChange={(event) => {
          const value = event.currentTarget.valueAsNumber;
          if (Number.isFinite(value) && value >= MIN_TUNING_A4_HZ && value <= MAX_TUNING_A4_HZ) {
            onTuningChange(value);
          }
        }}
      />
      <p id="tuning-help">{locked ? messages.tuningLocked : messages.tuningHelp}</p>
    </section>
  );
}
