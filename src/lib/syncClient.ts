// App-level sync: settings, status for the UI, and automatic syncing.
import { db, getDeviceId } from './db';
import { GitHubStore, type GitHubConfig } from './sync/github';
import { META_PATH, sync, unlock, type SyncReport } from './sync/sync';

export type SyncState = 'off' | 'locked' | 'idle' | 'syncing' | 'error';
export interface SyncStatus {
  state: SyncState;
  lastSyncAt?: number;
  lastReport?: SyncReport;
  message?: string;
}

let status: SyncStatus = { state: 'off' };
const listeners = new Set<(s: SyncStatus) => void>();
const emit = (s: Partial<SyncStatus>) => {
  status = { ...status, ...s };
  listeners.forEach((l) => l(status));
};
export const getStatus = () => status;
export function subscribe(fn: (s: SyncStatus) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const getConfig = () => db.getSetting<GitHubConfig | null>('github', null);
const getKey = () => db.getSetting<CryptoKey | null>('cryptoKey', null);

export async function refreshStatus(): Promise<void> {
  const [cfg, key, lastSyncAt] = await Promise.all([getConfig(), getKey(), db.getSetting<number | undefined>('lastSyncAt', undefined)]);
  emit({ state: !cfg ? 'off' : !key ? 'locked' : status.state === 'syncing' ? 'syncing' : 'idle', lastSyncAt });
}

/** Step 1 of setup: is the token good, and does the repo already hold locked data? */
export async function checkRepo(cfg: GitHubConfig): Promise<'new' | 'existing'> {
  const store = new GitHubStore(cfg);
  await store.check();
  const files = await store.list();
  return files.some((f) => f.path === META_PATH) ? 'existing' : 'new';
}

/** Step 2: derive the key (creating the lock on first use), save it, sync. */
export async function connect(cfg: GitHubConfig, passphrase: string): Promise<void> {
  const { key } = await unlock(new GitHubStore(cfg), passphrase);
  await db.setSetting('github', cfg);
  await db.setSetting('cryptoKey', key); // stored as a non-exportable CryptoKey
  await refreshStatus();
  await runSync();
}

/** Forget the key on this device; data and token stay. */
export async function lock(): Promise<void> {
  await db.settings.delete('cryptoKey');
  await refreshStatus();
}

/** Forget token and key; local data stays. */
export async function disconnect(): Promise<void> {
  await db.settings.bulkDelete(['github', 'cryptoKey', 'remoteShas']);
  await refreshStatus();
}

let running: Promise<void> | null = null;
export function runSync(): Promise<void> {
  if (running) return running;
  running = (async () => {
    const [cfg, key] = await Promise.all([getConfig(), getKey()]);
    if (!cfg || !key) return refreshStatus();
    emit({ state: 'syncing', message: undefined });
    try {
      const report = await sync(db, new GitHubStore(cfg), key, await getDeviceId());
      emit({ state: 'idle', lastSyncAt: report.at, lastReport: report });
    } catch (e) {
      emit({ state: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

let timer: ReturnType<typeof setTimeout> | undefined;
/** Debounced sync after local saves. */
export function scheduleSync(delayMs = 10_000): void {
  clearTimeout(timer);
  timer = setTimeout(() => void runSync(), delayMs);
}

export function startAutoSync(): void {
  void refreshStatus().then(() => runSync());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void runSync();
  });
  window.addEventListener('online', () => void runSync());
}
