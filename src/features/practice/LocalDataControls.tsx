import { useCallback, useEffect, useState } from "react";
import type { Messages } from "../../app/i18n";
import { localRepository } from "../../db/repositories";

export function LocalDataControls({ messages }: { messages: Messages }) {
  const [invalid, setInvalid] = useState(0);
  const [count, setCount] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const refresh = useCallback(async (): Promise<void> => {
    try {
      const result = await localRepository.listSessions();
      setCount(result.sessions.length);
      setInvalid(result.invalidCount);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function clear(): Promise<void> {
    try {
      await localRepository.clearSessions();
      setConfirm(false);
      await refresh();
    } catch {
      setFailed(true);
    }
  }
  return (
    <section className="status-card local-data" aria-label={messages.localDataLabel}>
      <h2>{messages.localDataLabel}</h2>
      <p role="status">
        {failed ? messages.localStorageFailed : messages.savedSessionCount(count)}
      </p>
      {invalid > 0 && <p role="alert">{messages.invalidSessionCount(invalid)}</p>}
      <button type="button" onClick={() => void refresh()}>
        {messages.refreshLocalData}
      </button>
      <button type="button" onClick={() => setConfirm(true)}>
        {messages.clearSessions}
      </button>
      {confirm && (
        <div>
          <p>{messages.clearSessionsConfirm}</p>
          <button type="button" onClick={() => void clear()}>
            {messages.confirmClearSessions}
          </button>
          <button type="button" onClick={() => setConfirm(false)}>
            {messages.cancelAction}
          </button>
        </div>
      )}
    </section>
  );
}
