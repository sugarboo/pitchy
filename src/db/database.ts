import Dexie, { type Table } from "dexie";
import type { SessionRecord, SettingRecord } from "./schema";

export const DATABASE_NAME = "pitchy-local";

export class PitchyDatabase extends Dexie {
  readonly settings!: Table<SettingRecord, string>;
  readonly sessions!: Table<SessionRecord, string>;

  constructor(name = DATABASE_NAME) {
    super(name);
    // First IndexedDB schema. Legacy localStorage is migrated transactionally by repositories.
    this.version(1).stores({ settings: "&key", sessions: "&id,startedAt,mode" });
  }
}

export const database = new PitchyDatabase();
