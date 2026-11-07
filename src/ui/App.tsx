import { Component, useEffect, useState, type ReactNode } from 'react';
import { getStatus, subscribe, type SyncStatus } from '../lib/syncClient';
import { Home } from './Home';
import { Import } from './Import';
import { ToastHost } from './kit';
import { Log } from './Log';
import { Settings } from './Settings';

export type Tab = 'log' | 'home' | 'import' | 'settings';
const TABS: { id: Tab; label: string }[] = [
  { id: 'log', label: 'Log' },
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
    off: ['Not syncing', 'bg-steel-dim'],
    locked: ['Locked', 'bg-warn'],
    idle: ['Synced', 'bg-lume'],
    syncing: ['Syncing…', 'bg-cat-water animate-pulse'],
    error: ['Sync error', 'bg-err']
  };
  const [text, dot] = map[s.state];
  return (
    <span className="flex items-center gap-2 text-sm text-steel">
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
      <span data-testid="sync-pill">{text}</span>
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
        <p className="font-semibold text-err">Something broke on this screen.</p>
        <p className="font-mono text-xs text-steel">{this.state.error.message}</p>
        <p className="text-sm text-steel">Your data is safe on this device. Reload to continue.</p>
        <button className="btn" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}

export function App() {
  const [tab, setTab] = useState<Tab>('log');
  return (
    <ToastHost>
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-dial/95 px-5 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur">
        <h1 className="cond text-2xl font-bold tracking-[0.02em] text-lume">Vitals</h1>
        <SyncPill />
      </header>
      <main className="flex-1 px-4 pb-28 pt-1">
        <ErrorBoundary key={tab}>
          {tab === 'log' && <Log />}
          {tab === 'home' && <Home go={setTab} />}
          {tab === 'import' && <Import go={setTab} />}
          {tab === 'settings' && <Settings />}
        </ErrorBoundary>
      </main>
      <nav className="fixed inset-x-0 bottom-0 border-t border-dial-rule bg-dial-deep/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-2xl">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={`cond relative flex-1 py-3.5 text-base ${tab === t.id ? 'font-semibold text-lume' : 'text-steel'}`}
            >
              {tab === t.id && <span className="absolute inset-x-1/3 top-0 h-0.5 rounded-full bg-lume" aria-hidden="true" />}
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
    </ToastHost>
  );
}
