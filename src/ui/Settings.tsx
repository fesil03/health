import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { download, makeBackup, restoreBackup } from '../lib/backup';
import { db, getDeviceId } from '../lib/db';
import { WrongPassphraseError } from '../lib/sync/sync';
import { checkRepo, connect, disconnect, getConfig, lock, runSync, scheduleSync } from '../lib/syncClient';
import { useSyncStatus } from './App';
import { PresetEditors } from './Presets';
import { TOP_STYLES, type TopStyle } from './TodayTop';
import { ago } from './format';

const errText = (e: unknown) =>
  e instanceof WrongPassphraseError ? e.message : e instanceof Error ? e.message : String(e);

function SyncSetup() {
  const saved = useLiveQuery(() => getConfig());
  const [repoFull, setRepoFull] = useState('fesil03/health-data');
  const [token, setToken] = useState('');
  const [mode, setMode] = useState<'new' | 'existing' | null>(null);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const cfgFrom = () => {
    const [owner, repo] = repoFull.trim().split('/');
    return { owner, repo, token: token.trim() || saved?.token || '' };
  };

  async function step1() {
    setBusy(true);
    setErr('');
    try {
      setMode(await checkRepo(cfgFrom()));
    } catch (e) {
      setErr(errText(e));
    }
    setBusy(false);
  }

  async function step2() {
    if (mode === 'new' && pass !== pass2) return setErr('The two passphrases are different.');
    if (mode === 'new' && pass.length < 10) return setErr('Use at least 10 characters.');
    setBusy(true);
    setErr('');
    try {
      await connect(cfgFrom(), pass);
      setPass('');
      setPass2('');
    } catch (e) {
      setErr(errText(e));
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      {!saved && (
        <>
          <div>
            <label className="label" htmlFor="repo">Private data repo</label>
            <input id="repo" className="input" value={repoFull} onChange={(e) => setRepoFull(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="token">GitHub token (fine-grained, this repo only, Contents read/write)</label>
            <input id="token" className="input" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
          </div>
        </>
      )}
      {!mode ? (
        <button className="btn" disabled={busy || (!token && !saved)} onClick={() => void step1()}>
          {busy ? 'Checking…' : 'Continue'}
        </button>
      ) : (
        <>
          <p className="text-sm text-ink">
            {mode === 'new'
              ? 'Choose a passphrase. It locks your data before it leaves this device. Save it in your password manager: if it is lost, the cloud copy cannot be opened by anyone.'
              : 'This repo already holds locked data. Enter the passphrase you chose on your first device.'}
          </p>
          <input className="input" type="password" placeholder="Passphrase" value={pass} onChange={(e) => setPass(e.target.value)} />
          {mode === 'new' && (
            <input className="input" type="password" placeholder="Same passphrase again" value={pass2} onChange={(e) => setPass2(e.target.value)} />
          )}
          <button className="btn" disabled={busy || !pass} onClick={() => void step2()}>
            {busy ? 'Unlocking… (a few seconds)' : mode === 'new' ? 'Create lock and sync' : 'Unlock and sync'}
          </button>
        </>
      )}
      {err && <p className="text-sm text-err">{err}</p>}
    </div>
  );
}

function TopStylePicker() {
  const current = useLiveQuery(() => db.getSetting<TopStyle>('topStyle', 'totals'));
  return (
    <section className="section" aria-label="Top of the Log screen">
      <h2 className="h2">Top of the Log screen</h2>
      <div className="space-y-2" role="radiogroup" aria-label="Top of the Log screen">
        {TOP_STYLES.map((t) => (
          <button
            key={t.id}
            role="radio"
            aria-checked={current === t.id}
            onClick={() => void db.setSetting('topStyle', t.id)}
            className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left ${
              current === t.id ? 'border-lume bg-lume/10' : 'border-dial-rule'
            }`}
          >
            <span>
              <span className="title block text-base">{t.name}</span>
              <span className="meta">{t.blurb}</span>
            </span>
            <span className={`h-4 w-4 rounded-full border-2 ${current === t.id ? 'border-lume bg-lume' : 'border-steel-dim'}`} aria-hidden="true" />
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-steel-dim">Saved on this device only.</p>
    </section>
  );
}

export function Settings() {
  const sync = useSyncStatus();
  const cfg = useLiveQuery(() => getConfig());
  const [deviceId, setDeviceId] = useState('');
  useEffect(() => void getDeviceId().then(setDeviceId), []); // may write: not inside a live query
  const pending = useLiveQuery(() => db.getSetting<Record<string, number>>('dirtyMonths', {}));
  const [msg, setMsg] = useState('');

  async function onRestore(f: File | undefined) {
    if (!f) return;
    try {
      const n = await restoreBackup(db, await f.text());
      scheduleSync(1000);
      setMsg(`Restored ${n} records.`);
    } catch (e) {
      setMsg(errText(e));
    }
  }

  return (
    <>
      <section className="section" data-testid="sync-settings">
        <h2 className="h2">Sync</h2>
        {sync.state === 'off' || sync.state === 'locked' ? (
          <SyncSetup />
        ) : (
          <div className="space-y-2 text-sm">
            <p>
              Repo <span className="text-ink">{cfg?.owner}/{cfg?.repo}</span>
            </p>
            <p>
              Last sync <span className="text-ink">{ago(sync.lastSyncAt)}</span>
              {sync.lastReport && (
                <span className="text-steel-dim">
                  {' '}
                  (received {sync.lastReport.mergedRecords}, sent {sync.lastReport.pushedFiles} files)
                </span>
              )}
            </p>
            <p>
              Waiting to send <span className="text-ink">{Object.keys(pending ?? {}).length} months</span>
            </p>
            {sync.state === 'error' && <p className="text-err">{sync.message}</p>}
            <div className="flex flex-wrap gap-2 pt-2">
              <button className="btn" disabled={sync.state === 'syncing'} onClick={() => void runSync()}>
                Sync now
              </button>
              <button className="btn-ghost" onClick={() => void lock()}>
                Lock this device
              </button>
              <button className="btn-ghost" onClick={() => void disconnect()}>
                Disconnect
              </button>
            </div>
            <p className="pt-1 text-xs text-steel-dim">
              Lock forgets the key here (you'll re-enter the passphrase). Disconnect also forgets the token. Neither deletes data.
            </p>
          </div>
        )}
      </section>

      <TopStylePicker />

      <PresetEditors />

      <section className="section">
        <h2 className="h2">Backup</h2>
        <p className="mb-3 text-sm text-steel">
          An unlocked copy of everything, for your computer. It is not encrypted, so don't upload it anywhere.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-ghost"
            onClick={async () => download(`health-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await makeBackup(db)))}
          >
            Export backup
          </button>
          <label className="btn-ghost cursor-pointer">
            Restore backup
            <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => void onRestore(e.target.files?.[0])} />
          </label>
        </div>
        {msg && <p className="mt-2 text-sm text-ink">{msg}</p>}
      </section>

      <section className="section text-sm text-steel">
        <p>
          This device <span className="font-mono text-ink">{deviceId}</span>
        </p>
        <p>Version {__APP_VERSION__}</p>
      </section>
    </>
  );
}
