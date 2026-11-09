import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { HealthDB } from '../src/lib/db';
import { buildClaudeSummary } from '../src/lib/forClaude';
import { logCoffee, logStool, logSupplement, logSymptom, logWater, updateRecord, type Ctx } from '../src/lib/log';
import type { HealthRecord, SymptomData } from '../src/lib/model';
import { DEFAULT_PRESETS } from '../src/lib/presets';

const ctxAt = (db: HealthDB, at: string): Ctx => ({ db, deviceId: 'phone', at, now: 1000 });
const watch = (id: string, kind: string, day: string, at: string, data: unknown): HealthRecord => ({
  id,
  kind: kind as HealthRecord['kind'],
  day,
  at,
  updatedAt: 1,
  deviceId: 'watch-1a2b3c',
  source: 'samsung',
  data
});

describe('Copy for Claude', () => {
  it('lists each day in time order with sleep, watch data, meals, symptoms and totals', async () => {
    const db = new HealthDB(`c-${Math.random()}`);
    const P = DEFAULT_PRESETS;
    await db.saveLocal([
      watch('samsung:sleep:n1', 'sleep', '2026-11-09', '2026-11-08T23:40:00', { end: '2026-11-09T07:10:00', score: 81, durationMin: 450, efficiency: null }),
      watch('samsung:sleep_stage:n1:1', 'sleep_stage', '2026-11-09', '2026-11-08T23:40:00', { sleepId: 'n1', end: '2026-11-09T01:10:00', stage: 'deep' }),
      watch('samsung:sleep_stage:n1:2', 'sleep_stage', '2026-11-09', '2026-11-09T01:10:00', { sleepId: 'n1', end: '2026-11-09T07:10:00', stage: 'light' }),
      watch('samsung:sleep:nap', 'sleep', '2026-11-09', '2026-11-09T14:00:00', { end: '2026-11-09T14:25:00', score: null, durationMin: 25, efficiency: null }),
      watch('samsung:hr_hourly:2026-11-09T08', 'hr_hourly', '2026-11-09', '2026-11-09T08:00:00', { end: '2026-11-09T09:00:00', avg: 72, min: 60, max: 95 }),
      watch('samsung:hr_hourly:2026-11-09T13', 'hr_hourly', '2026-11-09', '2026-11-09T13:00:00', { end: '2026-11-09T14:00:00', avg: 84.4, min: 70, max: 110 }),
      watch('samsung:steps_daily:2026-11-09', 'steps_daily', '2026-11-09', '2026-11-09T00:00:00', { steps: 6500, distanceM: null }),
      {
        id: 'meal:1',
        kind: 'meal',
        day: '2026-11-09',
        at: '2026-11-09T12:30:00',
        updatedAt: 1,
        deviceId: 'phone',
        source: 'paste',
        data: { meal: 'lunch', items: 'Kung pao chicken, rice, Coke', kcal: 850, proteinG: 35, carbsG: 95, fatG: 32, fiberG: 4, oilHeavy: true }
      }
    ]);
    await logCoffee(ctxAt(db, '2026-11-09T08:30:00'), P.coffee[0]);
    await logSupplement(ctxAt(db, '2026-11-09T08:31:00'), P.supplements.find((s) => s.id === 'l-theanine')!);
    const burp = await logSymptom(ctxAt(db, '2026-11-09T13:15:00'), P.symptoms[0]);
    await updateRecord<SymptomData>(db, 'phone', burp, { data: { ...burp.data, severity: 2, note: 'after lunch' } });
    await logWater(ctxAt(db, '2026-11-09T10:00:00'), 350);
    await logWater(ctxAt(db, '2026-11-09T15:00:00'), 250);
    await logStool(ctxAt(db, '2026-11-09T09:00:00'));

    const text = await buildClaudeSummary(db, P, { from: '2026-11-08', to: '2026-11-09', question: 'Why the burping?' });
    const lines = text.split('\n');

    expect(lines[0]).toBe('My health log from Vitals, Sun 8 Nov 2026 to Mon 9 Nov 2026. Times are local.');
    expect(text).toContain('## Sun 8 Nov 2026\nNothing logged.');
    expect(text).toContain('Sleep (night before): 23:40–07:10, 7 h 30 min, sleep score 81, deep 1 h 30 min, light 6 h 00 min');
    expect(text).toContain('Nap: 14:00–14:25');
    expect(text).toContain('Steps: 6,500');
    expect(text).toContain('Heart rate: lowest 60, highest 110, hourly averages 72–84 bpm (2 hours measured)');
    expect(text).toContain('Water: 600 ml in total');
    // Events in time order
    const events = lines.filter((l) => l.startsWith('- '));
    expect(events).toEqual([
      '- 08:30 Coffee: Double espresso (home), 2 shots, ~128 mg caffeine',
      '- 08:31 Supplement: L-theanine',
      '- 09:00 Stool (no details)',
      '- 12:30 Meal (lunch): Kung pao chicken, rice, Coke; ~850 kcal, P 35 g, C 95 g, F 32 g, fibre 4 g, oil-heavy',
      '- 13:15 SYMPTOM: Burping (moderate); note: after lunch'
    ]);
    expect(lines.at(-1)).toBe('My question: Why the burping?');
  });
});
