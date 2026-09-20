import { useState } from "react";
import type { Messages } from "../../app/i18n";
import { localRepository } from "../../db/repositories";
import type { CompletedPracticeSession } from "../../domain/session";

export function SessionStorage({
  session,
  messages,
}: {
  session: CompletedPracticeSession;
  messages: Messages;
}) {
  const [status, setStatus] = useState<"idle" | "busy" | "saved" | "failed" | "deleted">("idle");
  async function save(): Promise<void> {
    setStatus("busy");
    try {
      await localRepository.saveSession(session);
      setStatus("saved");
    } catch {
      setStatus("failed");
    }
  }
  async function remove(): Promise<void> {
    setStatus("busy");
    try {
      await localRepository.deleteSession(session.summary.id);
      setStatus("deleted");
    } catch {
      setStatus("failed");
    }
  }
  return (
    <div className="session-storage">
      <button type="button" disabled={status === "busy"} onClick={() => void save()}>
        {messages.saveSession}
      </button>
      <button type="button" disabled={status === "busy"} onClick={() => void remove()}>
        {messages.deleteSavedSession}
      </button>
      <p role="status">
        {status === "saved"
          ? messages.sessionSaved
          : status === "deleted"
            ? messages.sessionDeleted
            : status === "failed"
              ? messages.localStorageFailed
              : messages.sessionSaveHint}
      </p>
    </div>
  );
}
