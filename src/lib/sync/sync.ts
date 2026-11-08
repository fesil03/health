import { checkVerifier, deriveKey, DEFAULT_ITERATIONS, makeVerifier, newSalt, openJson, sealJson } from '../crypto';
import type { HealthDB } from '../db';
import type { HealthRecord } from '../model';
import { monthOf } from '../time';
import type { RemoteStore } from './store';

export const META_PATH = 'meta.json';
// Month files from the apps; day files (YYYY-MM-DD) from the watch bridge.
const FILE_RE = /^devices\/([A-Za-z0-9_-]+)\/(\d{4}-\d{2}(?:-\d{2})?)\.enc$/;
export const devicePath = (deviceId: string, month: string) => `devices/${deviceId}/${month}.enc`;

interface Meta {
  v: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  verifier: string;
  createdAt: string;
}

interface DeviceFile {
  v: 1;
  deviceId: string;
  month: string;
  records: HealthRecord[];
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('That passphrase does not match the one used to lock this data.');
  }
}

/**
 * First device: creates meta.json (salt + key check). Later devices: derives the key
 * from the same salt and checks the passphrase against the stored verifier.
 */
export async function unlock(
  store: RemoteStore,
  passphrase: string,
  iterations = DEFAULT_ITERATIONS
): Promise<{ key: CryptoKey; created: boolean }> {
  const files = await store.list();
  const metaFile = files.find((f) => f.path === META_PATH);
  if (metaFile) {
    const meta = JSON.parse(await store.read(metaFile)) as Meta;
    const key = await deriveKey(passphrase, meta.kdf.salt, meta.kdf.iterations);
    if (!(await checkVerifier(key, meta.verifier))) throw new WrongPassphraseError();
    return { key, created: false };
  }
  const salt = newSalt();
  const key = await deriveKey(passphrase, salt, iterations);
  const meta: Meta = {
    v: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt },
    verifier: await makeVerifier(key),
    createdAt: new Date().toISOString()
  };
  await store.write([{ path: META_PATH, text: JSON.stringify(meta, null, 2) }], 'Set up encrypted health data');
  return { key, created: true };
}

/** True when `incoming` should replace `local`. Newest edit wins; ties go to the higher device id. */
export function incomingWins(local: HealthRecord | undefined, incoming: HealthRecord): boolean {
  if (!local) return true;
  if (incoming.updatedAt !== local.updatedAt) return incoming.updatedAt > local.updatedAt;
  return incoming.deviceId > local.deviceId;
}

export interface SyncReport {
  pulledFiles: number;
  mergedRecords: number;
  pushedFiles: number;
  at: number;
}

export async function sync(
  db: HealthDB,
  store: RemoteStore,
  key: CryptoKey,
  deviceId: string,
  now = Date.now()
): Promise<SyncReport> {
  const report: SyncReport = { pulledFiles: 0, mergedRecords: 0, pushedFiles: 0, at: now };
  const seen = await db.getSetting<Record<string, string>>('remoteShas', {});
  const remote = await store.list();

  // 1. Pull files from other devices that changed since we last looked.
  for (const f of remote) {
    const m = FILE_RE.exec(f.path);
    if (!m || m[1] === deviceId || seen[f.path] === f.sha) continue;
    const file = await openJson<DeviceFile>(key, await store.read(f), f.path);
    const incoming = file.records;
    const locals = await db.records.bulkGet(incoming.map((r) => r.id));
    const winners = incoming.filter((r, i) => incomingWins(locals[i], r));
    if (winners.length) await db.records.bulkPut(winners); // not marked dirty: they belong to the other device
    report.mergedRecords += winners.length;
    report.pulledFiles++;
    seen[f.path] = f.sha;
  }

  // 2. Push this device's months that changed locally.
  const dirtyMap = await db.getSetting<Record<string, number>>('dirtyMonths', {});
  const dirty = Object.keys(dirtyMap).sort();
  if (dirty.length) {
    const mine = await db.records.where('deviceId').equals(deviceId).toArray();
    const files = [];
    for (const month of dirty) {
      const path = devicePath(deviceId, month);
      const records = mine.filter((r) => monthOf(r.day) === month);
      const payload: DeviceFile = { v: 1, deviceId, month, records };
      files.push({ path, text: await sealJson(key, payload, path) });
    }
    const shas = await store.write(files, `Sync ${deviceId}: ${dirty.join(', ')}`);
    Object.assign(seen, shas);
    report.pushedFiles = files.length;
    await db.clearPushed(dirtyMap);
  }

  await db.setSetting('remoteShas', seen);
  await db.setSetting('lastSyncAt', now);
  return report;
}
