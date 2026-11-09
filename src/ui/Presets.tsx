import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '../lib/db';
import { addNote } from '../lib/log';
import {
  loadPresets,
  MG_PER_SHOT,
  savePreset,
  supplementChangeNotes,
  type AlcoholPreset,
  type CoffeePreset,
  type Presets as P,
  type SupplementItem,
  type WaterSettings
} from '../lib/presets';
import { scheduleSync } from '../lib/syncClient';
import { nowNaive } from '../lib/time';
import { useDeviceId, useToast } from './kit';

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || crypto.randomUUID().slice(0, 8);

const cell = 'input px-2 py-1.5 text-sm';

function useDraft<K extends keyof P>(key: K): [P[K] | undefined, (v: P[K]) => void, P[K] | undefined] {
  const saved = useLiveQuery(() => loadPresets(db).then((p) => p[key]));
  const [draft, setDraft] = useState<P[K]>();
  useEffect(() => {
    if (saved) setDraft(structuredClone(saved));
  }, [JSON.stringify(saved)]); // eslint-disable-line react-hooks/exhaustive-deps
  return [draft, setDraft, saved];
}

function SaveBar({ dirty, onSave }: { dirty: boolean; onSave: () => void }) {
  return (
    <button className="btn mt-3" disabled={!dirty} onClick={onSave}>
      Save
    </button>
  );
}

function CoffeeEditor({ deviceId }: { deviceId: string }) {
  const [list, setList, saved] = useDraft('coffee');
  const toast = useToast();
  if (!list) return null;
  const set = (i: number, c: Partial<CoffeePreset>) => setList(list.map((x, j) => (j === i ? { ...x, ...c } : x)));
  return (
    <details className="section" data-testid="coffee-presets">
      <summary className="cursor-pointer font-semibold">Coffee drinks</summary>
      <p className="mb-2 mt-2 text-xs text-steel-dim">Caffeine = shots × mg per shot. "Estimated" marks café drinks where the shot count is a guess.</p>
      {list.map((c, i) => (
        <div key={c.id} className="mb-2 grid grid-cols-[1fr_3.5rem_auto_auto] items-center gap-2">
          <input className={cell} aria-label="Drink name" value={c.name} onChange={(e) => set(i, { name: e.target.value })} />
          <input className={cell} aria-label="Shots" inputMode="numeric" value={c.shots} onChange={(e) => set(i, { shots: Number(e.target.value) || 1 })} />
          <label className="flex items-center gap-1 text-xs text-steel">
            <input type="checkbox" checked={c.estimated} onChange={(e) => set(i, { estimated: e.target.checked })} /> est.
          </label>
          <button className="px-2 text-steel-dim" aria-label={`Remove ${c.name}`} onClick={() => setList(list.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <button
        className="btn-ghost text-sm"
        onClick={() => setList([...list, { id: `coffee-${crypto.randomUUID().slice(0, 6)}`, name: 'New drink', shots: 2, mgPerShot: MG_PER_SHOT, milk: 'dairy', estimated: true }])}
      >
        + Add drink
      </button>
      <SaveBar
        dirty={JSON.stringify(list) !== JSON.stringify(saved)}
        onSave={async () => {
          await savePreset(db, deviceId, 'coffee', list);
          scheduleSync();
          toast({ text: 'Coffee drinks saved' });
        }}
      />
    </details>
  );
}

function AlcoholEditor({ deviceId }: { deviceId: string }) {
  const [list, setList, saved] = useDraft('alcohol');
  const toast = useToast();
  if (!list) return null;
  const set = (i: number, c: Partial<AlcoholPreset>) => setList(list.map((x, j) => (j === i ? { ...x, ...c } : x)));
  return (
    <details className="section">
      <summary className="cursor-pointer font-semibold">Alcohol</summary>
      <div className="mb-1 mt-2 grid grid-cols-[1fr_4rem_4rem_auto] gap-2 text-xs text-steel-dim">
        <span>Name</span>
        <span>ml</span>
        <span>% ABV</span>
        <span />
      </div>
      {list.map((c, i) => (
        <div key={c.id} className="mb-2 grid grid-cols-[1fr_4rem_4rem_auto] items-center gap-2">
          <input className={cell} aria-label="Drink name" value={c.name} onChange={(e) => set(i, { name: e.target.value })} />
          <input className={cell} aria-label="Volume ml" inputMode="numeric" value={c.ml} onChange={(e) => set(i, { ml: Number(e.target.value) || 0 })} />
          <input className={cell} aria-label="ABV" inputMode="decimal" value={c.abv} onChange={(e) => set(i, { abv: Number(e.target.value) || 0 })} />
          <button className="px-2 text-steel-dim" aria-label={`Remove ${c.name}`} onClick={() => setList(list.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <button className="btn-ghost text-sm" onClick={() => setList([...list, { id: `alc-${crypto.randomUUID().slice(0, 6)}`, name: 'New drink', ml: 330, abv: 5 }])}>
        + Add drink
      </button>
      <SaveBar
        dirty={JSON.stringify(list) !== JSON.stringify(saved)}
        onSave={async () => {
          await savePreset(db, deviceId, 'alcohol', list);
          scheduleSync();
          toast({ text: 'Alcohol presets saved' });
        }}
      />
    </details>
  );
}

function SupplementEditor({ deviceId }: { deviceId: string }) {
  const [list, setList, saved] = useDraft('supplements');
  const toast = useToast();
  if (!list || !saved) return null;
  const set = (i: number, c: Partial<SupplementItem>) => setList(list.map((x, j) => (j === i ? { ...x, ...c } : x)));
  return (
    <details className="section" data-testid="supplement-presets">
      <summary className="cursor-pointer font-semibold">Supplements</summary>
      <p className="mb-2 mt-2 text-xs text-steel-dim">Starting or stopping one adds a note to your charts automatically.</p>
      {list.map((s, i) => (
        <div key={s.id} className="mb-2 grid grid-cols-[1fr_auto_auto] items-center gap-2">
          <input className={cell} aria-label="Supplement name" value={s.name} onChange={(e) => set(i, { name: e.target.value })} />
          <select className={cell} aria-label="When" value={s.when} onChange={(e) => set(i, { when: e.target.value as SupplementItem['when'] })}>
            <option value="morning">morning</option>
            <option value="night">night</option>
          </select>
          <label className="flex items-center gap-1 text-xs text-steel">
            <input type="checkbox" aria-label={`Taking ${s.name}`} checked={s.active} onChange={(e) => set(i, { active: e.target.checked })} /> taking
          </label>
        </div>
      ))}
      <AddSupplement onAdd={(name) => setList([...list, { id: slug(name), name, when: 'night', active: true }])} />
      <SaveBar
        dirty={JSON.stringify(list) !== JSON.stringify(saved)}
        onSave={async () => {
          const notes = supplementChangeNotes(saved, list);
          await savePreset(db, deviceId, 'supplements', list);
          for (const text of notes) await addNote({ db, deviceId, at: nowNaive() }, text, true);
          scheduleSync();
          toast({ text: notes.length ? `Supplements saved. ${notes.join('. ')}` : 'Supplements saved' });
        }}
      />
    </details>
  );
}

function AddSupplement({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <div className="flex gap-2">
      <input className={cell} placeholder="New supplement" value={name} onChange={(e) => setName(e.target.value)} />
      <button
        className="btn-ghost text-sm"
        disabled={!name.trim()}
        onClick={() => {
          onAdd(name.trim());
          setName('');
        }}
      >
        Add
      </button>
    </div>
  );
}

function SymptomEditor({ deviceId }: { deviceId: string }) {
  const [list, setList, saved] = useDraft('symptoms');
  const toast = useToast();
  const [name, setName] = useState('');
  if (!list || !saved) return null;
  return (
    <details className="section" data-testid="symptom-presets">
      <summary className="cursor-pointer font-semibold">Symptoms</summary>
      <p className="mb-2 mt-2 text-xs text-steel-dim">The buttons on the Symptoms card. Removing one keeps what you already logged.</p>
      {list.map((s, i) => (
        <div key={s.id} className="mb-2 grid grid-cols-[1fr_auto] items-center gap-2">
          <input className={cell} aria-label="Symptom name" value={s.name} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <button className="btn-ghost text-sm" aria-label={`Remove ${s.name}`} onClick={() => setList(list.filter((_, j) => j !== i))}>
            Remove
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input className={cell} placeholder="New symptom" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          className="btn-ghost text-sm"
          disabled={!name.trim() || list.some((s) => s.id === slug(name))}
          onClick={() => {
            setList([...list, { id: slug(name), name: name.trim() }]);
            setName('');
          }}
        >
          Add
        </button>
      </div>
      <SaveBar
        dirty={JSON.stringify(list) !== JSON.stringify(saved)}
        onSave={async () => {
          await savePreset(db, deviceId, 'symptoms', list);
          scheduleSync();
          toast({ text: 'Symptoms saved' });
        }}
      />
    </details>
  );
}

function WaterEditor({ deviceId }: { deviceId: string }) {
  const [w, setW, saved] = useDraft('water');
  const toast = useToast();
  if (!w) return null;
  const field = (k: keyof WaterSettings, label: string) => (
    <label>
      <span className="label">{label}</span>
      <input className={cell} inputMode="numeric" value={w[k]} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) || 0 })} />
    </label>
  );
  return (
    <details className="section">
      <summary className="cursor-pointer font-semibold">Water</summary>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {field('targetMl', 'Daily target (ml)')}
        {field('exerciseTargetMl', 'Exercise days (ml)')}
        {field('glassMl', 'Glass (ml)')}
        {field('bottleMl', 'Bottle (ml)')}
      </div>
      <SaveBar
        dirty={JSON.stringify(w) !== JSON.stringify(saved)}
        onSave={async () => {
          await savePreset(db, deviceId, 'water', w);
          scheduleSync();
          toast({ text: 'Water settings saved' });
        }}
      />
    </details>
  );
}

export function PresetEditors() {
  const deviceId = useDeviceId();
  if (!deviceId) return null;
  return (
    <>
      <h2 className="px-1 pt-2 text-sm text-steel-dim">Presets (shared by all devices)</h2>
      <CoffeeEditor deviceId={deviceId} />
      <SupplementEditor deviceId={deviceId} />
      <SymptomEditor deviceId={deviceId} />
      <AlcoholEditor deviceId={deviceId} />
      <WaterEditor deviceId={deviceId} />
    </>
  );
}
