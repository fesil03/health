import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { HealthDB } from '../src/lib/db';
import {
  dayLog,
  deleteRecord,
  logAlcohol,
  logCoffee,
  logStool,
  logWater,
  setSupplementTaken,
  stoolNeedsDoctorNote,
  updateRecord,
  type Ctx
} from '../src/lib/log';
import type { CoffeeData, StoolData } from '../src/lib/model';
import { contentId, parsePaste, pasteToRecords } from '../src/lib/paste';
import { alcoholGrams, DEFAULT_PRESETS, loadPresets, savePreset, supplementChangeNotes } from '../src/lib/presets';
import { addDays, nowNaive } from '../src/lib/time';

const freshDb = () => new HealthDB(`l-${Math.random()}`);
const ctxAt = (db: HealthDB, at: string, now = 1000): Ctx => ({ db, deviceId: 'phone', at, now });
const coffee = (id: string) => DEFAULT_PRESETS.coffee.find((c) => c.id === id)!;

describe('presets', () => {
  it('computes grams of alcohol', () => {
    expect(alcoholGrams(330, 5)).toBe(13);
    expect(alcoholGrams(50, 52)).toBe(20.5);
  });

  it('falls back to defaults and syncs edits as records', async () => {
    const db = freshDb();
    expect((await loadPresets(db)).water.bottleMl).toBe(350);
    await savePreset(db, 'phone', 'water', { ...DEFAULT_PRESETS.water, targetMl: 2500 }, Date.UTC(2026, 10, 8));
    expect((await loadPresets(db)).water.targetMl).toBe(2500);
    expect(Object.keys(await db.getSetting('dirtyMonths', {}))).toEqual(['2026-11']);
  });

  it('notes supplements started and stopped', () => {
    const before = DEFAULT_PRESETS.supplements;
    const after = [
      ...before.map((s) => (s.id === 'zinc' ? { ...s, active: false } : s)),
      { id: 'mag', name: 'Magnesium glycinate', when: 'night' as const, active: true }
    ];
    expect(supplementChangeNotes(before, after)).toEqual(['Started Magnesium glycinate', 'Stopped Zinc']);
  });
});

describe('logging', () => {
  it('logs coffee with caffeine from shots, and ±1 shot', async () => {
    const db = freshDb();
    const r = await logCoffee(ctxAt(db, '2026-11-08T09:00:00'), coffee('double-espresso-home'));
    expect(r.data).toMatchObject({ shots: 2, caffeineMg: 128, estimated: false });
    const r2 = await logCoffee(ctxAt(db, '2026-11-08T15:00:00'), coffee('coconut-latte'), +1);
    expect(r2.data).toMatchObject({ shots: 3, caffeineMg: 192, estimated: true, milk: 'coconut' });
    const r3 = await logCoffee(ctxAt(db, '2026-11-08T16:00:00'), coffee('latte'), -5);
    expect((r3.data as CoffeeData).shots).toBe(1);
  });

  it('logs a one-tap stool and adds details later', async () => {
    const db = freshDb();
    const r = await logStool(ctxAt(db, '2026-11-08T08:10:00'));
    expect((r.data as StoolData).bristol).toBeNull();
    const edited = await updateRecord(db, 'mac', r, { data: { ...r.data, bristol: 4, color: 'brown' as const } }, 2000);
    expect(edited).toMatchObject({ id: r.id, deviceId: 'mac', updatedAt: 2000 });
    expect((await db.records.get(r.id))!.data).toMatchObject({ bristol: 4 });
  });

  it('flags stool entries that warrant a doctor note', () => {
    const base = { bristol: 4, color: 'brown', ease: 1, urgent: false, complete: true, blood: false, durationMin: 5 } as StoolData;
    expect(stoolNeedsDoctorNote(base)).toBe(false);
    expect(stoolNeedsDoctorNote({ ...base, blood: true })).toBe(true);
    expect(stoolNeedsDoctorNote({ ...base, color: 'black' })).toBe(true);
  });

  it('moving an entry to another time moves it to that day', async () => {
    const db = freshDb();
    const r = await logWater(ctxAt(db, '2026-11-08T00:30:00'), 350);
    await updateRecord(db, 'phone', r, { at: '2026-11-07T23:30:00' });
    expect(await dayLog(db, '2026-11-07')).toHaveLength(1);
    expect(await dayLog(db, '2026-11-08')).toHaveLength(0);
  });

  it('supplement ticks are one per day and can be unticked', async () => {
    const db = freshDb();
    const zinc = DEFAULT_PRESETS.supplements.find((s) => s.id === 'zinc')!;
    await setSupplementTaken(ctxAt(db, '2026-11-08T22:00:00', 1), zinc, true);
    await setSupplementTaken(ctxAt(db, '2026-11-08T22:05:00', 2), zinc, true);
    expect(await dayLog(db, '2026-11-08')).toHaveLength(1);
    await setSupplementTaken(ctxAt(db, '2026-11-08T22:06:00', 3), zinc, false);
    expect(await dayLog(db, '2026-11-08')).toHaveLength(0);
  });

  it('delete leaves a tombstone and hides the entry', async () => {
    const db = freshDb();
    const r = await logAlcohol(ctxAt(db, '2026-11-08T21:00:00'), DEFAULT_PRESETS.alcohol[0]);
    await deleteRecord(db, 'phone', r, 5000);
    expect((await db.records.get(r.id))!.deleted).toBe(true);
    expect(await dayLog(db, '2026-11-08')).toEqual([]);
  });

  it('day log excludes Samsung data and presets, sorted by time', async () => {
    const db = freshDb();
    await logWater(ctxAt(db, '2026-11-08T15:00:00'), 250);
    await logWater(ctxAt(db, '2026-11-08T09:00:00'), 350);
    await db.records.put({ id: 'samsung:x', kind: 'water', day: '2026-11-08', at: '2026-11-08T10:00:00', updatedAt: 1, deviceId: 'p', source: 'samsung', data: { ml: 1 } });
    await savePreset(db, 'phone', 'water', DEFAULT_PRESETS.water, Date.UTC(2026, 10, 8, 12));
    expect((await dayLog(db, '2026-11-08')).map((r) => r.at)).toEqual(['2026-11-08T09:00:00', '2026-11-08T15:00:00']);
  });
});

describe('paste', () => {
  const meal = `Here you go:
\`\`\`
#meal v1
time: 2026-11-07 13:14
meal: lunch
items: 二两米饭; 肉末茄子; fried chicken w/ potato
kcal: ~900
protein_g: 35
carbs_g: 95
fat_g: 50
fiber_g: 6
oil_heavy: yes
note: low veg
sodium：high
\`\`\``;

  it('reads a #meal block inside a code fence with extra keys', () => {
    const r = parsePaste(meal);
    expect(r.errors).toEqual([]);
    expect(r.meals[0]).toEqual({
      at: '2026-11-07T13:14:00',
      data: {
        meal: 'lunch',
        items: '二两米饭; 肉末茄子; fried chicken w/ potato',
        kcal: 900,
        proteinG: 35,
        carbsG: 95,
        fatG: 50,
        fiberG: 6,
        oilHeavy: true,
        note: 'low veg; sodium: high'
      }
    });
  });

  it('reads several blocks, and pasting twice keeps the same ids', () => {
    const two = `${meal}\n#meal v1\nitems: banana\nkcal: 100`;
    const r = parsePaste(two);
    expect(r.meals).toHaveLength(2);
    expect(r.meals[1].at).toBeNull();
    const a = pasteToRecords(r, 'phone', '2026-11-08T10:00:00');
    const b = pasteToRecords(parsePaste(two), 'mac', '2026-11-08T10:00:00');
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(a[1].day).toBe('2026-11-08');
  });

  it('reads #labs with a header and odd values', () => {
    const r = parsePaste(`#labs v1
date: 2026-03-14
lab: Fleury
marker | value | unit | ref_low | ref_high
--- | --- | --- | --- | ---
Vitamin D (25-OH) | 32 | ng/mL | 30 | 100
PCR | <0,5 | mg/L | | 5`);
    expect(r.errors).toEqual([]);
    expect(r.labs[0].data.markers).toEqual([
      { marker: 'Vitamin D (25-OH)', value: '32', num: 32, unit: 'ng/mL', refLow: 30, refHigh: 100 },
      { marker: 'PCR', value: '<0,5', num: 0.5, unit: 'mg/L', refLow: null, refHigh: 5 }
    ]);
    const [rec] = pasteToRecords(r, 'mac', '2026-11-08T10:00:00');
    expect(rec).toMatchObject({ kind: 'lab', day: '2026-03-14', source: 'paste' });
  });

  it('explains what is wrong', () => {
    expect(parsePaste('hello').errors[0]).toMatch(/No #meal/);
    expect(parsePaste('#meal v1\nkcal: 3').errors[0]).toMatch(/items/);
    expect(parsePaste('#labs v1\nlab: x').errors[0]).toMatch(/date/);
  });

  it('content ids are stable', () => {
    expect(contentId('meal', 'a')).toBe(contentId('meal', 'a'));
    expect(contentId('meal', 'a')).not.toBe(contentId('meal', 'b'));
  });
});

describe('local time helpers', () => {
  it('formats now in the device time zone and steps days', () => {
    expect(nowNaive(Date.UTC(2026, 10, 7, 16, 30))).toMatch(/^2026-11-0[78]T/);
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('log time picker', async () => {
  const { resolveLogTime } = await import('../src/lib/time');
  const now = '2026-11-08T10:30:15';
  it('stamps now, minutes ago, or a picked time', () => {
    expect(resolveLogTime('2026-11-08', now, { kind: 'now' })).toBe(now);
    expect(resolveLogTime('2026-11-08', now, { kind: 'ago', min: 60 })).toBe('2026-11-08T09:30:15');
    expect(resolveLogTime('2026-11-08', now, { kind: 'at', hhmm: '08:05' })).toBe('2026-11-08T08:05:00');
  });
  it('crosses midnight backwards', () => {
    expect(resolveLogTime('2026-11-08', '2026-11-08T00:20:00', { kind: 'ago', min: 30 })).toBe('2026-11-07T23:50:00');
  });
  it('keeps the clock time when viewing an earlier day', () => {
    expect(resolveLogTime('2026-11-05', now, { kind: 'now' })).toBe('2026-11-05T10:30:15');
    expect(resolveLogTime('2026-11-05', now, { kind: 'at', hhmm: '21:00' })).toBe('2026-11-05T21:00:00');
  });
});

describe('batch paste', async () => {
  const { planPaste, describeCounts } = await import('../src/lib/paste');
  const batch = `#meal v1
time: 2026-11-07 19:30
meal: dinner
items: noodles
kcal: 650

#meal v1
time: 2026-11-08 08:40
meal: breakfast
items: eggs; toast
kcal: 380`;

  it('marks meals already logged and skips them', async () => {
    const db = freshDb();
    const first = await planPaste(db, parsePaste(batch), 'phone', '2026-11-08T13:00:00', 1);
    expect(first.map((i) => i.exists)).toEqual([false, false]);
    expect(first.map((i) => i.rec.day)).toEqual(['2026-11-07', '2026-11-08']);
    await db.saveLocal(first.map((i) => i.rec));

    const more = `${batch}\n\n#meal v1\ntime: 2026-11-08 13:05\nmeal: lunch\nitems: rice; tofu\nkcal: 700`;
    const second = await planPaste(db, parsePaste(more), 'phone', '2026-11-08T14:00:00', 2);
    expect(second.map((i) => i.exists)).toEqual([true, true, false]);
  });

  it('a meal deleted in the app counts as new again', async () => {
    const db = freshDb();
    const [item] = await planPaste(db, parsePaste(batch), 'phone', '2026-11-08T13:00:00', 1);
    await db.saveLocal([{ ...item.rec, deleted: true }]);
    const again = await planPaste(db, parsePaste(batch), 'phone', '2026-11-08T13:00:00', 2);
    expect(again[0].exists).toBe(false);
  });

  it('describes counts in plain words', () => {
    expect(describeCounts(1, 0)).toBe('1 meal');
    expect(describeCounts(2, 1)).toBe('2 meals and 1 lab result set');
  });
});
