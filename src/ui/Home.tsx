import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import type { SleepData } from '../lib/model';
import { KIND_LABELS } from '../lib/samsung/importer';
import { runSync } from '../lib/syncClient';
import { useSyncStatus, type Tab } from './App';
import { AskClaude } from './AskClaude';
import { ago, clock, hm, range, shortDay } from './format';

const KINDS = Object.keys(KIND_LABELS) as (keyof typeof KIND_LABELS)[];

export function Home({ go }: { go: (t: Tab) => void }) {
  const sync = useSyncStatus();
  const summary = useLiveQuery(async () =>
    Promise.all(
      KINDS.map(async (kind) => {
        const live = (await db.records.where('kind').equals(kind).toArray()).filter((r) => !r.deleted);
        const days = live.map((r) => r.day).sort();
        return { kind, count: live.length, first: days[0], last: days.at(-1) };
      })
    )
  );
  // The watch bridge is its own device ("watch-xxxxxx"); show when its data last arrived.
  const watchAt = useLiveQuery(async () => {
    let last = 0;
    await db.records
      .where('deviceId')
      .startsWith('watch-')
      .each((r) => {
        if (r.updatedAt > last) last = r.updatedAt;
      });
    return last || null;
  });
  const nights = useLiveQuery(async () => {
    const all = (await db.records.where('kind').equals('sleep').toArray()).filter((r) => !r.deleted);
    // Main sleep per wake-up day = the longest one
    const byDay = new Map<string, (typeof all)[number]>();
    for (const r of all) {
      const cur = byDay.get(r.day);
      if (!cur || ((r.data as SleepData).durationMin ?? 0) > ((cur.data as SleepData).durationMin ?? 0))
        byDay.set(r.day, r);
    }
    return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day)).slice(0, 7);
  });

  if (!summary) return null;
  const empty = summary.every((s) => s.count === 0);

  return (
    <>
      <section className="section">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Sync</h2>
            <p className="text-sm text-steel">
              {sync.state === 'off' && 'Not set up yet: Settings → Sync.'}
              {sync.state === 'locked' && 'Locked on this device: enter the passphrase in Settings.'}
              {(sync.state === 'idle' || sync.state === 'syncing') && `Last synced ${ago(sync.lastSyncAt)}`}
              {sync.state === 'error' && <span className="text-err">{sync.message}</span>}
            </p>
            {!!watchAt && (
              <p className="text-sm text-steel" data-testid="watch-status">
                Watch data last arrived {ago(watchAt)}
              </p>
            )}
          </div>
          {sync.state === 'off' || sync.state === 'locked' ? (
            <button className="btn-ghost" onClick={() => go('settings')}>
              Set up
            </button>
          ) : (
            <button className="btn-ghost" disabled={sync.state === 'syncing'} onClick={() => void runSync()}>
              Sync now
            </button>
          )}
        </div>
      </section>

      {!empty && <AskClaude />}

      {empty ? (
        <section className="section text-center">
          <p className="mb-3 text-ink">No data yet. Start with your Samsung Health export.</p>
          <button className="btn" onClick={() => go('import')}>
            Import Samsung data
          </button>
        </section>
      ) : (
        <>
          {!!nights?.length && (
            <section className="section">
              <h2 className="h2">Last nights</h2>
              <table className="w-full text-sm" data-testid="nights">
                <thead className="text-left text-steel">
                  <tr>
                    <th className="pb-2 font-normal">Woke up</th>
                    <th className="pb-2 font-normal">Bed → wake</th>
                    <th className="pb-2 font-normal">Asleep</th>
                    <th className="pb-2 text-right font-normal">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {nights.map((n) => {
                    const d = n.data as SleepData;
                    return (
                      <tr key={n.id} className="border-t border-dial-rule">
                        <td className="py-2">{shortDay(n.day)}</td>
                        <td className="py-2 tabular-nums">
                          {clock(n.at)} → {clock(d.end)}
                        </td>
                        <td className="py-2 tabular-nums">{hm(d.durationMin)}</td>
                        <td className="py-2 text-right tabular-nums">{d.score ?? '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}

          <section className="section">
            <h2 className="h2">Your data</h2>
            <table className="w-full text-sm" data-testid="data-summary">
              <tbody>
                {summary
                  .filter((s) => s.count > 0)
                  .map((s) => (
                    <tr key={s.kind} className="border-t border-dial-rule first:border-0">
                      <td className="py-2">{KIND_LABELS[s.kind]}</td>
                      <td className="py-2 text-right tabular-nums">{s.count.toLocaleString()}</td>
                      <td className="whitespace-nowrap py-2 pl-3 text-right text-xs text-steel">{range(s.first, s.last)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-steel-dim">The Today screen and charts arrive in the next phases.</p>
          </section>
        </>
      )}
    </>
  );
}
