import { useRegisterSW } from "virtual:pwa-register/react";
import { getMessages } from "./i18n";
import { usePreferences } from "./preferences";

export function PwaUpdatePrompt() {
  const { locale } = usePreferences();
  const messages = getMessages(locale);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh && !offlineReady) {
    return null;
  }

  const dismiss = () => {
    setNeedRefresh(false);
    setOfflineReady(false);
  };

  return (
    <aside className="update-prompt" aria-live="polite">
      <p>{needRefresh ? messages.updateReady : messages.offlineReady}</p>
      <div>
        {needRefresh && (
          <button type="button" onClick={() => void updateServiceWorker(true)}>
            {messages.updateAndReload}
          </button>
        )}
        <button type="button" className="text-button" onClick={dismiss}>
          {messages.later}
        </button>
      </div>
    </aside>
  );
}
