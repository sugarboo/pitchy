import { useEffect, useState, useSyncExternalStore } from "react";
import {
  type AudioContextFactory,
  type AudioWorkletNodeFactory,
  createAudioEngine,
  type MicrophoneRequester,
  type WorkerFactory,
} from "../audio/audio-engine";
import type { AudioEngineStatus } from "../audio/audio-types";
import { PitchCanvas } from "../components/PitchCanvas";
import { PitchTraceBuffer } from "../components/pitch-trace";
import { type BrowserSupportSnapshot, detectBrowserCapabilities } from "./browser-capabilities";
import { getMessages } from "./i18n";
import { usePreferences } from "./preferences";

const DELIVERY_STAGES = [
  { id: "M0", label: "foundation", state: "complete" },
  { id: "M1", label: "audio", state: "complete" },
  { id: "M2", label: "pitch", state: "complete" },
  { id: "M3", label: "practice", state: "active" },
] as const;

export interface AppProps {
  supportOverride?: BrowserSupportSnapshot;
  requestMicrophone?: MicrophoneRequester;
  createAudioContext?: AudioContextFactory;
  createAudioWorkletNode?: AudioWorkletNodeFactory;
  createWorker?: WorkerFactory;
  workletModuleUrl?: string;
  workerModuleUrl?: string;
  workerReadyTimeoutMs?: number;
  pitchTrace?: PitchTraceBuffer;
}

function reportAudioLifecycleFailure(error: unknown): void {
  console.error("Pitchy audio lifecycle action failed.", error);
}

export function App({
  supportOverride,
  requestMicrophone,
  createAudioContext,
  createAudioWorkletNode,
  createWorker,
  workletModuleUrl,
  workerModuleUrl,
  workerReadyTimeoutMs,
  pitchTrace: pitchTraceOverride,
}: AppProps = {}) {
  const [support] = useState(() => supportOverride ?? detectBrowserCapabilities());
  const [audioEngine] = useState(() =>
    createAudioEngine({
      ...(requestMicrophone ? { requestMicrophone } : {}),
      ...(createAudioContext ? { createAudioContext } : {}),
      ...(createAudioWorkletNode ? { createAudioWorkletNode } : {}),
      ...(createWorker ? { createWorker } : {}),
      ...(workletModuleUrl ? { workletModuleUrl } : {}),
      ...(workerModuleUrl ? { workerModuleUrl } : {}),
      ...(workerReadyTimeoutMs === undefined ? {} : { workerReadyTimeoutMs }),
    }),
  );
  const [pitchTrace] = useState(() => pitchTraceOverride ?? new PitchTraceBuffer());
  const audioSnapshot = useSyncExternalStore(
    audioEngine.subscribe,
    audioEngine.getSnapshot,
    audioEngine.getSnapshot,
  );
  const { locale, setLocale, theme, setTheme } = usePreferences();
  const messages = getMessages(locale);
  const unavailableMessage = support.missingRequiredIds
    .map((id) => messages.capabilityLabels[id])
    .join(locale === "zh-CN" ? "、" : ", ");
  const nextTheme = theme === "dark" ? "light" : "dark";
  const nextLocale = locale === "zh-CN" ? "en" : "zh-CN";
  const microphoneError = audioSnapshot.errorCode
    ? messages.errorMessages[audioSnapshot.errorCode]
    : null;
  const isBusy =
    audioSnapshot.status === "requesting-permission" ||
    audioSnapshot.status === "starting" ||
    audioSnapshot.status === "stopping";
  const isRunning = audioSnapshot.status === "running";
  const isSuspended = audioSnapshot.status === "suspended";
  const isStartAction = audioSnapshot.status === "idle" || audioSnapshot.status === "error";
  const primaryButtonLabels: Record<AudioEngineStatus, string> = {
    idle: messages.startPractice,
    "requesting-permission": messages.requestingMicrophone,
    starting: messages.startingAudio,
    running: messages.pausePractice,
    suspended: messages.resumePractice,
    stopping: messages.stoppingAudio,
    error: messages.retryMicrophone,
  };
  const primaryButtonDetails: Record<AudioEngineStatus, string> = {
    idle: messages.startPracticePending,
    "requesting-permission": messages.requestingMicrophoneDetail,
    starting: messages.startingAudioDetail,
    running: messages.pausePracticeDetail,
    suspended: messages.resumePracticeDetail,
    stopping: messages.stoppingAudioDetail,
    error: messages.retryMicrophoneDetail,
  };

  useEffect(() => {
    const handleVisibilityChange = (): void => {
      if (document.visibilityState !== "hidden") {
        return;
      }

      const status = audioEngine.getSnapshot().status;
      if (status === "running") {
        void audioEngine.suspend().catch(reportAudioLifecycleFailure);
      } else if (status === "requesting-permission" || status === "starting") {
        void audioEngine.stop().catch(reportAudioLifecycleFailure);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      // StrictMode replays effect cleanup during development while retaining component state.
      // Stop owned browser resources without permanently invalidating the retained engine.
      void audioEngine.stop().catch(reportAudioLifecycleFailure);
    };
  }, [audioEngine]);

  async function handlePrimaryAudioAction(): Promise<void> {
    try {
      if (audioSnapshot.status === "running") {
        await audioEngine.suspend();
      } else if (audioSnapshot.status === "suspended") {
        await audioEngine.resume();
      } else if (audioSnapshot.status === "idle" || audioSnapshot.status === "error") {
        await audioEngine.start();
      }
    } catch (error) {
      reportAudioLifecycleFailure(error);
    }
  }

  async function handleStop(): Promise<void> {
    try {
      await audioEngine.stop();
    } catch (error) {
      reportAudioLifecycleFailure(error);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label={messages.brandHomeLabel}>
          <img src="/icons/pitchy.svg" alt="" width="36" height="36" />
          <span>Pitchy</span>
        </a>

        <div className="topbar-actions">
          <fieldset className="preference-controls">
            <legend className="visually-hidden">{messages.preferenceControlsLabel}</legend>
            <button
              className="preference-button theme-toggle"
              type="button"
              aria-label={
                nextTheme === "light" ? messages.switchToLightTheme : messages.switchToDarkTheme
              }
              onClick={() => setTheme(nextTheme)}
            >
              <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
              <span>{nextTheme === "light" ? messages.lightTheme : messages.darkTheme}</span>
            </button>
            <button
              className="preference-button language-toggle"
              type="button"
              aria-label={nextLocale === "en" ? messages.switchToEnglish : messages.switchToChinese}
              onClick={() => setLocale(nextLocale)}
            >
              <span lang={nextLocale}>{nextLocale === "en" ? "EN" : "中文"}</span>
            </button>
          </fieldset>
          <span className="phase-badge">v0.1 · M3</span>
        </div>
      </header>

      <section className="hero" aria-labelledby="welcome-title">
        <div className="hero-copy">
          <p className="eyebrow">{messages.heroEyebrow}</p>
          <h1 id="welcome-title">{messages.heroTitle}</h1>
          <p className="hero-description">{messages.heroDescription}</p>

          <div className="hero-actions">
            <div className="microphone-action">
              <div className="audio-action-buttons">
                <button
                  className="primary-button"
                  type="button"
                  disabled={isBusy || (isStartAction && !support.canStartPractice)}
                  aria-busy={isBusy}
                  aria-describedby="microphone-feedback"
                  onClick={() => void handlePrimaryAudioAction()}
                >
                  {primaryButtonLabels[audioSnapshot.status]}
                  <span>{primaryButtonDetails[audioSnapshot.status]}</span>
                </button>
                {(isRunning || isSuspended) && (
                  <button
                    className="secondary-button"
                    type="button"
                    aria-describedby="microphone-feedback"
                    onClick={() => void handleStop()}
                  >
                    {messages.stopPractice}
                  </button>
                )}
              </div>

              <div id="microphone-feedback" className="microphone-feedback" aria-live="polite">
                {isRunning && (
                  <p className="permission-feedback is-ready" role="status">
                    <strong>{messages.audioRunning}</strong>
                    <span>{messages.audioRunningDetail(audioSnapshot.sampleRate)}</span>
                  </p>
                )}
                {isSuspended && (
                  <p className="permission-feedback is-suspended" role="status">
                    <strong>{messages.audioSuspended}</strong>
                    <span>{messages.audioSuspendedDetail}</span>
                  </p>
                )}
                {microphoneError && (
                  <p className="permission-feedback is-error" role="alert">
                    <strong>{microphoneError.title}</strong>
                    <span>{microphoneError.detail}</span>
                    <span>{microphoneError.action}</span>
                  </p>
                )}
              </div>
            </div>
            <p className="privacy-note">
              <span aria-hidden="true">●</span>
              {messages.microphonePermissionNote}
            </p>
          </div>
        </div>

        <div className="readout-preview" role="img" aria-label={messages.readoutPreviewLabel}>
          <div className="readout-header">
            <span>{messages.liveReadout}</span>
            <span className="local-pill">{messages.deviceOnly}</span>
          </div>
          <div className="note-preview" aria-hidden="true">
            <span className="note-name">A4</span>
            <span className="frequency">440.0 Hz</span>
          </div>
          <div className="cents-track" aria-hidden="true">
            <span>-50</span>
            <span className="track-line">
              <span className="track-center" />
              <span className="track-marker" />
            </span>
            <span>+50</span>
          </div>
          <PitchCanvas label={messages.pitchTraceLabel} theme={theme} trace={pitchTrace} />
          <p className="preview-caption">{messages.previewCaption}</p>
        </div>
      </section>

      <section className="status-grid" aria-label={messages.foundationStatusLabel}>
        <article className="status-card capability-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{messages.runtimeEyebrow}</p>
              <h2>{messages.capabilityHeading}</h2>
            </div>
            <span className={support.canStartPractice ? "status-ok" : "status-warning"}>
              {support.canStartPractice ? messages.coreAvailable : messages.capabilityLimited}
            </span>
          </div>

          <ul className="capability-list">
            {support.capabilities.map((capability) => (
              <li key={capability.id}>
                <span
                  className={
                    capability.supported ? "capability-dot is-supported" : "capability-dot"
                  }
                  aria-hidden="true"
                />
                <span>{messages.capabilityLabels[capability.id]}</span>
                <strong>{capability.supported ? messages.supported : messages.unsupported}</strong>
              </li>
            ))}
          </ul>

          {!support.canStartPractice && (
            <p className="support-warning" role="status">
              {messages.missingCapabilities(unavailableMessage)}
            </p>
          )}
        </article>

        <article className="status-card roadmap-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{messages.progressEyebrow}</p>
              <h2>{messages.sliceHeading}</h2>
            </div>
          </div>

          <ol className="stage-list">
            {DELIVERY_STAGES.map((stage) => (
              <li key={stage.id} className={`is-${stage.state}`}>
                <span className="stage-id">{stage.id}</span>
                <span className="stage-label">{messages.stages[stage.label]}</span>
                <span className="stage-status">{messages.stageStates[stage.state]}</span>
              </li>
            ))}
          </ol>

          <p className="scope-note">{messages.scopeNote}</p>
        </article>
      </section>

      <footer className="footer">
        <p>{messages.medicalDisclaimer}</p>
        <p>{messages.privacyFooter}</p>
      </footer>
    </main>
  );
}
