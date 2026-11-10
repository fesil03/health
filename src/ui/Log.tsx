import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
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
  logSupplement,
  logSymptom,
  supplementDoses,
  type Ctx
} from '../lib/log';
import type { BodyData, CoffeeData, HealthRecord, NicotineForm, SleepData, StoolData, SymptomData, WaterData } from '../lib/model';
import { describeCounts, parsePaste, planPaste, type PastePlanItem, type PasteResult } from '../lib/paste';
import { loadPresets, type SupplementItem } from '../lib/presets';
import { scheduleSync } from '../lib/syncClient';
import { addDays, nowNaive, resolveLogTime, todayLocal, type LogWhen } from '../lib/time';
import { GlyphIcon } from './Glyphs';
import { CheckinCards } from './CheckinCard';
import { DEFAULT_TOP, TodayTop, TopSwitch, type TopStyle } from './TodayTop';
import { describe, EditEntry } from './EditEntry';
import { clock, shortDay } from './format';
import { Chip, Sheet, useDeviceId, useToast } from './kit';

const LANE_OF: Record<string, Parameters<typeof GlyphIcon>[0]['lane'] | undefined> = {
  coffee: 'coffee',
  water: 'water',
  meal: 'meal',
  stool: 'stool',
  supplement: 'supplement',
  alcohol: 'drink',
  nicotine: 'drink',
  symptom: 'symptom'
};

const whenLabel = (w: LogWhen) =>
  w.kind === 'now' ? 'Now' : w.kind === 'at' ? `At ${w.hhmm}` : w.min < 60 ? `${w.min} min ago` : `${w.min / 60} h ago`;

const AGO = [15, 30, 60, 120];

/** Now / minutes ago / pick a time. */
function TimeChoices({ when, setWhen }: { when: LogWhen; setWhen: (w: LogWhen) => void }) {
  return (
    <div className="mb-3 rounded-2xl bg-dial-deep p-2.5">
      <div className="flex flex-wrap gap-2">
        <Chip active={when.kind === 'now'} onClick={() => setWhen({ kind: 'now' })}>
          Now
        </Chip>
        {AGO.map((m) => (
          <Chip key={m} active={when.kind === 'ago' && when.min === m} onClick={() => setWhen({ kind: 'ago', min: m })}>
            {whenLabel({ kind: 'ago', min: m })}
          </Chip>
        ))}
        <Chip active={when.kind === 'at'} onClick={() => setWhen({ kind: 'at', hhmm: when.kind === 'at' ? when.hhmm : nowNaive().slice(11, 16) })}>
          Pick time
        </Chip>
      </div>
      {when.kind === 'at' && (
        <input
          aria-label="Log time"
          type="time"
          className="input mt-2"
          value={when.hhmm}
          onChange={(e) => e.target.value && setWhen({ kind: 'at', hhmm: e.target.value })}
        />
      )}
    </div>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4.6V8l2.4 1.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function Section({
  title,
  lane,
  aside,
  when,
  setWhen,
  children
}: {
  title: string;
  lane?: Parameters<typeof GlyphIcon>[0]['lane'];
  aside?: React.ReactNode;
  when?: LogWhen;
  setWhen?: (w: LogWhen) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Close the choices once the section goes back to "now" (after logging)
  useEffect(() => {
    if (when?.kind === 'now') setOpen(false);
  }, [when]);
  return (
    <section className="section" aria-label={title}>
      <div className="mb-3 flex items-center gap-2">
        {lane && <GlyphIcon lane={lane} />}
        <h2 className="title">{title}</h2>
        {aside && <span className="meta ml-1 truncate">{aside}</span>}
        <span className="flex-1" />
        {when && setWhen && (
          <button
            aria-label={`${title} time: ${whenLabel(when)}`}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
              when.kind === 'now' ? 'border-dial-rule text-steel' : 'border-lume bg-lume/15 text-lume'
            }`}
          >
            <ClockIcon />
            {whenLabel(when)}
          </button>
        )}
      </div>
      {open && when && setWhen && <TimeChoices when={when} setWhen={setWhen} />}
      {children}
    </section>
  );
}

function BodySheet({ onSave, onClose, last }: { onSave: (kg: number | null, fat: number | null, when: LogWhen) => void; onClose: () => void; last?: BodyData }) {
  const [when, setWhen] = useState<LogWhen>({ kind: 'now' });
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
      <p className="label mt-4">When</p>
      <TimeChoices when={when} setWhen={setWhen} />
      <button className="btn w-full" disabled={!kg && !fat} onClick={() => onSave(n(kg), n(fat), when)}>
        Save
      </button>
    </Sheet>
  );
}

function PasteSheet({ onClose, deviceId, nowAt, today }: { onClose: () => void; deviceId: string; nowAt: () => string; today: string }) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<PasteResult | null>(null);
  const [plan, setPlan] = useState<PastePlanItem[]>([]);
  const toast = useToast();
  const read = async (t: string) => {
    setText(t);
    const p = t.trim() ? parsePaste(t) : null;
    setParsed(p);
    setPlan(p ? await planPaste(db, p, deviceId, nowAt()) : []);
  };
  async function fromClipboard() {
    try {
      await read(await navigator.clipboard.readText());
    } catch {
      toast({ text: 'Clipboard not available here. Long-press the box and choose Paste.' });
    }
  }
  const fresh = plan.filter((i) => !i.exists);
  const freshMeals = fresh.filter((i) => i.rec.kind === 'meal').length;
  const freshLabs = fresh.filter((i) => i.rec.kind === 'lab').length;
  async function save() {
    await db.saveLocal(fresh.map((i) => i.rec));
    scheduleSync();
    toast({ text: `Saved ${describeCounts(freshMeals, freshLabs)}` });
    onClose();
  }
  const dayLabel = (d: string) => (d === today ? 'Today' : d === addDays(today, -1) ? 'Yesterday' : shortDay(d));
  return (
    <Sheet title="Paste from Claude" onClose={onClose}>
      <p className="mb-2 text-sm text-steel">
        Paste one or more #meal or #labs blocks. Each meal keeps its own date and time, and meals already in the app are skipped.
      </p>
      <textarea
        data-testid="paste-box"
        className="input font-mono text-xs"
        rows={7}
        value={text}
        onChange={(e) => void read(e.target.value)}
        placeholder={'#meal v1\ntime: …\nitems: …'}
      />
      <div className="mt-2 flex gap-2">
        <button className="btn-ghost" onClick={() => void fromClipboard()}>
          Paste from clipboard
        </button>
      </div>
      {parsed && (
        <ul className="mt-3 divide-y divide-dial-rule text-sm" data-testid="paste-preview">
          {plan.map(({ rec, exists }) => {
            const m = rec.kind === 'meal' ? (rec.data as PasteResult['meals'][number]['data']) : null;
            return (
              <li key={rec.id} className={`flex items-baseline gap-3 py-2 ${exists ? 'opacity-50' : ''}`}>
                <span className="w-20 shrink-0 text-steel">
                  <span className="block text-xs">{dayLabel(rec.day)}</span>
                  <span className="cond font-semibold text-ink">{clock(rec.at)}</span>
                </span>
                <span className="min-w-0 flex-1">
                  {m ? (
                    <>
                      {m.meal[0].toUpperCase() + m.meal.slice(1)}: {m.items}
                      {m.kcal != null && <span className="text-steel">, {m.kcal} kcal</span>}
                    </>
                  ) : (
                    <>Labs: {(rec.data as { markers: unknown[] }).markers.length} markers</>
                  )}
                  {exists && <span className="block text-xs text-steel">Already logged</span>}
                </span>
              </li>
            );
          })}
          {parsed.errors.map((e, i) => (
            <li key={i} className="py-2 text-err">
              {e}
            </li>
          ))}
        </ul>
      )}
      <button className="btn mt-4 w-full" disabled={!fresh.length} onClick={() => void save()}>
        {!parsed || !plan.length ? 'Save' : fresh.length ? `Save ${describeCounts(freshMeals, freshLabs).replace(/^(\d+) /, '$1 new ')}` : 'Nothing new to save'}
      </button>
    </Sheet>
  );
}

export function Log() {
  const deviceId = useDeviceId();
  const toast = useToast();
  const today = todayLocal();
  const [day, setDay] = useState(today);
  const [editing, setEditing] = useState<HealthRecord | null>(null);
  const [sheet, setSheet] = useState<'body' | 'paste' | null>(null);
  type CardKey = 'water' | 'coffee' | 'stool' | 'supplements' | 'symptoms' | 'drinks';
  const [whens, setWhens] = useState<Record<CardKey, LogWhen>>({
    water: { kind: 'now' },
    coffee: { kind: 'now' },
    stool: { kind: 'now' },
    supplements: { kind: 'now' },
    symptoms: { kind: 'now' },
    drinks: { kind: 'now' }
  });
  const setWhenFor = (k: CardKey) => (w: LogWhen) => setWhens((all) => ({ ...all, [k]: w }));
  const timeProps = (k: CardKey) => ({ when: whens[k], setWhen: setWhenFor(k) });
  const presets = useLiveQuery(() => loadPresets(db));
  const savedTop = useLiveQuery(() => db.getSetting<TopStyle>('topStyle', DEFAULT_TOP));
  const urlTop = new URLSearchParams(location.search).get('top') as TopStyle | null; // for previews
  const topStyle: TopStyle = urlTop ?? savedTop ?? DEFAULT_TOP;
  const entries = useLiveQuery(() => dayLog(db, day), [day]) ?? [];
  const sleep = useLiveQuery(async () => {
    const nights = (await db.records.where('[kind+day]').equals(['sleep', day]).toArray()).filter((r) => !r.deleted) as HealthRecord<SleepData>[];
    return nights.sort((a, b) => (b.data.durationMin ?? 0) - (a.data.durationMin ?? 0))[0];
  }, [day]);
  const lastBody = useLiveQuery(async () => {
    const all = (await db.records.where('kind').equals('body').toArray()).filter((r) => !r.deleted);
    return all.sort((a, b) => b.at.localeCompare(a.at))[0];
  });

  /** Time for a log from card `k`: its chosen "when", on the day being viewed. */
  const nowAt = (w: LogWhen = { kind: 'now' }) => resolveLogTime(day, nowNaive(), w);
  const ctx = (k?: CardKey, w?: LogWhen): Ctx => ({ db, deviceId, at: nowAt(w ?? (k ? whens[k] : undefined)) });

  async function logged(rec: HealthRecord, text: string, details = false, k?: CardKey) {
    scheduleSync();
    const stamped = (k && whens[k].kind !== 'now') || day !== today;
    if (k) setWhenFor(k)({ kind: 'now' }); // back to "now" so the next log isn't stamped in the past by accident
    toast({
      text: stamped ? `${text} at ${clock(rec.at)}` : text,
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
  const stools = of<StoolData>('stool');
  const symptoms = of<SymptomData>('symptom');
  const doses = supplementDoses(entries);
  const target = presets.water.targetMl;
  const pct = Math.min(100, Math.round((waterMl / target) * 100));
  // Pace: where you'd be on an even 08:00–22:00 day
  const hour = Number(nowNaive().slice(11, 13)) + Number(nowNaive().slice(14, 16)) / 60;
  const pace = day === today ? Math.max(0, Math.min(1, (hour - 8) / 14)) : 1;
  const active = presets.supplements.filter((s) => s.active);

  const nowH = day === today ? hour : null;
  const longDay = new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      <div className="flex items-center justify-between pb-1">
        <button className="h-10 w-10 rounded-full border border-dial-rule text-lg text-steel disabled:opacity-30" aria-label="Previous day" onClick={() => setDay(addDays(day, -1))}>
          ‹
        </button>
        <div className="text-center">
          <p className="title text-xl" data-testid="log-day">
            {day === today ? 'Today' : shortDay(day)}
          </p>
          <p className="meta">{longDay}</p>
        </div>
        <button className="h-10 w-10 rounded-full border border-dial-rule text-lg text-steel disabled:opacity-30" aria-label="Next day" disabled={day >= today} onClick={() => setDay(addDays(day, 1))}>
          ›
        </button>
      </div>

      {day === today && <CheckinCards today={today} hour={Math.floor(hour)} deviceId={deviceId} />}

      <TopSwitch value={topStyle} onChange={(t) => void db.setSetting('topStyle', t)} />
      <TodayTop style={topStyle} entries={entries} sleep={sleep} presets={presets} nowHours={nowH} day={day} />

      <Section title="Water" lane="water" {...timeProps('water')} aside={<span data-testid="water-total">{`${waterMl.toLocaleString()} / ${target.toLocaleString()} ml`}</span>}>
        <div className="relative mb-4 h-1.5 rounded-full bg-dial-rule">
          <div className="h-full rounded-full bg-cat-water" style={{ width: `${pct}%` }} />
          {day === today && <div className="absolute -top-1 h-3.5 w-0.5 rounded bg-lume" style={{ left: `${pace * 100}%` }} title="Where you'd be on an even day" />}
        </div>
        <div className="flex gap-2">
          {[
            ['Glass', presets.water.glassMl],
            ['Bottle', presets.water.bottleMl]
          ].map(([label, ml]) => (
            <Chip key={label} onClick={async () => logged(await logWater(ctx('water'), ml as number), `Water +${ml} ml`, false, 'water')}>
              + {label} {ml} ml
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Coffee" lane="coffee" {...timeProps('coffee')} aside={coffees.length ? `last at ${clock(coffees.at(-1)!.at)}` : undefined}>
        <div className="flex flex-wrap gap-2">
          {presets.coffee.map((p) => (
            <Chip
              key={p.id}
              onClick={async () => {
                const r = await logCoffee(ctx('coffee'), p);
                logged(r, `${p.name}, ${(r.data as CoffeeData).caffeineMg} mg`, true, 'coffee');
              }}
            >
              {p.name}
            </Chip>
          ))}
        </div>
        <p className="mt-2.5 text-xs text-steel-dim">A different number of shots? Tap Details after logging.</p>
      </Section>

      <Section title="Stool" lane="stool" {...timeProps('stool')} aside={stools.length ? `${stools.length} today` : undefined}>
        <button
          className="btn w-full"
          onClick={async () => {
            const r = await logStool(ctx('stool'));
            logged(r, `Stool logged at ${clock(r.at)}`, true, 'stool');
          }}
        >
          Log stool now
        </button>
        {stools.length > 0 && (
          <ul className="mt-3 divide-y divide-dial-rule" data-testid="stool-list">
            {stools.map((r) => (
              <li key={r.id}>
                <button className="flex w-full items-center justify-between py-2.5 text-sm" onClick={() => setEditing(r)}>
                  <span className="cond font-semibold text-steel">{clock(r.at)}</span>
                  <span className={r.data.bristol ? 'text-ink' : 'font-semibold text-warn'}>
                    {r.data.bristol ? `Type ${r.data.bristol}${r.data.color ? `, ${r.data.color}` : ''}` : 'Add details'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Supplements" lane="supplement" {...timeProps('supplements')} aside={`${active.filter((s) => doses.has(s.id)).length} of ${active.length}`}>
        {(['morning', 'night'] as const).map((when) => (
          <div key={when} className="mb-3 last:mb-0">
            <p className="mb-1.5 text-xs text-steel-dim">{when === 'morning' ? 'Morning' : 'Night'}</p>
            <div className="flex flex-wrap gap-2">
              {active
                .filter((s) => s.when === when)
                .map((s: SupplementItem) => {
                  const n = doses.get(s.id) ?? 0;
                  return (
                    <Chip
                      key={s.id}
                      active={n > 0}
                      label={`${s.name}${n === 1 ? ' (taken)' : n > 1 ? ` (taken ${n} times)` : ''}`}
                      onClick={async () =>
                        logged(await logSupplement(ctx('supplements'), s), n ? `${s.name}: dose ${n + 1} logged` : `${s.name} logged`, false, 'supplements')
                      }
                    >
                      {n === 1 && '✓ '}
                      {s.name}
                      {n > 1 && <span className="cond ml-1.5 font-bold">×{n}</span>}
                    </Chip>
                  );
                })}
            </div>
          </div>
        ))}
        <p className="meta">Tap again for another dose. To remove one, tap it in the day log below.</p>
      </Section>

      <Section title="Symptoms" lane="symptom" {...timeProps('symptoms')} aside={symptoms.length ? `${symptoms.length} today` : undefined}>
        <div className="flex flex-wrap gap-2">
          {presets.symptoms.map((s) => (
            <Chip key={s.id} onClick={async () => logged(await logSymptom(ctx('symptoms'), s), `${s.name} logged`, true, 'symptoms')}>
              {s.name}
            </Chip>
          ))}
        </div>
        <p className="mt-2.5 text-xs text-steel-dim">Tap Details after logging to add how strong it was and a note.</p>
      </Section>

      <Section title="Alcohol and nicotine" lane="drink" {...timeProps('drinks')}>
        <div className="flex flex-wrap gap-2">
          {presets.alcohol.map((p) => (
            <Chip key={p.id} onClick={async () => logged(await logAlcohol(ctx('drinks'), p), `${p.name} logged`, false, 'drinks')}>
              {p.name}
            </Chip>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {(['cigarette', 'vape', 'pouch'] as NicotineForm[]).map((f) => (
            <Chip key={f} onClick={async () => logged(await logNicotine(ctx('drinks'), f), `1 ${f} logged`, false, 'drinks')}>
              {f[0].toUpperCase() + f.slice(1)}
            </Chip>
          ))}
        </div>
      </Section>

      <div className="section grid grid-cols-2 gap-3">
        <button className="rounded-2xl border border-dial-rule p-3.5 text-left active:bg-dial-raised" onClick={() => setSheet('body')}>
          <p className="title text-base">Weight</p>
          <p className="meta">{lastBody ? describe(lastBody).detail : 'Weight and body fat'}</p>
        </button>
        <button className="rounded-2xl border border-dial-rule p-3.5 text-left active:bg-dial-raised" onClick={() => setSheet('paste')}>
          <p className="title flex items-center gap-2 text-base">
            <GlyphIcon lane="meal" /> Meal / labs
          </p>
          <p className="meta">Paste one or more from Claude</p>
        </button>
      </div>

      <section className="section" aria-label="Log for the day">
        <h2 className="h2">{day === today ? "Today's log" : 'Log'}</h2>
        {entries.length === 0 ? (
          <p className="meta">Nothing logged yet. Tap a drink, the stool button or a supplement above.</p>
        ) : (
          <ul data-testid="day-log" className="divide-y divide-dial-rule">
            {entries.map((r) => {
              const d = describe(r);
              const lane = LANE_OF[r.kind];
              return (
                <li key={r.id}>
                  <button className="flex w-full items-baseline gap-3 py-2.5 text-left" onClick={() => setEditing(r)}>
                    <span className="cond w-12 font-semibold text-steel">{clock(r.at)}</span>
                    <span className="flex w-4 justify-center self-center">{lane ? <GlyphIcon lane={lane} /> : <span className="h-1.5 w-1.5 rounded-full bg-steel-dim" />}</span>
                    <span className="min-w-0 flex-1">
                      {d.title}
                      <span className="block truncate text-sm text-steel">{d.detail}</span>
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
          onSave={async (kg, fat, w) => {
            setSheet(null);
            logged(await logBody(ctx(undefined, w), kg, fat), w.kind === 'now' ? 'Weight logged' : `Weight logged at ${clock(nowAt(w))}`);
          }}
        />
      )}
      {sheet === 'paste' && <PasteSheet onClose={() => setSheet(null)} deviceId={deviceId} nowAt={() => nowAt()} today={today} />}
    </>
  );
}
