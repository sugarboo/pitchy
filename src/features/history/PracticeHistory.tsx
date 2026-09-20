import { liveQuery } from "dexie";
import { useEffect, useState } from "react";
import type { Locale, Messages } from "../../app/i18n";
import type { Theme } from "../../app/preferences";
import { type LocalRepository, localRepository } from "../../db/repositories";
import { midiToNoteName } from "../../domain/notes";
import type { CompletedPracticeSession } from "../../domain/session";
import { SessionResult } from "../practice/SessionResult";

export function PracticeHistory({
  messages,
  locale,
  theme,
  repository = localRepository,
}: {
  messages: Messages;
  locale: Locale;
  theme: Theme;
  repository?: LocalRepository;
}) {
  const [invalid, setInvalid] = useState(0);
  const [count, setCount] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sessions, setSessions] = useState<CompletedPracticeSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const selected = sessions.find((session) => session.summary.id === selectedId);
  useEffect(() => {
    setCount(null);
    void retry; // A manual retry creates a fresh subscription after storage failure.
    const subscription = liveQuery(() => repository.listSessions()).subscribe({
      next: (result) => {
        setSessions(result.sessions);
        setCount(result.sessions.length);
        setInvalid(result.invalidCount);
        setFailed(false);
      },
      error: () => {
        setFailed(true);
        setSessions([]);
      },
    });
    return () => subscription.unsubscribe();
  }, [repository, retry]);
  async function clear(): Promise<void> {
    setBusy(true);
    try {
      await repository.clearSessions();
      setConfirm(false);
      setSelectedId(null);
      setDeleteId(null);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  async function remove(): Promise<void> {
    if (deleteId === null) return;
    setBusy(true);
    try {
      await repository.deleteSession(deleteId);
      if (selectedId === deleteId) setSelectedId(null);
      setDeleteId(null);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="status-card local-data" aria-label={messages.localDataLabel}>
      <h2>{messages.localDataLabel}</h2>
      <p role="status">
        {failed ? messages.localStorageFailed : messages.savedSessionCount(count)}
      </p>
      {invalid > 0 && <p role="alert">{messages.invalidSessionCount(invalid)}</p>}
      <button type="button" disabled={busy} onClick={() => setRetry((value) => value + 1)}>
        {messages.refreshLocalData}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setConfirm(true);
          setDeleteId(null);
        }}
      >
        {messages.clearSessions}
      </button>
      {confirm && (
        <div>
          <p>{messages.clearSessionsConfirm}</p>
          <button type="button" disabled={busy} onClick={() => void clear()}>
            {messages.confirmClearSessions}
          </button>
          <button type="button" disabled={busy} onClick={() => setConfirm(false)}>
            {messages.cancelAction}
          </button>
        </div>
      )}
      {!failed && count === 0 && <p>{messages.historyEmpty}</p>}
      <ol className="history-list" aria-label={messages.historyListLabel}>
        {sessions.map((session) => (
          <li key={session.summary.id}>
            <button
              type="button"
              aria-pressed={selectedId === session.summary.id}
              onClick={() => setSelectedId(session.summary.id)}
            >
              <time dateTime={session.summary.startedAt}>
                {new Date(session.summary.startedAt).toLocaleString(locale)}
              </time>
              <span>
                {session.summary.mode === "free"
                  ? messages.freePracticeLabel
                  : `${messages.targetPracticeLabel} · ${session.summary.targetMidi === null ? messages.insufficientData : midiToNoteName(session.summary.targetMidi)}`}
              </span>
              <span>
                {(session.summary.durationMs / 1000).toLocaleString(locale, {
                  maximumFractionDigits: 1,
                })}{" "}
                {messages.secondsUnit}
              </span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDeleteId(session.summary.id);
                setConfirm(false);
              }}
            >
              {messages.deleteHistoryEntry}
            </button>
          </li>
        ))}
      </ol>
      {deleteId !== null && (
        <div>
          <p>{messages.deleteHistoryConfirm}</p>
          <button type="button" disabled={busy} onClick={() => void remove()}>
            {messages.confirmDeleteEntry}
          </button>
          <button type="button" disabled={busy} onClick={() => setDeleteId(null)}>
            {messages.cancelAction}
          </button>
        </div>
      )}
      {selected && (
        <div className="history-detail">
          <button type="button" onClick={() => setSelectedId(null)}>
            {messages.closeHistoryDetail}
          </button>
          <SessionResult
            session={selected}
            locale={locale}
            messages={messages}
            theme={theme}
            saved
          />
        </div>
      )}
    </section>
  );
}
