import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { getMessages, type Locale } from "../../src/app/i18n";
import { PitchyDatabase } from "../../src/db/database";
import { LocalRepository } from "../../src/db/repositories";
import { SessionAggregator } from "../../src/domain/session-aggregator";
import { PracticeHistory } from "../../src/features/history/PracticeHistory";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let root: Root;
let db: PitchyDatabase;
let repository: LocalRepository;
let host: HTMLDivElement;
async function render(locale: Locale = "zh-CN"): Promise<void> {
  await act(async () =>
    root.render(
      <PracticeHistory
        repository={repository}
        locale={locale}
        messages={getMessages(locale)}
        theme={locale === "en" ? "light" : "dark"}
      />,
    ),
  );
}
async function setup(): Promise<void> {
  db = new PitchyDatabase(`pitchy-history-${crypto.randomUUID()}`);
  repository = new LocalRepository(db);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await render();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}
async function settle(assertion: () => void): Promise<void> {
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    assertion();
  });
}
async function click(label: string): Promise<void> {
  const button = [...host.querySelectorAll("button")].find(
    (element) => element.textContent === label,
  );
  expect(button).toBeDefined();
  await act(async () => {
    button?.click();
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}
async function write(action: () => Promise<unknown>): Promise<void> {
  await act(async () => {
    await action();
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}
function fixture(id: string, day: string) {
  return new SessionAggregator(
    { mode: "target", targetMidi: 69, tuningA4Hz: 415 },
    {
      id,
      startedAt: `2026-09-${day}T00:00:00.000Z`,
      actualSampleRate: 48000,
      inputDeviceLabel: null,
    },
    0,
  ).finish(`2026-09-${day}T00:00:01.000Z`, 1000, "stopped");
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  if (db) await db.delete();
  vi.restoreAllMocks();
});

it("reacts to saves, orders history, preserves saved settings/null evidence and locale selection", async () => {
  await setup();
  await settle(() => expect(host.textContent).toContain(getMessages("zh-CN").historyEmpty));
  await write(() => repository.saveSession(fixture("old", "19")));
  await write(() => repository.saveSession(fixture("new", "20")));
  await settle(() => expect(host.querySelectorAll("li")).toHaveLength(2));
  expect(host.querySelector("li time")?.getAttribute("datetime")).toContain("09-20");
  await act(async () => host.querySelector<HTMLButtonElement>("li button")?.click());
  expect(host.querySelector(".history-detail")?.textContent).toContain("415");
  expect(host.querySelector("[data-testid=session-within10]")?.textContent).toBe(
    getMessages("zh-CN").insufficientData,
  );
  expect(host.querySelector(".history-detail canvas")).toBeNull();
  await render("en");
  expect(host.querySelector(".history-detail")?.textContent).toContain(
    getMessages("en").savedResultTitle,
  );
  expect(host.querySelector("[aria-pressed=true]")).not.toBeNull();
  await write(() => repository.deleteSession("new"));
  await settle(() => expect(host.querySelector(".history-detail")).toBeNull());
  expect(host.querySelectorAll("li")).toHaveLength(1);
});

it("confirms individual deletion and clear without deleting preferences", async () => {
  await setup();
  await repository.savePreferences({ theme: "dark", locale: "en", tuningA4Hz: 432 });
  await write(() => repository.saveSession(fixture("one", "20")));
  await settle(() => expect(host.querySelectorAll("li")).toHaveLength(1));
  const m = getMessages("zh-CN");
  await click(m.deleteHistoryEntry);
  expect(await db.sessions.count()).toBe(1);
  await click(m.cancelAction);
  expect(await db.sessions.count()).toBe(1);
  await click(m.deleteHistoryEntry);
  await click(m.confirmDeleteEntry);
  await settle(() => expect(host.querySelectorAll("li")).toHaveLength(0));
  await write(() => repository.saveSession(fixture("two", "20")));
  await settle(() => expect(host.querySelectorAll("li")).toHaveLength(1));
  await click(m.clearSessions);
  expect(await db.sessions.count()).toBe(1);
  await click(m.confirmClearSessions);
  await settle(() => expect(host.textContent).toContain(m.historyEmpty));
  expect(await db.settings.count()).toBe(1);
});

it("reports failed reads and recovers with explicit retry", async () => {
  await setup();
  const read = vi.spyOn(repository, "listSessions").mockRejectedValue(new Error("unavailable"));
  const m = getMessages("zh-CN");
  await click(m.refreshLocalData);
  await settle(() => expect(host.textContent).toContain(m.localStorageFailed));
  read.mockRestore();
  await click(m.refreshLocalData);
  await settle(() => expect(host.textContent).toContain(m.historyEmpty));
  expect(host.textContent).not.toContain(m.localStorageFailed);
});
