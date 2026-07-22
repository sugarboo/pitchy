import { useState } from "react";
import { detectBrowserCapabilities } from "./browser-capabilities";
import { getMessages } from "./i18n";
import { usePreferences } from "./preferences";

const DELIVERY_STAGES = [
  { id: "M0", label: "foundation", state: "active" },
  { id: "M1", label: "audio", state: "pending" },
  { id: "M2", label: "pitch", state: "pending" },
] as const;

export function App() {
  const [support] = useState(() => detectBrowserCapabilities());
  const { locale, setLocale, theme, setTheme } = usePreferences();
  const messages = getMessages(locale);
  const unavailableMessage = support.missingRequiredIds
    .map((id) => messages.capabilityLabels[id])
    .join(locale === "zh-CN" ? "、" : ", ");
  const nextTheme = theme === "dark" ? "light" : "dark";
  const nextLocale = locale === "zh-CN" ? "en" : "zh-CN";

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
          <span className="phase-badge">v0.1 · M0</span>
        </div>
      </header>

      <section className="hero" aria-labelledby="welcome-title">
        <div className="hero-copy">
          <p className="eyebrow">{messages.heroEyebrow}</p>
          <h1 id="welcome-title">{messages.heroTitle}</h1>
          <p className="hero-description">{messages.heroDescription}</p>

          <div className="hero-actions">
            <button className="primary-button" type="button" disabled>
              {messages.startPractice}
              <span>{messages.startPracticePending}</span>
            </button>
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
              <li key={stage.id} className={stage.state === "active" ? "is-active" : undefined}>
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
