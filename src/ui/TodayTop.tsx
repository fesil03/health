// Three ways to show "today" at the top of the Log screen. Chosen in Settings.
import type { CoffeeData, HealthRecord, MealData, SleepData, StoolData, SymptomData, WaterData } from '../lib/model';
import type { Presets } from '../lib/presets';
import { KIND_COLORS, Glyph, GlyphIcon } from './Glyphs';
import { clock, hm } from './format';

export type TopStyle = 'timeline' | 'totals' | 'summary';
export const TOP_STYLES: { id: TopStyle; name: string }[] = [
  { id: 'summary', name: 'Summary' },
  { id: 'timeline', name: 'Timeline' },
  { id: 'totals', name: 'Totals' }
];
export const DEFAULT_TOP: TopStyle = 'summary';

/** One-tap switch between the three views. */
export function TopSwitch({ value, onChange }: { value: TopStyle; onChange: (t: TopStyle) => void }) {
  return (
    <div className="mb-3 mt-3 flex justify-center">
      <div className="inline-flex rounded-full border border-dial-rule p-0.5" role="radiogroup" aria-label="View">
        {TOP_STYLES.map((t) => (
          <button
            key={t.id}
            role="radio"
            aria-checked={value === t.id}
            onClick={() => onChange(t.id)}
            className={`rounded-full px-3.5 py-1 text-sm ${value === t.id ? 'bg-lume font-semibold text-dial-deep' : 'text-steel'}`}
          >
            {t.name}
          </button>
        ))}
      </div>
    </div>
  );
}

interface Props {
  entries: HealthRecord[];
  sleep?: HealthRecord<SleepData>;
  presets: Presets;
  nowHours: number | null;
  day: string;
}

function useDay({ entries, sleep, presets }: Props) {
  const of = <D,>(...kinds: string[]) => entries.filter((e) => kinds.includes(e.kind)) as HealthRecord<D>[];
  const coffees = of<CoffeeData>('coffee');
  const meals = of<MealData>('meal');
  const stools = of<StoolData>('stool');
  const active = presets.supplements.filter((s) => s.active);
  const taken = new Set(of<{ supplementId: string }>('supplement').map((r) => r.data.supplementId));
  return {
    sleep,
    coffees,
    caffeine: coffees.reduce((s, r) => s + r.data.caffeineMg, 0),
    water: of<WaterData>('water').reduce((s, r) => s + r.data.ml, 0),
    target: presets.water.targetMl,
    meals,
    kcal: meals.reduce((s, r) => s + (r.data.kcal ?? 0), 0),
    stools,
    suppTaken: active.filter((s) => taken.has(s.id)).length,
    suppTotal: active.length,
    alcoholG: of<{ grams: number }>('alcohol').reduce((s, r) => s + r.data.grams, 0),
    nicotine: of<{ count: number }>('nicotine').reduce((s, r) => s + r.data.count, 0),
    symptoms: of<SymptomData>('symptom')
  };
}

// ---------- A. Timeline ----------

const hrs = (naive: string) => Number(naive.slice(11, 13)) + Number(naive.slice(14, 16)) / 60;
const ROWS: { lane: keyof typeof KIND_COLORS; label: string; kinds: string[] }[] = [
  { lane: 'sleep', label: 'Sleep', kinds: [] },
  { lane: 'coffee', label: 'Coffee', kinds: ['coffee'] },
  { lane: 'water', label: 'Water', kinds: ['water'] },
  { lane: 'meal', label: 'Meals', kinds: ['meal'] },
  { lane: 'stool', label: 'Stool', kinds: ['stool'] },
  { lane: 'supplement', label: 'Supps', kinds: ['supplement'] },
  { lane: 'drink', label: 'Drinks', kinds: ['alcohol', 'nicotine'] },
  { lane: 'symptom', label: 'Symptoms', kinds: ['symptom'] }
];

function Timeline(p: Props) {
  const d = useDay(p);
  const W = 360;
  const L = 62; // label column
  const R = 8;
  const rowH = 22;
  const top = 18;
  const x = (h: number) => L + (h / 24) * (W - L - R);
  const H = top + ROWS.length * rowH + 6;
  return (
    <div className="pb-2 pt-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Today as a 24-hour timeline" data-testid="top-timeline">
        {[0, 6, 12, 18, 24].map((h) => (
          <g key={h}>
            <line x1={x(h)} x2={x(h)} y1={top - 4} y2={H - 4} stroke="#2B3D5C" strokeWidth={1} />
            <text x={x(h)} y={10} textAnchor={h === 0 ? 'start' : h === 24 ? 'end' : 'middle'} className="cond" fontSize={11} fontWeight={600} fill="#A9B4C4">
              {String(h).padStart(2, '0')}:00
            </text>
          </g>
        ))}
        {ROWS.map((row, i) => {
          const y = top + i * rowH + rowH / 2;
          return (
            <g key={row.lane}>
              <text x={0} y={y + 4} fontSize={12} fill="#A9B4C4">
                {row.label}
              </text>
              <line x1={L} x2={W - R} y1={y} y2={y} stroke="#2B3D5C" strokeWidth={1} strokeDasharray="1 3" />
              {row.lane === 'sleep' && d.sleep && (
                <rect
                  x={x(d.sleep.at.slice(0, 10) < p.day ? 0 : hrs(d.sleep.at))}
                  y={y - 4}
                  width={Math.max(4, x(hrs(d.sleep.data.end)) - x(d.sleep.at.slice(0, 10) < p.day ? 0 : hrs(d.sleep.at)))}
                  height={8}
                  rx={4}
                  fill={KIND_COLORS.sleep}
                />
              )}
              {p.entries
                .filter((e) => row.kinds.includes(e.kind))
                .map((e) => (
                  <Glyph key={e.id} lane={row.lane} x={x(hrs(e.at))} y={y} />
                ))}
            </g>
          );
        })}
        {p.nowHours != null && (
          <g data-testid="now-line">
            <line x1={x(p.nowHours)} x2={x(p.nowHours)} y1={top - 6} y2={H - 4} stroke="#E8743F" strokeWidth={1.5} />
            <circle cx={x(p.nowHours)} cy={top - 6} r={2.5} fill="#E8743F" />
          </g>
        )}
      </svg>
      <p className="mt-2 text-sm text-steel">
        {d.sleep ? `Slept ${clock(d.sleep.at)} to ${clock(d.sleep.data.end)}, score ${d.sleep.data.score ?? 'n/a'}. ` : ''}
        {d.caffeine} mg caffeine, {d.water.toLocaleString()} of {d.target.toLocaleString()} ml water, {d.suppTaken} of {d.suppTotal} supplements.
      </p>
    </div>
  );
}

// ---------- B. Totals ----------

function Cell({ lane, label, value, sub, bar }: { lane: Parameters<typeof GlyphIcon>[0]['lane']; label: string; value: string; sub: string; bar?: number }) {
  return (
    <div className="px-3 py-3">
      <p className="flex items-center gap-1.5 text-sm text-steel">
        <GlyphIcon lane={lane} /> {label}
      </p>
      <p className="cond mt-0.5 text-2xl font-semibold text-ink">{value}</p>
      {bar != null ? (
        <div className="mt-1.5 h-1 rounded-full bg-dial-rule" aria-hidden="true">
          <div className="h-full rounded-full bg-cat-water" style={{ width: `${Math.min(100, bar * 100)}%` }} />
        </div>
      ) : null}
      <p className="mt-1 truncate text-xs text-steel">{sub}</p>
    </div>
  );
}

function Totals(p: Props) {
  const d = useDay(p);
  const lastStool = d.stools.at(-1)?.data;
  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-dial-rule border-y border-dial-rule [&>*:nth-child(-n+2)]:border-t-0" data-testid="top-totals">
      <Cell
        lane="sleep"
        label="Sleep"
        value={d.sleep ? hm(d.sleep.data.durationMin) : 'No data'}
        sub={d.sleep ? `Score ${d.sleep.data.score ?? 'n/a'}, woke ${clock(d.sleep.data.end)}` : 'Import from Samsung Health'}
      />
      <Cell lane="coffee" label="Caffeine" value={`${d.caffeine} mg`} sub={d.coffees.length ? `${d.coffees.length} drinks, last at ${clock(d.coffees.at(-1)!.at)}` : 'None yet'} />
      <Cell lane="water" label="Water" value={`${d.water.toLocaleString()} ml`} sub={`of ${d.target.toLocaleString()} ml`} bar={d.water / d.target} />
      <Cell lane="meal" label="Meals" value={String(d.meals.length)} sub={d.kcal ? `${d.kcal.toLocaleString()} kcal` : 'None logged'} />
      <Cell
        lane="stool"
        label="Stool"
        value={String(d.stools.length)}
        sub={!lastStool ? 'None yet' : lastStool.bristol ? `Last: type ${lastStool.bristol}` : 'Details missing'}
      />
      <Cell lane="supplement" label="Supplements" value={`${d.suppTaken} of ${d.suppTotal}`} sub={d.suppTaken === d.suppTotal ? 'All taken' : `${d.suppTotal - d.suppTaken} to go`} />
    </div>
  );
}

// ---------- C. Summary ----------

const words = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const count = (n: number, one: string, many: string) => `${n < 10 ? words[n] : n} ${n === 1 ? one : many}`;

function Summary(p: Props) {
  const d = useDay(p);
  const B = ({ children }: { children: React.ReactNode }) => <span className="font-semibold text-ink">{children}</span>;
  const lastStool = d.stools.at(-1)?.data;
  return (
    <div className="space-y-2 pb-3 pt-1 text-lg leading-relaxed text-steel" data-testid="top-summary">
      <p>
        {d.sleep ? (
          <>
            Slept <B>{hm(d.sleep.data.durationMin)}</B>, from {clock(d.sleep.at)} to {clock(d.sleep.data.end)}, score <B>{d.sleep.data.score ?? 'n/a'}</B>.
          </>
        ) : (
          <>No sleep data for this night yet.</>
        )}
      </p>
      <p>
        {d.coffees.length ? (
          <>
            {count(d.coffees.length, 'coffee', 'coffees')}, <B>{d.caffeine} mg</B>, {d.coffees.length > 1 ? 'the last ' : ''}at <B>{clock(d.coffees.at(-1)!.at)}</B>.{' '}
          </>
        ) : (
          <>No coffee yet. </>
        )}
        <B>{d.water.toLocaleString()}</B> of {d.target.toLocaleString()} ml water.
      </p>
      <p>
        {count(d.meals.length, 'meal', 'meals')}
        {d.kcal ? <>, about <B>{d.kcal.toLocaleString()} kcal</B></> : null}.{' '}
        {count(d.stools.length, 'stool', 'stools')}
        {lastStool ? (lastStool.bristol ? <>, last <B>type {lastStool.bristol}</B></> : <>, details still to add</>) : null}.{' '}
        <B>
          {d.suppTaken} of {d.suppTotal}
        </B>{' '}
        supplements taken.
        {d.alcoholG ? <> <B>{d.alcoholG} g</B> of alcohol.</> : null}
        {d.nicotine ? <> {count(d.nicotine, 'nicotine', 'nicotine')} logged.</> : null}
      </p>
      {d.symptoms.length > 0 && (
        <p data-testid="summary-symptoms">
          {d.symptoms.map((s, i) => (
            <span key={s.id}>
              {i > 0 && ', '}
              <B>{i === 0 ? s.data.name : s.data.name.toLowerCase()}</B> at {clock(s.at)}
              {s.data.severity ? ` (${['', 'mild', 'moderate', 'strong'][s.data.severity]})` : ''}
            </span>
          ))}
          .
        </p>
      )}
    </div>
  );
}

export function TodayTop(props: Props & { style: TopStyle }) {
  if (props.style === 'timeline') return <Timeline {...props} />;
  if (props.style === 'totals') return <Totals {...props} />;
  return <Summary {...props} />;
}
