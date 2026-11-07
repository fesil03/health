import 'fake-indexeddb/auto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsv, toObjects } from '../src/lib/csv';
import { HealthDB } from '../src/lib/db';
import type { SleepData, SleepStageData, StepsData } from '../src/lib/model';
import { planImport } from '../src/lib/samsung/importer';
import { kindForFile, parseSamsungExport } from '../src/lib/samsung/parse';
import { isPlausible, utcToLocal } from '../src/lib/time';

const NOW = Date.UTC(2026, 10, 7, 12);
const dir = join(__dirname, 'fixtures/samsung');
const files = readdirSync(dir).map((f) => ({ path: `samsunghealth_x_2026/${f}`, text: readFileSync(join(dir, f), 'utf8') }));
const parsed = () => Object.fromEntries(parseSamsungExport(files, 'dev-a', NOW).map((r) => [r.kind, r]));

describe('csv', () => {
  it('handles BOM, quotes, escaped quotes and CRLF', () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\r\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"']
    ]);
  });
  it('strips Samsung column prefixes', () => {
    const [o] = toObjects([['com.samsung.health.heart_rate.start_time', 'tag_id'], ['t', '1']]);
    expect(o).toEqual({ start_time: 't', tag_id: '1' });
  });
});

describe('time', () => {
  it('converts UTC + offset to local naive time', () => {
    expect(utcToLocal('2026-11-06 16:47:58.000', 'UTC+0800')).toBe('2026-11-07T00:47:58');
    expect(utcToLocal('2026-11-06 16:47:58.000', 'UTC-0300')).toBe('2026-11-06T13:47:58');
  });
  it('rejects impossible dates', () => {
    expect(isPlausible('2089-04-23T19:35:25', NOW)).toBe(false);
    expect(isPlausible('2026-11-07T08:00:00', NOW)).toBe(true);
  });
});

describe('samsung parser', () => {
  it('recognises export files by name, inside a folder too', () => {
    expect(kindForFile('x/com.samsung.shealth.sleep.20261107121637.csv')).toBe('sleep');
    expect(kindForFile('com.samsung.health.sleep_stage.20261107121637.csv')).toBe('sleep_stage');
    expect(kindForFile('com.samsung.shealth.sleep_goal.20261107121637.csv')).toBeNull();
    expect(kindForFile('com.samsung.shealth.sleep_combined.20261107121637.csv')).toBeNull();
  });

  it('files sleep under the wake-up day and drops naps under 20 min', () => {
    const { sleep } = parsed();
    expect(sleep.records.map((r) => r.day).sort()).toEqual(['2026-11-05', '2026-11-07']);
    const night = sleep.records.find((r) => r.day === '2026-11-07')!;
    expect(night.at).toBe('2026-11-07T00:47:58');
    expect((night.data as unknown as SleepData).score).toBe(88);
    expect(sleep.dropped).toBe(1);
  });

  it('files stages under their night, with a fallback for unknown sleeps', () => {
    const { sleep_stage } = parsed();
    const stages = sleep_stage.records.map((r) => [(r.data as unknown as SleepStageData).stage, r.day]);
    expect(stages).toEqual([
      ['light', '2026-11-07'],
      ['deep', '2026-11-07'],
      ['rem', '2026-11-07']
    ]);
  });

  it('drops future readings and duplicate ids', () => {
    const { stress_hourly } = parsed();
    expect(stress_hourly.records).toHaveLength(1);
    expect(stress_hourly.dropped).toBe(2);
  });

  it('skips zero heart rate', () => {
    expect(parsed().hr_hourly.records).toHaveLength(1);
  });

  it('prefers the merged step total per day', () => {
    const steps = parsed().steps_daily.records;
    const byDay = Object.fromEntries(steps.map((r) => [r.day, (r.data as unknown as StepsData).steps]));
    expect(byDay).toEqual({ '2026-11-06': 5468, '2026-11-05': 8992 });
  });

  it('reads workouts, skipping ones under a minute, with quoted JSON columns', () => {
    const { exercise } = parsed();
    expect(exercise.records).toHaveLength(1);
    expect(exercise.records[0].data).toMatchObject({ type: 'Cycling', durationMin: 17, meanHr: 75 });
  });

  it('gives Samsung records stable ids so two devices dedupe', () => {
    const a = parseSamsungExport(files, 'dev-a', NOW).flatMap((r) => r.records.map((x) => x.id));
    const b = parseSamsungExport(files, 'dev-b', NOW).flatMap((r) => r.records.map((x) => x.id));
    expect(a).toEqual(b);
  });
});

describe('import plan', () => {
  it('reports new records, then duplicates on re-import', async () => {
    const db = new HealthDB(`t-${Math.random()}`);
    const first = await planImport(db, files, 'dev-a', NOW);
    const sleep = first.preview.find((p) => p.kind === 'sleep')!;
    expect(sleep).toMatchObject({ rows: 3, fresh: 2, duplicate: 0, dropped: 1 });
    await db.saveLocal(first.toSave);

    const again = await planImport(db, files, 'dev-a', NOW);
    expect(again.toSave).toHaveLength(0);
    expect(again.preview.find((p) => p.kind === 'sleep')!.duplicate).toBe(2);
    expect(Object.keys(await db.getSetting('dirtyMonths', {})).sort()).toEqual(['2026-08', '2026-10', '2026-11']); // water at 18:02 UTC Jul 31 = Aug 1 in Beijing
  });
});
