import type { HealthDB } from './db';
import type { HealthRecord } from './model';
import { incomingWins } from './sync/sync';

export interface Backup {
  app: 'health';
  v: 1;
  exportedAt: string;
  records: HealthRecord[];
}

/** Everything except secrets (token, key). Unencrypted: keep it on your own computer. */
export async function makeBackup(db: HealthDB): Promise<Backup> {
  return { app: 'health', v: 1, exportedAt: new Date().toISOString(), records: await db.records.toArray() };
}

export async function restoreBackup(db: HealthDB, text: string): Promise<number> {
  const b = JSON.parse(text) as Backup;
  if (b.app !== 'health' || b.v !== 1 || !Array.isArray(b.records)) throw new Error('Not a Health backup file.');
  const locals = await db.records.bulkGet(b.records.map((r) => r.id));
  const winners = b.records.filter((r, i) => incomingWins(locals[i], r));
  // Restored records count as this device's edits so they sync out again.
  await db.saveLocal(winners);
  return winners.length;
}

export function download(name: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
