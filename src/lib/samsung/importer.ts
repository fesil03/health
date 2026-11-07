import type { HealthDB } from '../db';
import type { HealthRecord, Kind } from '../model';
import { parseSamsungExport, type SourceFile } from './parse';

export interface KindPreview {
  kind: Kind;
  rows: number;
  fresh: number; // not on this device yet
  updated: number; // newer version of a record we have
  duplicate: number; // already here, unchanged
  dropped: number; // unreadable or impossible rows
  first?: string;
  last?: string;
}

export interface ImportPlan {
  preview: KindPreview[];
  toSave: HealthRecord[];
}

export async function planImport(db: HealthDB, files: SourceFile[], deviceId: string, nowMs = Date.now()): Promise<ImportPlan> {
  const results = parseSamsungExport(files, deviceId, nowMs);
  const preview: KindPreview[] = [];
  const toSave: HealthRecord[] = [];
  for (const res of results) {
    const existing = await db.records.bulkGet(res.records.map((r) => r.id));
    const p: KindPreview = { kind: res.kind, rows: res.rows, fresh: 0, updated: 0, duplicate: 0, dropped: res.dropped };
    res.records.forEach((r, i) => {
      const cur = existing[i];
      if (!cur) p.fresh++;
      else if (cur.deleted || r.updatedAt <= cur.updatedAt) {
        p.duplicate++;
        return;
      } else p.updated++;
      toSave.push(r);
    });
    const days = res.records.map((r) => r.day).sort();
    p.first = days[0];
    p.last = days.at(-1);
    preview.push(p);
  }
  return { preview, toSave };
}

export const KIND_LABELS: Record<Exclude<Kind, 'preset'>, string> = {
  sleep: 'Sleep nights',
  sleep_stage: 'Sleep stages',
  hr_hourly: 'Heart rate (hourly)',
  stress_hourly: 'Stress (hourly)',
  steps_daily: 'Steps (daily)',
  spo2: 'Blood oxygen',
  exercise: 'Workouts',
  water: 'Water',
  stool: 'Stool',
  coffee: 'Coffee',
  alcohol: 'Alcohol',
  nicotine: 'Nicotine',
  body: 'Weight and body fat',
  supplement: 'Supplements taken',
  meal: 'Meals',
  lab: 'Lab results',
  note: 'Chart notes'
};
