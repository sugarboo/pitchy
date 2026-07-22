import { useEffect, useRef, useState } from "react";
import { type AppErrorCode, toAppError } from "../audio/audio-types";
import { requestMicrophoneAccess, stopMediaStream } from "../audio/media-devices";
import { type BrowserSupportSnapshot, detectBrowserCapabilities } from "./browser-capabilities";
import { getMessages } from "./i18n";
import { usePreferences } from "./preferences";

const DELIVERY_STAGES = [
  { id: "M0", label: "foundation", state: "complete" },
  { id: "M1", label: "audio", state: "active" },
  { id: "M2", label: "pitch", state: "pending" },
] as const;

type MicrophoneRequestState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "ready" }
  | { status: "error"; code: AppErrorCode };

export type MicrophoneRequester = () => Promise<MediaStream>;

export interface AppProps {
  supportOverride?: BrowserSupportSnapshot;
  requestMicrophone?: MicrophoneRequester;
}

export function App({
  supportOverride,
  requestMicrophone = requestMicrophoneAccess,
}: AppProps = {}) {
  const [support] = useState(() => supportOverride ?? detectBrowserCapabilities());
  const [microphoneState, setMicrophoneState] = useState<MicrophoneRequestState>({
    status: "idle",
  });
  const isMounted = useRef(false);
  const requestSequence = useRef(0);
  const requestInFlight = useRef(false);
  const { locale, setLocale, theme, setTheme } = usePreferences();
  const messages = getMessages(locale);
  const unavailableMessage = support.missingRequiredIds
    .map((id) => messages.capabilityLabels[id])
    .join(locale === "zh-CN" ? "、" : ", ");
  const nextTheme = theme === "dark" ? "light" : "dark";
  const nextLocale = locale === "zh-CN" ? "en" : "zh-CN";
  const microphoneError =
    microphoneState.status === "error" ? messages.errorMessages[microphoneState.code] : null;
  const isRequesting = microphoneState.status === "requesting";
  const isReady = microphoneState.status === "ready";
  const primaryButtonLabel =
    microphoneState.status === "error" ? messages.retryMicrophone : messages.startPractice;
  const primaryButtonDetail = isRequesting
    ? messages.requestingMicrophone
    : isReady
      ? messages.microphoneReady
      : messages.startPracticePending;

  useEffect(() => {
    isMounted.current = true;

    return () => {
      isMounted.current = false;
      requestSequence.current += 1;
    };
  }, []);

  async function handleMicrophoneRequest(): Promise<void> {
    if (!support.canStartPractice || requestInFlight.current || isReady) {
      return;
    }

    requestInFlight.current = true;
    const currentRequest = ++requestSequence.current;
    setMicrophoneState({ status: "requesting" });

    try {
      const stream = await requestMicrophone();
      stopMediaStream(stream);

      if (isMounted.current && currentRequest === requestSequence.current) {
        setMicrophoneState({ status: "ready" });
      }
    } catch (error) {
      if (isMounted.current && currentRequest === requestSequence.current) {
        setMicrophoneState({ status: "error", code: toAppError(error).code });
      }
    } finally {
      if (currentRequest === requestSequence.current) {
        requestInFlight.current = false;
      }
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
          <span className="phase-badge">v0.1 · M1</span>
        </div>
      </header>

      <section className="hero" aria-labelledby="welcome-title">
        <div className="hero-copy">
          <p className="eyebrow">{messages.heroEyebrow}</p>
          <h1 id="welcome-title">{messages.heroTitle}</h1>
          <p className="hero-description">{messages.heroDescription}</p>

          <div className="hero-actions">
            <div className="microphone-action">
              <button
                className="primary-button"
                type="button"
                disabled={!support.canStartPractice || isRequesting || isReady}
                aria-describedby="microphone-feedback"
                onClick={() => void handleMicrophoneRequest()}
              >
                {primaryButtonLabel}
                <span>{primaryButtonDetail}</span>
              </button>

              <div id="microphone-feedback" className="microphone-feedback" aria-live="polite">
                {isReady && (
                  <p className="permission-feedback is-ready" role="status">
                    <strong>{messages.microphoneReady}</strong>
                    <span>{messages.microphoneReadyDetail}</span>
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
