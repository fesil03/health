import { Component, useEffect, useState, type ReactNode } from 'react';
import { getStatus, subscribe, type SyncStatus } from '../lib/syncClient';
import { Home } from './Home';
import { Import } from './Import';
import { Settings } from './Settings';

export type Tab = 'home' | 'import' | 'settings';
const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'import', label: 'Import' },
  { id: 'settings', label: 'Settings' }
];

export function useSyncStatus(): SyncStatus {
  const [s, set] = useState(getStatus());
  useEffect(() => subscribe(set), []);
  return s;
}

function SyncPill() {
  const s = useSyncStatus();
  const map: Record<SyncStatus['state'], [string, string]> = {
    off: ['Not syncing', 'bg-slate-800 text-slate-400'],
    locked: ['Locked', 'bg-amber-500/15 text-amber-300'],
    idle: ['Synced', 'bg-emerald-500/15 text-emerald-300'],
    syncing: ['Syncing…', 'bg-sky-500/15 text-sky-300'],
    error: ['Sync error', 'bg-rose-500/15 text-rose-300']
  };
  const [text, cls] = map[s.state];
  return (
    <span data-testid="sync-pill" className={`rounded-full px-3 py-1 text-xs ${cls}`}>
      {text}
    </span>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card m-4 space-y-3">
        <p className="font-semibold text-rose-300">Something broke on this screen.</p>
        <p className="font-mono text-xs text-slate-400">{this.state.error.message}</p>
        <p className="text-sm text-slate-400">Your data is safe on this device. Reload to continue.</p>
        <button className="btn" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}

export function App() {
  const [tab, setTab] = useState<Tab>('home');
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-950/90 px-4 py-3 backdrop-blur">
        <h1 className="text-xl font-semibold">Health</h1>
        <SyncPill />
      </header>
      <main className="flex-1 space-y-4 p-4 pb-24">
        <ErrorBoundary key={tab}>
          {tab === 'home' && <Home go={setTab} />}
          {tab === 'import' && <Import go={setTab} />}
          {tab === 'settings' && <Settings />}
        </ErrorBoundary>
      </main>
      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-800 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-2xl">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-3 text-sm ${tab === t.id ? 'font-semibold text-emerald-400' : 'text-slate-400'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
