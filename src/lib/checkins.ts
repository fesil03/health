// Morning and night check-ins: a few quick questions, one record per check-in per day.
import type { Ctx } from './log';
import type { HealthDB } from './db';
import { newRecord } from './log';
import type { HealthRecord } from './model';
import { addDays, dayOf } from './time';

export type CheckinType = 'morning' | 'night';
export type ScreenTime = 'none' | 'quick' | 'while' | 'lot';

export const SCREEN_TIME: { id: ScreenTime; label: string; long: string }[] = [
  { id: 'none', label: 'None', long: 'none' },
  { id: 'quick', label: 'Quick', long: 'quick (under 15 min)' },
  { id: 'while', label: 'A while', long: 'a while (15–45 min)' },
  { id: 'lot', label: 'A lot', long: 'a lot (45 min or more)' }
];

export interface MorningData {
  type: 'morning';
  rested: boolean | null;
  sleptThrough: boolean | null;
  snoozed: boolean | null;
}
export interface NightData {
  type: 'night';
  exercised: boolean | null;
  screenInBed: ScreenTime | null;
}
export type CheckinData = MorningData | NightData;

export const emptyCheckin = (type: CheckinType): CheckinData =>
  type === 'morning' ? { type, rested: null, sleptThrough: null, snoozed: null } : { type, exercised: null, screenInBed: null };

/** Fixed id: one morning and one night check-in per day, even across devices. */
export const checkinId = (type: CheckinType, day: string) => `checkin:${type}:${day}`;

/**
 * Which check-ins to offer at this local time.
 * Morning: 04:00–12:00. Night: from 20:00 until 04:00 the next day, for that evening.
 * A night check-in that was missed is still offered the next morning, until noon.
 */
export function dueCheckins(now: string): { type: CheckinType; day: string }[] {
  const h = Number(now.slice(11, 13));
  const today = dayOf(now);
  const yesterday = addDays(today, -1);
  if (h < 4) return [{ type: 'night', day: yesterday }];
  if (h < 12) return [{ type: 'morning', day: today }, { type: 'night', day: yesterday }];
  if (h >= 20) return [{ type: 'night', day: today }];
  return [];
}

/** Saves (or replaces) a check-in. A night one answered after midnight is filed under its evening. */
export async function saveCheckin(ctx: Ctx, day: string, data: CheckinData): Promise<HealthRecord<CheckinData>> {
  const at = dayOf(ctx.at) === day ? ctx.at : `${day}T23:59:00`;
  const rec = newRecord<CheckinData>({ ...ctx, at }, 'checkin', data, checkinId(data.type, day));
  await ctx.db.saveLocal([rec as HealthRecord]);
  return rec;
}

export async function doneCheckins(db: HealthDB, due: { type: CheckinType; day: string }[]): Promise<Set<string>> {
  const recs = await db.records.bulkGet(due.map((d) => checkinId(d.type, d.day)));
  return new Set(recs.filter((r): r is HealthRecord => !!r && !r.deleted).map((r) => r.id));
}

const yn = (v: boolean | null, yes: string, no: string) => (v == null ? null : v ? yes : no);

/** "Woke rested, slept through, no snooze" / "Exercised, screen in bed: a lot (45 min or more)". */
export function describeCheckin(d: CheckinData): string {
  const parts =
    d.type === 'morning'
      ? [yn(d.rested, 'woke rested', 'woke tired'), yn(d.sleptThrough, 'slept through', 'woke in the night'), yn(d.snoozed, 'hit snooze', 'no snooze')]
      : [
          yn(d.exercised, 'exercised', 'no exercise'),
          d.screenInBed && `screen in bed: ${SCREEN_TIME.find((s) => s.id === d.screenInBed)!.long}`
        ];
  const text = parts.filter(Boolean).join(', ');
  return text ? text[0].toUpperCase() + text.slice(1) : 'No answers';
}
