import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../lib/db';
import {
  dayLog,
  deleteRecord,
  logAlcohol,
  logBody,
  logCoffee,
  logNicotine,
  logStool,
  logWater,
  setSupplementTaken,
  type Ctx
} from '../lib/log';
import type { BodyData, CoffeeData, HealthRecord, NicotineForm, StoolData, WaterData } from '../lib/model';
import { parsePaste, pasteToRecords, type PasteResult } from '../lib/paste';
import { loadPresets, type SupplementItem } from '../lib/presets';
import { scheduleSync } from '../lib/syncClient';
import { addDays, nowNaive, resolveLogTime, todayLocal, type LogWhen } from '../lib/time';
import { describe, EditEntry } from './EditEntry';
import { clock, shortDay } from './format';
import { Chip, Sheet, useDeviceId, useToast } from './kit';

function Card({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-semibold">{title}</h2>
        {aside && <span className="text-sm text-slate-400">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function BodySheet({ onSave, onClose, last }: { onSave: (kg: number | null, fat: number | null) => void; onClose: () => void; last?: BodyData }) {
  const [kg, setKg] = useState(last?.kg != null ? String(last.kg) : '');
  const [fat, setFat] = useState(last?.fatPct != null ? String(last.fatPct) : '');
  const n = (s: string) => (s.trim() ? Number(s.replace(',', '.')) : null);
  return (
    <Sheet title="Weight and body fat" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">Weight (kg)</span>
          <input className="input" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} autoFocus />
        </label>
        <label>
          <span className="label">Body fat (%)</span>
          <input className="input" inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} />
        </label>
      </div>
      <button className="btn mt-4 w-full" disabled={!kg && !fat} onClick={() => onSave(n(kg), n(fat))}>
        Save
      </button>
    </Sheet>
  );
}

function PasteSheet({ onClose, deviceId, nowAt }: { onClose: () => void; deviceId: string; nowAt: () => string }) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<PasteResult | null>(null);
  const toast = useToast();
  const read = (t: string) => {
    setText(t);
    setParsed(t.trim() ? parsePaste(t) : null);
  };
  async function fromClipboard() {
    try {
      read(await navigator.clipboard.readText());
    } catch {
      toast({ text: 'Clipboard not available here: long-press the box and paste.' });
    }
  }
  async function save() {
    if (!parsed) return;
    const recs = pasteToRecords(parsed, deviceId, nowAt());
    await db.saveLocal(recs);
    scheduleSync();
    toast({ text: `Saved ${parsed.meals.length ? `${parsed.meals.length} meal(s)` : ''}${parsed.meals.length && parsed.labs.length ? ' and ' : ''}${parsed.labs.length ? `${parsed.labs.length} lab result set(s)` : ''}` });
    onClose();
  }
  const ok = parsed && (parsed.meals.length || parsed.labs.length);
  return (
    <Sheet title="Paste from Claude" onClose={onClose}>
      <p className="mb-2 text-sm text-slate-400">Paste a #meal or #labs block from the chat.</p>
      <textarea
        data-testid="paste-box"
        className="input font-mono text-xs"
        rows={8}
        value={text}
        onChange={(e) => read(e.target.value)}
        placeholder={'#meal v1\ntime: …\nitems: …'}
      />
      <div className="mt-2 flex gap-2">
        <button className="btn-ghost" onClick={() => void fromClipboard()}>
          Paste from clipboard
        </button>
      </div>
      {parsed && (
        <div className="mt-3 space-y-1 text-sm" data-testid="paste-preview">
          {parsed.meals.map((m, i) => (
            <p key={i}>
              <span className="text-slate-400">{m.at ? `${m.at.slice(5, 10)} ${clock(m.at)}` : 'now'} · </span>
              {m.data.meal}: {m.data.items} {m.data.kcal != null && <span className="text-slate-400">({m.data.kcal} kcal)</span>}
            </p>
          ))}
          {parsed.labs.map((l, i) => (
            <p key={i}>
              Labs {l.date}: {l.data.markers.length} markers ({l.data.lab})
            </p>
          ))}
          {parsed.errors.map((e, i) => (
            <p key={i} className="text-rose-300">
              {e}
            </p>
          ))}
        </div>
      )}
      <button className="btn mt-4 w-full" disabled={!ok} onClick={() => void save()}>
        Save
      </button>
    </Sheet>
  );
}

const AGO = [15, 30, 60, 120];

function TimeRow({ when, setWhen }: { when: LogWhen; setWhen: (w: LogWhen) => void }) {
  const [picking, setPicking] = useState(false);
  const pickVal = when.kind === 'at' ? when.hhmm : nowNaive().slice(11, 16);
  return (
    <section className="card py-3" aria-label="When">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm text-slate-400">When</span>
        <Chip active={when.kind === 'now'} onClick={() => { setPicking(false); setWhen({ kind: 'now' }); }}>
          Now
        </Chip>
        {AGO.map((m) => (
          <Chip key={m} active={when.kind === 'ago' && when.min === m} onClick={() => { setPicking(false); setWhen({ kind: 'ago', min: m }); }}>
            {m < 60 ? `${m} min ago` : `${m / 60} h ago`}
          </Chip>
        ))}
        <Chip active={when.kind === 'at'} onClick={() => { setPicking(true); setWhen({ kind: 'at', hhmm: pickVal }); }}>
          {when.kind === 'at' ? `At ${when.hhmm}` : 'Pick time'}
        </Chip>
      </div>
      {picking && when.kind === 'at' && (
        <input
          aria-label="Log time"
          type="time"
          className="input mt-2"
          value={when.hhmm}
          onChange={(e) => e.target.value && setWhen({ kind: 'at', hhmm: e.target.value })}
        />
      )}
    </section>
  );
}

export function Log() {
  const deviceId = useDeviceId();
  const toast = useToast();
  const today = todayLocal();
  const [day, setDay] = useState(today);
  const [editing, setEditing] = useState<HealthRecord | null>(null);
  const [sheet, setSheet] = useState<'body' | 'paste' | null>(null);
  const [when, setWhen] = useState<LogWhen>({ kind: 'now' });
  const presets = useLiveQuery(() => loadPresets(db));
  const entries = useLiveQuery(() => dayLog(db, day), [day]) ?? [];
  const lastBody = useLiveQuery(async () => {
    const all = (await db.records.where('kind').equals('body').toArray()).filter((r) => !r.deleted);
    return all.sort((a, b) => b.at.localeCompare(a.at))[0];
  });

  /** Time for the next quick log: the chosen "when", on the day being viewed. */
  const nowAt = () => resolveLogTime(day, nowNaive(), when);
  const ctx = (): Ctx => ({ db, deviceId, at: nowAt() });

  async function logged(rec: HealthRecord, text: string, details = false) {
    scheduleSync();
    const stamped = when.kind !== 'now' || day !== today;
    setWhen({ kind: 'now' }); // back to "now" so the next log isn't stamped in the past by accident
    toast({
      text: stamped ? `${text} · ${clock(rec.at)}` : text,
      actions: [
        ...(details ? [{ label: 'Details', run: () => setEditing(rec) }] : []),
        {
          label: 'Undo',
          run: () => {
            void deleteRecord(db, deviceId, rec).then(() => scheduleSync());
          }
        }
      ]
    });
  }

  if (!presets || !deviceId) return null;

  const of = <D,>(kind: string) => entries.filter((e) => e.kind === kind) as HealthRecord<D>[];
  const waterMl = of<WaterData>('water').reduce((s, r) => s + r.data.ml, 0);
  const coffees = of<CoffeeData>('coffee');
  const caffeine = coffees.reduce((s, r) => s + r.data.caffeineMg, 0);
  const stools = of<StoolData>('stool');
  const taken = new Set(of<{ supplementId: string }>('supplement').map((r) => r.data.supplementId));
  const target = presets.water.targetMl;
  const pct = Math.min(100, Math.round((waterMl / target) * 100));
  // Pace: where you'd be on an even 08:00–22:00 day
  const hour = Number(nowNaive().slice(11, 13)) + Number(nowNaive().slice(14, 16)) / 60;
  const pace = day === today ? Math.max(0, Math.min(1, (hour - 8) / 14)) : 1;
  const active = presets.supplements.filter((s) => s.active);

  return (
    <>
      <div className="flex items-center justify-between">
        <button className="btn-ghost px-3" aria-label="Previous day" onClick={() => setDay(addDays(day, -1))}>
          ‹
        </button>
        <span className="font-semibold" data-testid="log-day">
          {day === today ? 'Today' : shortDay(day)}
        </span>
        <button className="btn-ghost px-3" aria-label="Next day" disabled={day >= today} onClick={() => setDay(addDays(day, 1))}>
          ›
        </button>
      </div>

      <TimeRow when={when} setWhen={setWhen} />

      <Card title="Water" aside={<span data-testid="water-total">{`${waterMl.toLocaleString()} / ${target.toLocaleString()} ml`}</span>}>
        <div className="relative mb-3 h-3 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-sky-400" style={{ width: `${pct}%` }} />
          {day === today && <div className="absolute top-0 h-full w-0.5 bg-slate-200" style={{ left: `${pace * 100}%` }} title="Pace" />}
        </div>
        <div className="flex gap-2">
          {[
            ['Glass', presets.water.glassMl],
            ['Bottle', presets.water.bottleMl]
          ].map(([label, ml]) => (
            <Chip key={label} onClick={async () => logged(await logWater(ctx(), ml as number), `+${ml} ml water`)}>
              + {label} {ml} ml
            </Chip>
          ))}
        </div>
      </Card>

      <Card
        title="Coffee"
        aside={coffees.length ? `${caffeine} mg · last ${clock(coffees.at(-1)!.at)}` : 'none yet'}
      >
        <div className="flex flex-wrap gap-2">
          {presets.coffee.map((p) => (
            <Chip
              key={p.id}
              onClick={async () => {
                const r = await logCoffee(ctx(), p);
                logged(r, `${p.name} · ${(r.data as CoffeeData).caffeineMg} mg`, true);
              }}
            >
              {p.name}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Different number of shots? Tap Details after logging.</p>
      </Card>

      <Card title="Stool" aside={stools.length ? `${stools.length} today` : undefined}>
        <button
          className="btn w-full"
          onClick={async () => {
            const r = await logStool(ctx());
            logged(r, `Stool logged at ${clock(r.at)}`, true);
          }}
        >
          Log stool now
        </button>
        {stools.length > 0 && (
          <ul className="mt-3 space-y-1" data-testid="stool-list">
            {stools.map((r) => (
              <li key={r.id}>
                <button className="flex w-full items-center justify-between rounded-xl bg-slate-800/60 px-3 py-2 text-sm" onClick={() => setEditing(r)}>
                  <span className="tabular-nums text-slate-300">{clock(r.at)}</span>
                  <span className={r.data.bristol ? 'text-slate-300' : 'text-amber-300'}>
                    {r.data.bristol ? `Type ${r.data.bristol}${r.data.color ? `, ${r.data.color}` : ''} · edit` : 'Add details →'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Supplements" aside={`${active.filter((s) => taken.has(s.id)).length} / ${active.length}`}>
        {(['morning', 'night'] as const).map((when) => (
          <div key={when} className="mb-2">
            <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">{when}</p>
            <div className="flex flex-wrap gap-2">
              {active
                .filter((s) => s.when === when)
                .map((s: SupplementItem) => (
                  <Chip
                    key={s.id}
                    active={taken.has(s.id)}
                    label={`${s.name}${taken.has(s.id) ? ' (taken)' : ''}`}
                    onClick={async () => {
                      await setSupplementTaken(ctx(), s, !taken.has(s.id));
                      setWhen({ kind: 'now' });
                      scheduleSync();
                    }}
                  >
                    {taken.has(s.id) ? '✓ ' : ''}
                    {s.name}
                  </Chip>
                ))}
            </div>
          </div>
        ))}
      </Card>

      <Card title="Alcohol and nicotine">
        <div className="flex flex-wrap gap-2">
          {presets.alcohol.map((p) => (
            <Chip key={p.id} onClick={async () => logged(await logAlcohol(ctx(), p), `${p.name} logged`)}>
              {p.name}
            </Chip>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {(['cigarette', 'vape', 'pouch'] as NicotineForm[]).map((f) => (
            <Chip key={f} onClick={async () => logged(await logNicotine(ctx(), f), `1 ${f} logged`)}>
              {f[0].toUpperCase() + f.slice(1)}
            </Chip>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <button className="card text-left" onClick={() => setSheet('body')}>
          <p className="font-semibold">Weight</p>
          <p className="text-sm text-slate-400">
            {lastBody ? describe(lastBody).detail : 'Log weight and fat %'}
          </p>
        </button>
        <button className="card text-left" onClick={() => setSheet('paste')}>
          <p className="font-semibold">Meal / labs</p>
          <p className="text-sm text-slate-400">Paste from Claude</p>
        </button>
      </div>

      <section className="card">
        <h2 className="h2">{day === today ? "Today's log" : 'Log'}</h2>
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing logged yet.</p>
        ) : (
          <ul data-testid="day-log">
            {entries.map((r) => {
              const d = describe(r);
              return (
                <li key={r.id} className="border-t border-slate-800 first:border-0">
                  <button className="flex w-full items-baseline gap-3 py-2 text-left" onClick={() => setEditing(r)}>
                    <span className="w-12 text-sm tabular-nums text-slate-400">{clock(r.at)}</span>
                    <span className="flex-1">
                      {d.title}
                      <span className="block truncate text-sm text-slate-400">{d.detail}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {editing && <EditEntry rec={editing} deviceId={deviceId} onClose={() => setEditing(null)} />}
      {sheet === 'body' && (
        <BodySheet
          last={lastBody?.data as BodyData | undefined}
          onClose={() => setSheet(null)}
          onSave={async (kg, fat) => {
            setSheet(null);
            logged(await logBody(ctx(), kg, fat), 'Weight logged');
          }}
        />
      )}
      {sheet === 'paste' && <PasteSheet onClose={() => setSheet(null)} deviceId={deviceId} nowAt={nowAt} />}
    </>
  );
}
