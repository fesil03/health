// "Copy for Claude": a short, readable summary of a few days, to paste into a chat.
// Plain text, local times, one block per day. Nothing leaves the device unless you paste it.
import type { HealthDB } from './db';
import type {
  AlcoholData,
  BodyData,
  CoffeeData,
  EnergyData,
  ExerciseData,
  HealthRecord,
  HourlyData,
  LabData,
  MealData,
  NicotineData,
  NoteData,
  SleepData,
  SleepStageData,
  Spo2Data,
  StepsData,
  StoolData,
  SupplementData,
  SymptomData,
  WaterData
} from './model';
import type { Presets } from './presets';
import { addDays, minutesBetween } from './time';

const hhmm = (naive: string) => naive.slice(11, 16);
const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`;
const SEVERITY = ['', 'mild', 'moderate', 'strong'];
const EASE = ['', 'easy', 'normal', 'some straining', 'hard straining'];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Mon 9 Nov 2026", spelled out by hand so it reads the same in every browser. */
function dayTitle(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[wd]} ${d} ${MONTHS[m - 1]} ${y}`;
}

function stoolLine(d: StoolData): string {
  if (!d.bristol) return 'Stool (no details)';
  const bits = [`Bristol type ${d.bristol}`, d.color, d.ease ? EASE[d.ease] : null];
  if (d.urgent) bits.push('urgent');
  if (d.complete === false) bits.push('felt incomplete');
  if (d.blood) bits.push('blood seen');
  if (d.durationMin) bits.push(`${d.durationMin} min`);
  if (d.note) bits.push(`note: ${d.note}`);
  return `Stool: ${bits.filter(Boolean).join(', ')}`;
}

function mealLine(d: MealData): string {
  const macros = [
    d.kcal != null && `~${d.kcal} kcal`,
    d.proteinG != null && `P ${d.proteinG} g`,
    d.carbsG != null && `C ${d.carbsG} g`,
    d.fatG != null && `F ${d.fatG} g`,
    d.fiberG != null && `fibre ${d.fiberG} g`,
    d.oilHeavy && 'oil-heavy'
  ].filter(Boolean);
  return `Meal (${d.meal}): ${d.items}${macros.length ? `; ${macros.join(', ')}` : ''}${d.note ? `; note: ${d.note}` : ''}`;
}

/** One line per logged event, in time order. Water is summed separately. */
function eventLine(r: HealthRecord): string | null {
  switch (r.kind) {
    case 'coffee': {
      const d = r.data as CoffeeData;
      return `Coffee: ${d.name}, ${d.shots} shot${d.shots === 1 ? '' : 's'}, ~${d.caffeineMg} mg caffeine${d.estimated ? ' (shots estimated)' : ''}`;
    }
    case 'meal':
      return mealLine(r.data as MealData);
    case 'supplement':
      return `Supplement: ${(r.data as SupplementData).name}`;
    case 'symptom': {
      const d = r.data as SymptomData;
      return `SYMPTOM: ${d.name}${d.severity ? ` (${SEVERITY[d.severity]})` : ''}${d.note ? `; note: ${d.note}` : ''}`;
    }
    case 'stool':
      return stoolLine(r.data as StoolData);
    case 'alcohol': {
      const d = r.data as AlcoholData;
      return `Alcohol: ${d.name} (${d.ml} ml at ${d.abv}%, ${d.grams} g alcohol)`;
    }
    case 'nicotine': {
      const d = r.data as NicotineData;
      return `Nicotine: ${d.count} × ${d.form}`;
    }
    case 'body': {
      const d = r.data as BodyData;
      return `Weight: ${[d.kg != null && `${d.kg} kg`, d.fatPct != null && `${d.fatPct}% body fat`].filter(Boolean).join(', ')}`;
    }
    case 'exercise': {
      const d = r.data as ExerciseData;
      const bits = [
        `${d.durationMin} min`,
        d.kcal != null && `${d.kcal} kcal`,
        d.meanHr != null && `avg HR ${d.meanHr}`,
        d.maxHr != null && `max HR ${d.maxHr}`,
        d.distanceM != null && `${(d.distanceM / 1000).toFixed(1)} km`
      ].filter(Boolean);
      return `Workout: ${d.title || d.type}, ${bits.join(', ')}`;
    }
    case 'note':
      return `Note: ${(r.data as NoteData).text}`;
    case 'lab': {
      const d = r.data as LabData;
      const flagged = d.markers.filter((m) => m.num != null && ((m.refLow != null && m.num < m.refLow) || (m.refHigh != null && m.num > m.refHigh)));
      const list = d.markers.map((m) => `${m.marker} ${m.value} ${m.unit}`.trim()).join('; ');
      return `Lab results (${d.lab}): ${list}${flagged.length ? `. Outside reference range: ${flagged.map((m) => m.marker).join(', ')}` : ''}`;
    }
    default:
      return null;
  }
}

function sleepLine(sleep: HealthRecord<SleepData>, stages: HealthRecord<SleepStageData>[]): string {
  const d = sleep.data;
  const dur = d.durationMin ?? minutesBetween(sleep.at, d.end);
  const bits = [`${hhmm(sleep.at)}–${hhmm(d.end)}`, hm(dur)];
  if (d.score != null) bits.push(`sleep score ${d.score}`);
  if (d.efficiency != null) bits.push(`efficiency ${d.efficiency}%`);
  const sid = sleep.id.replace(/^samsung:sleep:/, '');
  const mine = stages.filter((s) => s.data.sleepId === sid);
  if (mine.length) {
    const tot: Record<string, number> = {};
    for (const s of mine) tot[s.data.stage] = (tot[s.data.stage] ?? 0) + minutesBetween(s.at, s.data.end);
    const order = ['deep', 'rem', 'light', 'awake'] as const;
    bits.push(order.filter((k) => tot[k]).map((k) => `${k === 'rem' ? 'REM' : k} ${hm(tot[k])}`).join(', '));
  }
  return `Sleep (night before): ${bits.join(', ')}`;
}

function watchLines(recs: HealthRecord[]): string[] {
  const of = <D,>(k: string) => recs.filter((r) => r.kind === k) as HealthRecord<D>[];
  const out: string[] = [];
  const steps = of<StepsData>('steps_daily')[0];
  if (steps) out.push(`Steps: ${steps.data.steps.toLocaleString('en-US')}`);
  const hr = of<HourlyData>('hr_hourly');
  if (hr.length) {
    const avgs = hr.map((h) => h.data.avg);
    const lows = hr.map((h) => h.data.min ?? h.data.avg);
    const highs = hr.map((h) => h.data.max ?? h.data.avg);
    out.push(
      `Heart rate: lowest ${Math.min(...lows)}, highest ${Math.max(...highs)}, hourly averages ${Math.round(Math.min(...avgs))}–${Math.round(Math.max(...avgs))} bpm (${hr.length} hours measured)`
    );
  }
  const spo2 = of<Spo2Data>('spo2');
  if (spo2.length) {
    const avg = Math.round((spo2.reduce((s, r) => s + r.data.avg, 0) / spo2.length) * 10) / 10;
    const mins = spo2.map((r) => r.data.min).filter((m): m is number => m != null);
    out.push(`Blood oxygen: average ${avg}%${mins.length ? `, lowest ${Math.min(...mins)}%` : ''}`);
  }
  const energy = of<EnergyData>('energy')[0];
  if (energy) out.push(`Energy score: ${energy.data.score}`);
  return out;
}

export interface ClaudeSummaryOptions {
  from: string; // YYYY-MM-DD, inclusive
  to: string; // YYYY-MM-DD, inclusive
  question?: string;
}

export async function buildClaudeSummary(db: HealthDB, presets: Presets, opts: ClaudeSummaryOptions): Promise<string> {
  const recs = (await db.records.where('day').between(opts.from, opts.to, true, true).toArray()).filter(
    (r) => !r.deleted && r.kind !== 'preset'
  );
  const lines: string[] = [];
  const range = opts.from === opts.to ? dayTitle(opts.from) : `${dayTitle(opts.from)} to ${dayTitle(opts.to)}`;
  lines.push(`My health log from Vitals, ${range}. Times are local.`);
  const supps = presets.supplements.filter((s) => s.active);
  if (supps.length) lines.push(`Supplements I take: ${supps.map((s) => `${s.name} (${s.when})`).join(', ')}.`);
  lines.push(`Daily water target: ${presets.water.targetMl.toLocaleString('en-US')} ml.`);

  for (let day = opts.from; day <= opts.to; day = addDays(day, 1)) {
    const mine = recs.filter((r) => r.day === day);
    lines.push('', `## ${dayTitle(day)}`);
    if (!mine.length) {
      lines.push('Nothing logged.');
      continue;
    }
    // Main sleep = the longest one ending this day; anything shorter is a nap.
    const sleeps = (mine.filter((r) => r.kind === 'sleep') as HealthRecord<SleepData>[]).sort(
      (a, b) => (b.data.durationMin ?? minutesBetween(b.at, b.data.end)) - (a.data.durationMin ?? minutesBetween(a.at, a.data.end))
    );
    if (sleeps[0]) lines.push(sleepLine(sleeps[0], mine.filter((r) => r.kind === 'sleep_stage') as HealthRecord<SleepStageData>[]));
    for (const nap of sleeps.slice(1)) lines.push(`Nap: ${hhmm(nap.at)}–${hhmm(nap.data.end)}`);
    lines.push(...watchLines(mine));
    const water = mine.filter((r) => r.kind === 'water') as HealthRecord<WaterData>[];
    if (water.length) lines.push(`Water: ${water.reduce((s, r) => s + r.data.ml, 0).toLocaleString('en-US')} ml in total`);
    const events = mine
      .map((r) => ({ at: r.at, text: eventLine(r) }))
      .filter((e): e is { at: string; text: string } => e.text != null)
      .sort((a, b) => a.at.localeCompare(b.at));
    for (const e of events) lines.push(`- ${hhmm(e.at)} ${e.text}`);
  }
  if (opts.question?.trim()) lines.push('', `My question: ${opts.question.trim()}`);
  return lines.join('\n');
}
