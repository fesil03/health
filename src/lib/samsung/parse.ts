import { parseCsv, toObjects } from '../csv';
import type {
  ExerciseData,
  HealthRecord,
  HourlyData,
  Kind,
  SleepData,
  SleepStageData,
  Spo2Data,
  StepsData,
  WaterData
} from '../model';
import { dayOf, isPlausible, minutesBetween, msToNaive, parseUtcMs, utcToLocal } from '../time';

/** Samsung table name (from the file name) -> app kind. */
const TABLES: Record<string, Kind> = {
  'shealth.sleep': 'sleep',
  'health.sleep_stage': 'sleep_stage',
  'shealth.tracker.heart_rate': 'hr_hourly',
  'shealth.stress': 'stress_hourly',
  'shealth.step_daily_trend': 'steps_daily',
  'shealth.tracker.oxygen_saturation': 'spo2',
  'shealth.exercise': 'exercise',
  'health.water_intake': 'water'
};

export function kindForFile(path: string): Kind | null {
  const base = path.split(/[\\/]/).pop() ?? '';
  const m = /^com\.samsung\.((?:s?health)\.[a-z_.]+?)\.\d{8,14}\.csv$/i.exec(base);
  return m ? (TABLES[m[1].toLowerCase()] ?? null) : null;
}

const STAGES: Record<string, SleepStageData['stage']> = {
  '40001': 'awake',
  '40002': 'light',
  '40003': 'deep',
  '40004': 'rem'
};

// Common Samsung Health exercise codes; anything else keeps its code.
const EXERCISE_TYPES: Record<number, string> = {
  0: 'Other workout',
  1001: 'Walking',
  1002: 'Running',
  11007: 'Cycling',
  13001: 'Hiking',
  14001: 'Swimming',
  15006: 'Elliptical',
  10007: 'Strength'
};

export interface ParseResult {
  kind: Kind;
  rows: number;
  records: HealthRecord[];
  dropped: number;
}

const num = (s: string | undefined): number | null => {
  if (s === undefined || s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

interface Ctx {
  deviceId: string;
  nowMs: number;
  /** sleep datauuid -> wake day, used to file stages under the right night */
  sleepDays: Map<string, string>;
}

function base(kind: Kind, uuid: string, at: string, day: string, row: Record<string, string>, ctx: Ctx) {
  const upd = parseUtcMs(row.update_time ?? '') ?? parseUtcMs(row.create_time ?? '') ?? 0;
  return {
    id: `samsung:${kind}:${uuid}`,
    kind,
    day,
    at,
    updatedAt: upd,
    deviceId: ctx.deviceId,
    source: 'samsung' as const
  };
}

export function parseSamsungFile(path: string, text: string, ctx: Ctx): ParseResult | null {
  const kind = kindForFile(path);
  if (!kind) return null;
  const all = parseCsv(text);
  // Line 1 is Samsung metadata ("com.samsung.shealth.sleep,7013001,12"); line 2 the header.
  const objs = toObjects(all.slice(1));
  const records: HealthRecord[] = [];
  let dropped = 0;
  const seen = new Set<string>();
  const push = (r: HealthRecord | null) => {
    if (!r || !isPlausible(r.at, ctx.nowMs) || seen.has(r.id)) {
      dropped++;
      return;
    }
    seen.add(r.id);
    records.push(r);
  };

  if (kind === 'steps_daily') {
    // One row per source per day; source_type -2 is Samsung's merged total.
    const byDay = new Map<string, { row: Record<string, string>; merged: boolean; steps: number }>();
    for (const row of objs) {
      const d = (row.day_time ?? '').slice(0, 10);
      const steps = num(row.count);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || steps === null) {
        dropped++;
        continue;
      }
      const merged = row.source_type === '-2';
      const cur = byDay.get(d);
      if (!cur || (merged && !cur.merged) || (merged === cur.merged && steps > cur.steps)) {
        if (cur) dropped++;
        byDay.set(d, { row, merged, steps });
      } else dropped++;
    }
    for (const [d, { row, steps }] of byDay) {
      const data: StepsData = { steps, distanceM: num(row.distance) };
      push({ ...base(kind, d, `${d}T00:00:00`, d, row, ctx), data } as HealthRecord);
    }
    return { kind, rows: objs.length, records, dropped };
  }

  for (const row of objs) {
    const uuid = row.datauuid;
    const start = utcToLocal(row.start_time ?? '', row.time_offset);
    if (!uuid || !start) {
      dropped++;
      continue;
    }
    const end = utcToLocal(row.end_time ?? '', row.time_offset) ?? start;
    switch (kind) {
      case 'sleep': {
        const mins = minutesBetween(start, end);
        if (mins < 20) {
          dropped++;
          break;
        }
        const data: SleepData = {
          end,
          score: num(row.sleep_score),
          durationMin: num(row.sleep_duration) ?? mins,
          efficiency: num(row.efficiency)
        };
        push({ ...base(kind, uuid, start, dayOf(end), row, ctx), data } as HealthRecord);
        break;
      }
      case 'sleep_stage': {
        const data: SleepStageData = {
          sleepId: row.sleep_id ?? '',
          end,
          stage: STAGES[row.stage ?? ''] ?? 'unknown'
        };
        const night =
          ctx.sleepDays.get(data.sleepId) ??
          dayOf(msToNaive((parseUtcMs(start.replace('T', ' ')) ?? 0) + 12 * 3_600_000));
        push({ ...base(kind, uuid, start, night, row, ctx), data } as HealthRecord);
        break;
      }
      case 'hr_hourly':
      case 'stress_hourly': {
        const avg = num(kind === 'hr_hourly' ? row.heart_rate : row.score);
        if (avg === null || (kind === 'hr_hourly' && avg <= 0)) {
          dropped++;
          break;
        }
        const data: HourlyData & { tag?: string } = { end, avg, min: num(row.min), max: num(row.max) };
        if (row.tag_id) data.tag = row.tag_id;
        push({ ...base(kind, uuid, start, dayOf(start), row, ctx), data } as HealthRecord);
        break;
      }
      case 'spo2': {
        const avg = num(row.spo2);
        if (avg === null || avg <= 0) {
          dropped++;
          break;
        }
        const data: Spo2Data = { end, avg, min: num(row.min) };
        push({ ...base(kind, uuid, start, dayOf(end), row, ctx), data } as HealthRecord);
        break;
      }
      case 'exercise': {
        const ms = num(row.duration) ?? minutesBetween(start, end) * 60_000;
        const durationMin = Math.round(ms / 60_000);
        if (durationMin < 1) {
          dropped++;
          break;
        }
        const code = num(row.exercise_type) ?? 0;
        const data: ExerciseData = {
          end,
          typeCode: code,
          type: EXERCISE_TYPES[code] ?? `Workout (code ${code})`,
          durationMin,
          kcal: num(row.calorie),
          meanHr: num(row.mean_heart_rate) || null
        };
        push({ ...base(kind, uuid, start, dayOf(start), row, ctx), data } as HealthRecord);
        break;
      }
      case 'water': {
        const ml = num(row.amount);
        if (ml === null || ml <= 0) {
          dropped++;
          break;
        }
        const data: WaterData = { ml };
        push({ ...base(kind, uuid, start, dayOf(start), row, ctx), data } as HealthRecord);
        break;
      }
    }
  }
  return { kind, rows: objs.length, records, dropped };
}

export interface SourceFile {
  path: string;
  text: string;
}

/** Parses every recognised file. Sleep goes first so stages can be filed under their night. */
export function parseSamsungExport(files: SourceFile[], deviceId: string, nowMs = Date.now()): ParseResult[] {
  const ctx: Ctx = { deviceId, nowMs, sleepDays: new Map() };
  const known = files.filter((f) => kindForFile(f.path));
  known.sort((a, b) => Number(kindForFile(b.path) === 'sleep') - Number(kindForFile(a.path) === 'sleep'));
  const out: ParseResult[] = [];
  for (const f of known) {
    const res = parseSamsungFile(f.path, f.text, ctx);
    if (!res) continue;
    if (res.kind === 'sleep') {
      for (const r of res.records) ctx.sleepDays.set(r.id.replace('samsung:sleep:', ''), r.day);
    }
    out.push(res);
  }
  return out;
}
