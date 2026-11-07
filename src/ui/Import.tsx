import { useState } from 'react';
import { db, getDeviceId } from '../lib/db';
import { readPickedFiles } from '../lib/samsung/files';
import { KIND_LABELS, planImport, type ImportPlan } from '../lib/samsung/importer';
import { scheduleSync } from '../lib/syncClient';
import type { Tab } from './App';
import { range } from './format';

type Stage = { s: 'pick' } | { s: 'reading' } | { s: 'preview'; plan: ImportPlan } | { s: 'saved'; n: number } | { s: 'error'; msg: string };

export function Import({ go }: { go: (t: Tab) => void }) {
  const [stage, setStage] = useState<Stage>({ s: 'pick' });

  async function onPick(list: FileList | null) {
    if (!list?.length) return;
    setStage({ s: 'reading' });
    try {
      const files = await readPickedFiles([...list]);
      if (!files.length) throw new Error('No Samsung Health files found. Pick the export ZIP or the CSV files inside it.');
      setStage({ s: 'preview', plan: await planImport(db, files, await getDeviceId()) });
    } catch (e) {
      setStage({ s: 'error', msg: e instanceof Error ? e.message : String(e) });
    }
  }

  async function save(plan: ImportPlan) {
    await db.saveLocal(plan.toSave);
    scheduleSync(1000);
    setStage({ s: 'saved', n: plan.toSave.length });
  }

  return (
    <>
      <section className="card">
        <h2 className="h2">Import Samsung Health</h2>
        <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-slate-300">
          <li>Samsung Health → ☰ → Settings → Download personal data.</li>
          <li>Wait for the export to finish (it saves to Downloads / Samsung Health).</li>
          <li>Pick the ZIP here, or select all the CSV files inside the export folder.</li>
        </ol>
        <label className="btn inline-block cursor-pointer">
          Choose files
          <input
            data-testid="file-input"
            type="file"
            multiple
            accept=".zip,.csv,application/zip,text/csv"
            className="hidden"
            onChange={(e) => void onPick(e.target.files)}
          />
        </label>
        <p className="mt-3 text-xs text-slate-500">
          Files are read on this device only. Re-importing an overlapping export is safe: duplicates are skipped.
        </p>
      </section>

      {stage.s === 'reading' && <section className="card text-slate-300">Reading files…</section>}
      {stage.s === 'error' && <section className="card text-rose-300">{stage.msg}</section>}

      {stage.s === 'preview' && (
        <section className="card" data-testid="preview">
          <h2 className="h2">Preview</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-400">
              <tr>
                <th className="pb-2 font-normal">Type</th>
                <th className="pb-2 text-right font-normal">New</th>
                <th className="pb-2 text-right font-normal">Have</th>
                <th className="pb-2 text-right font-normal">Skipped</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {stage.plan.preview.map((p) => (
                <tr key={p.kind} className="border-t border-slate-800">
                  <td className="py-2">
                    {KIND_LABELS[p.kind as keyof typeof KIND_LABELS]}
                    <div className="text-xs text-slate-500">{range(p.first, p.last)}</div>
                  </td>
                  <td className="py-2 text-right">{p.fresh + p.updated}</td>
                  <td className="py-2 text-right text-slate-400">{p.duplicate}</td>
                  <td className="py-2 text-right text-slate-400">{p.dropped}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-slate-500">
            New includes newer versions of records you already have. Skipped = unreadable rows, readings with impossible dates, or naps and workouts too short to count.
          </p>
          <div className="mt-4 flex gap-2">
            <button className="btn" disabled={!stage.plan.toSave.length} onClick={() => void save(stage.plan)}>
              {stage.plan.toSave.length ? `Save ${stage.plan.toSave.length.toLocaleString()} records` : 'Nothing new'}
            </button>
            <button className="btn-ghost" onClick={() => setStage({ s: 'pick' })}>
              Cancel
            </button>
          </div>
        </section>
      )}

      {stage.s === 'saved' && (
        <section className="card" data-testid="saved">
          <p className="mb-3">Saved {stage.n.toLocaleString()} records.</p>
          <button className="btn" onClick={() => go('home')}>
            See my data
          </button>
        </section>
      )}
    </>
  );
}
