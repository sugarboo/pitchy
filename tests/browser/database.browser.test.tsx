import { afterEach, describe, expect, it } from "vitest";
import { PitchyDatabase } from "../../src/db/database";
import { LocalRepository } from "../../src/db/repositories";
import type { SessionRecord } from "../../src/db/schema";
import { SessionAggregator } from "../../src/domain/session-aggregator";

const databases: PitchyDatabase[] = [];
function setup() {
  const db = new PitchyDatabase(`pitchy-test-${crypto.randomUUID()}`);
  databases.push(db);
  return { db, repository: new LocalRepository(db) };
}
const defaults = { theme: "dark", locale: "zh-CN", tuningA4Hz: 440 } as const;
function result(id: string) {
  return new SessionAggregator(
    { mode: "free", targetMidi: null, tuningA4Hz: 440 },
    { id, startedAt: "2026-09-20T00:00:00.000Z", actualSampleRate: 48000, inputDeviceLabel: null },
    0,
  ).finish("2026-09-20T00:00:01.000Z", 1000, "stopped");
}
afterEach(async () => {
  for (const db of databases.splice(0)) await db.delete();
});

describe("native IndexedDB repositories", () => {
  it("migrates valid legacy defaults once and uses canonical settings after reopen", async () => {
    const { db, repository } = setup();
    expect((await repository.loadPreferences(defaults)).preferences).toEqual(defaults);
    await repository.savePreferences({ theme: "light", locale: "en", tuningA4Hz: 432 });
    db.close();
    await db.open();
    expect((await repository.loadPreferences(defaults)).preferences).toEqual({
      theme: "light",
      locale: "en",
      tuningA4Hz: 432,
    });
    expect(await db.settings.count()).toBe(1);
  });
  it("preserves corrupt settings until an explicit replacement is saved", async () => {
    const { db, repository } = setup();
    await db.settings.put({
      key: "preferences",
      value: "broken",
      updatedAt: "bad",
      schemaVersion: 99,
    });
    expect((await repository.loadPreferences(defaults)).invalid).toBe(true);
    expect((await db.settings.get("preferences"))?.schemaVersion).toBe(99);
    await repository.savePreferences(defaults);
    expect((await repository.loadPreferences(defaults)).invalid).toBe(false);
  });
  it("saves idempotently, reopens, skips corruption, deletes one and clears sessions only", async () => {
    const { db, repository } = setup();
    await repository.loadPreferences(defaults);
    await repository.saveSession(result("one"));
    await repository.saveSession(result("one"));
    await repository.saveSession(result("two"));
    await db.sessions.put({ id: "bad", schemaVersion: 2 } as unknown as SessionRecord);
    db.close();
    await db.open();
    const loaded = await repository.listSessions();
    expect(loaded.sessions).toHaveLength(2);
    expect(loaded.invalidCount).toBe(1);
    expect(loaded.sessions[0]?.summary.voicedDurationMs).toBe(0);
    await repository.deleteSession("one");
    expect((await repository.listSessions()).sessions.map((s) => s.summary.id)).toEqual(["two"]);
    await repository.clearSessions();
    expect(await repository.listSessions()).toEqual({ sessions: [], invalidCount: 0 });
    expect(await db.settings.count()).toBe(1);
  });
  it("rejects invalid writes before opening an IndexedDB transaction", async () => {
    const { db, repository } = setup();
    const invalid = { ...result("bad"), samples: new Float32Array(1) };
    await expect(repository.saveSession(invalid)).rejects.toThrow();
    expect(await db.sessions.count()).toBe(0);
  });
});
