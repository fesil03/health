// Creating, editing and deleting things logged in the app. Every write goes through
// db.saveLocal so it syncs. Deletes are tombstones so they reach the other devices.
import type { HealthDB } from './db';
import type {
  AlcoholData,
  BodyData,
  CoffeeData,
  HealthRecord,
  Kind,
  NicotineData,
  NicotineForm,
  NoteData,
  StoolData,
  SupplementData,
  WaterData
} from './model';
import { alcoholGrams, type AlcoholPreset, type CoffeePreset, type SupplementItem } from './presets';
import { dayOf } from './time';

export interface Ctx {
  db: HealthDB;
  deviceId: string;
  /** local naive time to log at */
  at: string;
  now?: number;
}

export function newRecord<D>(ctx: Ctx, kind: Kind, data: D, id: string = crypto.randomUUID()): HealthRecord<D> {
  return {
    id,
    kind,
    day: dayOf(ctx.at),
    at: ctx.at,
    updatedAt: ctx.now ?? Date.now(),
    deviceId: ctx.deviceId,
    source: 'manual',
    data
  };
}

async function save<D>(ctx: Ctx, rec: HealthRecord<D>): Promise<HealthRecord<D>> {
  await ctx.db.saveLocal([rec as HealthRecord]);
  return rec;
}

export const EMPTY_STOOL: StoolData = {
  bristol: null,
  color: null,
  ease: null,
  urgent: null,
  complete: null,
  blood: null,
  durationMin: null
};

export const logStool = (ctx: Ctx, details: Partial<StoolData> = {}) =>
  save(ctx, newRecord<StoolData>(ctx, 'stool', { ...EMPTY_STOOL, ...details }));

export function logCoffee(ctx: Ctx, p: CoffeePreset, shotsDelta = 0) {
  const shots = Math.max(1, p.shots + shotsDelta);
  const data: CoffeeData = {
    presetId: p.id,
    name: p.name,
    shots,
    mgPerShot: p.mgPerShot,
    caffeineMg: Math.round(shots * p.mgPerShot),
    estimated: p.estimated,
    milk: p.milk
  };
  return save(ctx, newRecord(ctx, 'coffee', data));
}

export function logAlcohol(ctx: Ctx, p: AlcoholPreset) {
  const data: AlcoholData = { presetId: p.id, name: p.name, ml: p.ml, abv: p.abv, grams: alcoholGrams(p.ml, p.abv) };
  return save(ctx, newRecord(ctx, 'alcohol', data));
}

export const logNicotine = (ctx: Ctx, form: NicotineForm, count = 1) =>
  save(ctx, newRecord<NicotineData>(ctx, 'nicotine', { form, count }));

export const logWater = (ctx: Ctx, ml: number) => save(ctx, newRecord<WaterData>(ctx, 'water', { ml }));

export const logBody = (ctx: Ctx, kg: number | null, fatPct: number | null) =>
  save(ctx, newRecord<BodyData>(ctx, 'body', { kg, fatPct }));

export const addNote = (ctx: Ctx, text: string, auto = false) =>
  save(ctx, newRecord<NoteData>(ctx, 'note', auto ? { text, auto } : { text }));

/** One record per supplement per day, with a fixed id so two devices can't double-count. */
export const supplementId = (day: string, suppId: string) => `supp:${day}:${suppId}`;

export async function setSupplementTaken(ctx: Ctx, item: SupplementItem, taken: boolean): Promise<void> {
  const id = supplementId(dayOf(ctx.at), item.id);
  const rec = newRecord<SupplementData>(ctx, 'supplement', { supplementId: item.id, name: item.name }, id);
  if (!taken) rec.deleted = true;
  await ctx.db.saveLocal([rec as HealthRecord]);
}

/** Replace a record's data (and optionally its time), keeping its id. */
export async function updateRecord<D>(
  db: HealthDB,
  deviceId: string,
  rec: HealthRecord<D>,
  changes: { data?: D; at?: string },
  now = Date.now()
): Promise<HealthRecord<D>> {
  const at = changes.at ?? rec.at;
  const next: HealthRecord<D> = { ...rec, data: changes.data ?? rec.data, at, day: dayOf(at), updatedAt: now, deviceId };
  await db.saveLocal([next as HealthRecord]);
  return next;
}

export async function deleteRecord(db: HealthDB, deviceId: string, rec: HealthRecord, now = Date.now()): Promise<void> {
  await db.saveLocal([{ ...rec, deleted: true, updatedAt: now, deviceId }]);
}

/** Things logged in the app on one day, oldest first. */
export async function dayLog(db: HealthDB, day: string): Promise<HealthRecord[]> {
  const recs = await db.records.where('day').equals(day).toArray();
  return recs
    .filter((r) => !r.deleted && r.source !== 'samsung' && r.kind !== 'preset')
    .sort((a, b) => a.at.localeCompare(b.at));
}

export function stoolNeedsDoctorNote(d: StoolData): boolean {
  return !!d.blood || d.color === 'black' || d.color === 'red' || d.color === 'pale';
}
