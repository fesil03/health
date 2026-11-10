import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { HealthDB } from '../src/lib/db';
import { checkinId, describeCheckin, doneCheckins, dueCheckins, saveCheckin } from '../src/lib/checkins';
import { buildClaudeSummary } from '../src/lib/forClaude';
import { dayLog } from '../src/lib/log';
import { DEFAULT_PRESETS } from '../src/lib/presets';

describe('check-ins', () => {
  it('offers the morning one in the morning, the night one in the evening, and a missed night until noon', () => {
    expect(dueCheckins('2026-11-10T03:30:00')).toEqual([{ type: 'night', day: '2026-11-09' }]);
    expect(dueCheckins('2026-11-10T08:00:00')).toEqual([
      { type: 'morning', day: '2026-11-10' },
      { type: 'night', day: '2026-11-09' }
    ]);
    expect(dueCheckins('2026-11-10T15:00:00')).toEqual([]);
    expect(dueCheckins('2026-11-10T22:30:00')).toEqual([{ type: 'night', day: '2026-11-10' }]);
  });

  it('keeps one per day and files a late night check-in under its evening', async () => {
    const db = new HealthDB(`k-${Math.random()}`);
    const ctx = { db, deviceId: 'phone', at: '2026-11-10T08:05:00', now: 1 };
    await saveCheckin(ctx, '2026-11-10', { type: 'morning', rested: true, sleptThrough: false, snoozed: true });
    await saveCheckin({ ...ctx, now: 2 }, '2026-11-10', { type: 'morning', rested: false, sleptThrough: false, snoozed: true });
    const night = await saveCheckin(ctx, '2026-11-09', { type: 'night', exercised: false, screenInBed: 'lot' });
    expect(night).toMatchObject({ id: checkinId('night', '2026-11-09'), day: '2026-11-09', at: '2026-11-09T23:59:00' });

    const morning = (await dayLog(db, '2026-11-10')).filter((r) => r.kind === 'checkin');
    expect(morning).toHaveLength(1);
    expect(describeCheckin(morning[0].data as never)).toBe('Woke tired, woke in the night, hit snooze');
    expect(describeCheckin(night.data)).toBe('No exercise, screen in bed: a lot (45 min or more)');
    expect(await doneCheckins(db, dueCheckins('2026-11-10T09:00:00'))).toEqual(
      new Set(['checkin:night:2026-11-09', 'checkin:morning:2026-11-10'])
    );

    const text = await buildClaudeSummary(db, DEFAULT_PRESETS, { from: '2026-11-09', to: '2026-11-10' });
    expect(text).toContain('Night check-in: No exercise, screen in bed: a lot (45 min or more)');
    expect(text).toContain('Morning check-in: Woke tired, woke in the night, hit snooze');
  });

  it('leaves out questions that were not answered', () => {
    expect(describeCheckin({ type: 'night', exercised: true, screenInBed: null })).toBe('Exercised');
    expect(describeCheckin({ type: 'morning', rested: null, sleptThrough: null, snoozed: null })).toBe('No answers');
  });
});
