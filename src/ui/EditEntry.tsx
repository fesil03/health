import { useState } from 'react';
import { db } from '../lib/db';
import { deleteRecord, stoolNeedsDoctorNote, updateRecord } from '../lib/log';
import type {
  AlcoholData,
  BodyData,
  CoffeeData,
  HealthRecord,
  LabData,
  MealData,
  NicotineData,
  NicotineForm,
  NoteData,
  StoolColor,
  StoolData,
  SupplementData,
  WaterData
} from '../lib/model';
import { alcoholGrams } from '../lib/presets';
import { scheduleSync } from '../lib/syncClient';
import { BristolPicker } from './Bristol';
import { Chip, fromInput, Sheet, Stepper, toInput, YesNo } from './kit';

const COLORS: StoolColor[] = ['brown', 'yellow', 'green', 'black', 'red', 'pale'];
const COLOR_SWATCH: Record<StoolColor, string> = {
  brown: '#92400e',
  yellow: '#ca8a04',
  green: '#4d7c0f',
  black: '#0a0a0a',
  red: '#b91c1c',
  pale: '#d6d3d1'
};
const EASE = ['', 'Easy', 'Normal', 'Some straining', 'Hard straining'];

export function describe(r: HealthRecord): { title: string; detail: string } {
  switch (r.kind) {
    case 'coffee': {
      const d = r.data as CoffeeData;
      return { title: d.name, detail: `${d.caffeineMg} mg${d.estimated ? ' (est.)' : ''}` };
    }
    case 'water':
      return { title: 'Water', detail: `${(r.data as WaterData).ml} ml` };
    case 'stool': {
      const d = r.data as StoolData;
      return { title: 'Stool', detail: d.bristol ? `Type ${d.bristol}${d.color ? `, ${d.color}` : ''}` : 'Tap to add details' };
    }
    case 'alcohol': {
      const d = r.data as AlcoholData;
      return { title: d.name, detail: `${d.grams} g alcohol` };
    }
    case 'nicotine': {
      const d = r.data as NicotineData;
      return { title: 'Nicotine', detail: `${d.count} × ${d.form}` };
    }
    case 'body': {
      const d = r.data as BodyData;
      return { title: 'Weight', detail: [d.kg != null && `${d.kg} kg`, d.fatPct != null && `${d.fatPct}% fat`].filter(Boolean).join(', ') };
    }
    case 'supplement':
      return { title: (r.data as SupplementData).name, detail: 'Taken' };
    case 'meal': {
      const d = r.data as MealData;
      return { title: `${d.meal[0].toUpperCase()}${d.meal.slice(1)}`, detail: [d.kcal != null && `${d.kcal} kcal`, d.items].filter(Boolean).join(', ') };
    }
    case 'lab': {
      const d = r.data as LabData;
      return { title: `Labs: ${d.lab}`, detail: `${d.markers.length} markers` };
    }
    case 'note':
      return { title: 'Note', detail: (r.data as NoteData).text };
    default:
      return { title: r.kind, detail: '' };
  }
}

const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

function NumField({ label, value, onChange, unit }: { label: string; value: number | null; onChange: (n: number | null) => void; unit?: string }) {
  return (
    <label className="block">
      <span className="label">
        {label}
        {unit && <span className="text-steel-dim"> ({unit})</span>}
      </span>
      <input className="input" inputMode="decimal" value={value ?? ''} onChange={(e) => onChange(numOrNull(e.target.value))} />
    </label>
  );
}

export function StoolFields({ d, set }: { d: StoolData; set: (d: StoolData) => void }) {
  return (
    <div className="space-y-4">
      <BristolPicker value={d.bristol} onChange={(bristol) => set({ ...d, bristol })} />
      <div>
        <span className="label">Color</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
          {COLORS.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={d.color === c}
              onClick={() => set({ ...d, color: c })}
              className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm ${d.color === c ? 'border-lume' : 'border-dial-rule'}`}
            >
              <span className="h-3 w-3 rounded-full" style={{ background: COLOR_SWATCH[c] }} />
              {c}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="label">Ease</span>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4].map((e) => (
            <Chip key={e} active={d.ease === e} onClick={() => set({ ...d, ease: e })}>
              {EASE[e]}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <YesNo label="Urgent" value={d.urgent} onChange={(urgent) => set({ ...d, urgent })} />
        <YesNo label="Felt complete" value={d.complete} onChange={(complete) => set({ ...d, complete })} />
        <YesNo label="Blood" value={d.blood} onChange={(blood) => set({ ...d, blood })} />
      </div>
      <NumField label="Duration" unit="min" value={d.durationMin} onChange={(durationMin) => set({ ...d, durationMin })} />
      {stoolNeedsDoctorNote(d) && (
        <p className="rounded-xl bg-warn/15 p-3 text-sm text-warn" data-testid="doctor-note">
          Blood, or black, red or pale stool can have harmless causes (food, iron), but see a doctor if it repeats or comes with pain.
        </p>
      )}
    </div>
  );
}

export function EditEntry({ rec, deviceId, onClose }: { rec: HealthRecord; deviceId: string; onClose: () => void }) {
  const [data, setData] = useState<any>(rec.data); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [at, setAt] = useState(rec.at);
  const { title } = describe(rec);

  async function save() {
    let next = data;
    if (rec.kind === 'coffee') next = { ...data, caffeineMg: Math.round(data.shots * data.mgPerShot) };
    if (rec.kind === 'alcohol') next = { ...data, grams: alcoholGrams(data.ml, data.abv) };
    await updateRecord(db, deviceId, rec, { data: next, at });
    scheduleSync();
    onClose();
  }
  async function remove() {
    await deleteRecord(db, deviceId, rec);
    scheduleSync();
    onClose();
  }

  const readOnly = rec.kind === 'lab';

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="space-y-4">
        {rec.kind === 'stool' && <StoolFields d={data} set={setData} />}
        {rec.kind === 'coffee' && (
          <div>
            <span className="label">Espresso shots{data.estimated && ' (estimated)'}</span>
            <Stepper label="shots" min={1} value={data.shots} onChange={(shots) => setData({ ...data, shots })} />
            <p className="mt-1 text-sm text-steel">{Math.round(data.shots * data.mgPerShot)} mg caffeine</p>
          </div>
        )}
        {rec.kind === 'water' && <NumField label="Amount" unit="ml" value={data.ml} onChange={(ml) => setData({ ...data, ml: ml ?? 0 })} />}
        {rec.kind === 'alcohol' && (
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Volume" unit="ml" value={data.ml} onChange={(ml) => setData({ ...data, ml: ml ?? 0 })} />
            <NumField label="Strength" unit="% ABV" value={data.abv} onChange={(abv) => setData({ ...data, abv: abv ?? 0 })} />
          </div>
        )}
        {rec.kind === 'nicotine' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              {(['cigarette', 'vape', 'pouch'] as NicotineForm[]).map((f) => (
                <Chip key={f} active={data.form === f} onClick={() => setData({ ...data, form: f })}>
                  {f}
                </Chip>
              ))}
            </div>
            <Stepper label="count" min={1} value={data.count} onChange={(count) => setData({ ...data, count })} />
          </div>
        )}
        {rec.kind === 'body' && (
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Weight" unit="kg" value={data.kg} onChange={(kg) => setData({ ...data, kg })} />
            <NumField label="Body fat" unit="%" value={data.fatPct} onChange={(fatPct) => setData({ ...data, fatPct })} />
          </div>
        )}
        {rec.kind === 'meal' && (
          <div className="space-y-3">
            <label className="block">
              <span className="label">Items</span>
              <textarea className="input" rows={2} value={data.items} onChange={(e) => setData({ ...data, items: e.target.value })} />
            </label>
            <div className="grid grid-cols-3 gap-3">
              <NumField label="kcal" value={data.kcal} onChange={(kcal) => setData({ ...data, kcal })} />
              <NumField label="Protein" unit="g" value={data.proteinG} onChange={(proteinG) => setData({ ...data, proteinG })} />
              <NumField label="Fiber" unit="g" value={data.fiberG} onChange={(fiberG) => setData({ ...data, fiberG })} />
              <NumField label="Carbs" unit="g" value={data.carbsG} onChange={(carbsG) => setData({ ...data, carbsG })} />
              <NumField label="Fat" unit="g" value={data.fatG} onChange={(fatG) => setData({ ...data, fatG })} />
            </div>
            <YesNo label="Oil-heavy" value={data.oilHeavy} onChange={(oilHeavy) => setData({ ...data, oilHeavy })} />
          </div>
        )}
        {rec.kind === 'lab' && (
          <table className="w-full text-sm">
            <tbody>
              {(data as LabData).markers.map((m) => (
                <tr key={m.marker} className="border-t border-dial-rule">
                  <td className="py-1.5">{m.marker}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {m.value} {m.unit}
                  </td>
                  <td className="py-1.5 pl-2 text-right text-xs text-steel-dim">
                    {m.refLow ?? ''}–{m.refHigh ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(rec.kind === 'note' || rec.kind === 'stool' || rec.kind === 'meal') && (
          <label className="block">
            <span className="label">{rec.kind === 'note' ? 'Note' : 'Note (optional)'}</span>
            <input
              className="input"
              value={rec.kind === 'note' ? data.text : data.note ?? ''}
              onChange={(e) => setData(rec.kind === 'note' ? { ...data, text: e.target.value } : { ...data, note: e.target.value })}
            />
          </label>
        )}
        {!readOnly && (
          <label className="block">
            <span className="label">Time</span>
            <input className="input" type="datetime-local" value={toInput(at)} onChange={(e) => setAt(fromInput(e.target.value))} />
          </label>
        )}
        <div className="flex gap-2 pt-2">
          {!readOnly && (
            <button className="btn flex-1" onClick={() => void save()}>
              Save
            </button>
          )}
          <button className="btn-ghost text-err" onClick={() => void remove()}>
            Delete
          </button>
        </div>
      </div>
    </Sheet>
  );
}
