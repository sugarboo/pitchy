import type { CompletedPracticeSession } from "../domain/session";
import { database, type PitchyDatabase } from "./database";
import {
  completedSessionSchema,
  type StoredPreferences,
  sessionRecordSchema,
  settingRecordSchema,
  settingsSchema,
} from "./schema";

export class LocalRepository {
  constructor(readonly db: PitchyDatabase) {}

  async loadPreferences(
    defaults: StoredPreferences,
  ): Promise<{ preferences: StoredPreferences; invalid: boolean }> {
    const fallback = settingsSchema.parse(defaults);
    return this.db.transaction("rw", this.db.settings, async () => {
      const row = await this.db.settings.get("preferences");
      if (row !== undefined) {
        const parsed = settingRecordSchema.safeParse(row);
        return {
          preferences: parsed.success ? parsed.data.value : fallback,
          invalid: !parsed.success,
        };
      }
      // Defaults already include valid legacy theme/locale values. One atomic insert
      // makes migration idempotent and prevents a later tab overwriting current settings.
      await this.db.settings.put({
        key: "preferences",
        value: fallback,
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
      });
      return { preferences: fallback, invalid: false };
    });
  }

  async savePreferences(preferences: StoredPreferences): Promise<void> {
    const value = settingsSchema.parse(preferences);
    await this.db.settings.put({
      key: "preferences",
      value,
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
    });
  }

  async saveSession(session: CompletedPracticeSession): Promise<void> {
    const result = completedSessionSchema.parse(session);
    await this.db.sessions.put({
      id: result.summary.id,
      startedAt: result.summary.startedAt,
      mode: result.summary.mode,
      schemaVersion: 1,
      result,
    });
  }

  async listSessions(): Promise<{ sessions: CompletedPracticeSession[]; invalidCount: number }> {
    const rows = await this.db.sessions.toArray();
    const sessions: CompletedPracticeSession[] = [];
    let invalidCount = 0;
    for (const row of rows) {
      const parsed = sessionRecordSchema.safeParse(row);
      if (parsed.success) sessions.push(parsed.data.result);
      else invalidCount++;
    }
    sessions.sort((a, b) => b.summary.startedAt.localeCompare(a.summary.startedAt));
    return { sessions, invalidCount };
  }

  async deleteSession(id: string): Promise<void> {
    await this.db.sessions.delete(id);
  }

  async clearSessions(): Promise<void> {
    await this.db.sessions.clear();
  }
}

export const localRepository = new LocalRepository(database);
