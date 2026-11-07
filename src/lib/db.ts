import Dexie, { type Table } from 'dexie';
import type { HealthRecord, Kind } from './model';
import { monthOf } from './time';

export interface Setting {
  key: string;
  value: unknown;
}

export class HealthDB extends Dexie {
  records!: Table<HealthRecord, string>;
  settings!: Table<Setting, string>;
  constructor(name = 'health') {
    super(name);
    this.version(1).stores({
      records: 'id, kind, day, [kind+day], updatedAt, deviceId',
      settings: 'key'
    });
  }

  async getSetting<T>(key: string, fallback: T): Promise<T> {
    const s = await this.settings.get(key);
    return s === undefined ? fallback : (s.value as T);
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    await this.settings.put({ key, value });
  }

  /** Local writes go through here so the sync knows which months to push. */
  async saveLocal(records: HealthRecord[]): Promise<void> {
    if (!records.length) return;
    await this.transaction('rw', this.records, this.settings, async () => {
      await this.records.bulkPut(records);
      // month -> write counter; a sync only clears months it fully pushed
      const seq = (await this.getSetting<number>('writeSeq', 0)) + 1;
      const dirty = await this.getSetting<Record<string, number>>('dirtyMonths', {});
      for (const r of records) dirty[monthOf(r.day)] = seq;
      await this.setSetting('writeSeq', seq);
      await this.setSetting('dirtyMonths', dirty);
    });
  }

  /** Called after a push: forget months not written to since `pushed` was read. */
  async clearPushed(pushed: Record<string, number>): Promise<void> {
    await this.transaction('rw', this.settings, async () => {
      const dirty = await this.getSetting<Record<string, number>>('dirtyMonths', {});
      for (const [m, seq] of Object.entries(pushed)) if (dirty[m] === seq) delete dirty[m];
      await this.setSetting('dirtyMonths', dirty);
    });
  }

  async live(kind: Kind): Promise<HealthRecord[]> {
    const all = await this.records.where('kind').equals(kind).toArray();
    return all.filter((r) => !r.deleted);
  }
}

export const db = new HealthDB();

export async function getDeviceId(d: HealthDB = db): Promise<string> {
  let id = await d.getSetting<string | null>('deviceId', null);
  if (!id) {
    id = crypto.randomUUID().slice(0, 8);
    await d.setSetting('deviceId', id);
  }
  return id;
}
