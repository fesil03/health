// Preset lists (coffee, alcohol, supplements, water target…) are stored as records of
// kind `preset` so an edit on one device reaches the others through sync.
import type { HealthDB } from './db';
import type { HealthRecord } from './model';
import { dayOf, nowNaive } from './time';

export interface CoffeePreset {
  id: string;
  name: string;
  shots: number;
  mgPerShot: number;
  milk: 'none' | 'dairy' | 'oat' | 'coconut';
  estimated: boolean;
}

export interface AlcoholPreset {
  id: string;
  name: string;
  ml: number;
  abv: number;
}

export interface SupplementItem {
  id: string;
  name: string;
  when: 'morning' | 'night';
  active: boolean;
}

export interface WaterSettings {
  targetMl: number;
  exerciseTargetMl: number;
  glassMl: number;
  bottleMl: number;
}

export interface SymptomItem {
  id: string;
  name: string;
}

export interface Presets {
  coffee: CoffeePreset[];
  alcohol: AlcoholPreset[];
  supplements: SupplementItem[];
  symptoms: SymptomItem[];
  water: WaterSettings;
}

export const MG_PER_SHOT = 64;

export const DEFAULT_PRESETS: Presets = {
  coffee: [
    { id: 'double-espresso-home', name: 'Double espresso (home)', shots: 2, mgPerShot: MG_PER_SHOT, milk: 'none', estimated: false },
    { id: 'coconut-latte', name: 'Coconut latte', shots: 2, mgPerShot: MG_PER_SHOT, milk: 'coconut', estimated: true },
    { id: 'flat-white', name: 'Flat white', shots: 2, mgPerShot: MG_PER_SHOT, milk: 'dairy', estimated: true },
    { id: 'latte', name: 'Latte', shots: 2, mgPerShot: MG_PER_SHOT, milk: 'dairy', estimated: true },
    { id: 'americano', name: 'Americano', shots: 2, mgPerShot: MG_PER_SHOT, milk: 'none', estimated: true },
    { id: 'oat-latte', name: 'Oat milk latte', shots: 2, mgPerShot: MG_PER_SHOT, milk: 'oat', estimated: true }
  ],
  alcohol: [
    { id: 'beer', name: 'Beer 330 ml', ml: 330, abv: 5 },
    { id: 'wine', name: 'Wine glass', ml: 150, abv: 12 },
    { id: 'baijiu', name: 'Baijiu shot', ml: 50, abv: 52 },
    { id: 'spirit', name: 'Spirit shot', ml: 40, abv: 40 },
    { id: 'cocktail', name: 'Cocktail', ml: 40, abv: 40 }
  ],
  supplements: [
    { id: 'omega-3', name: 'Kirkland Super Omega-3', when: 'morning', active: true },
    { id: 'l-theanine', name: 'L-theanine', when: 'night', active: true },
    { id: 'zinc', name: 'Zinc', when: 'night', active: true },
    { id: 'calcium-d3', name: 'Calcium + D3', when: 'morning', active: true },
    { id: 'folic-acid', name: 'Folic acid', when: 'morning', active: true },
    { id: 'vitamin-d3', name: 'Vitamin D3', when: 'morning', active: true }
  ],
  symptoms: [
    { id: 'burping', name: 'Burping' },
    { id: 'bloating', name: 'Bloating' },
    { id: 'heartburn', name: 'Heartburn' },
    { id: 'stomach-ache', name: 'Stomach ache' },
    { id: 'nausea', name: 'Nausea' },
    { id: 'headache', name: 'Headache' },
    { id: 'low-energy', name: 'Low energy' },
    { id: 'brain-fog', name: 'Brain fog' },
    { id: 'low-mood', name: 'Low mood' },
    { id: 'anxious', name: 'Anxious' }
  ],
  water: { targetMl: 2000, exerciseTargetMl: 2500, glassMl: 250, bottleMl: 350 }
};

/** Grams of alcohol: volume × ABV × ethanol density. */
export const alcoholGrams = (ml: number, abv: number) => Math.round(ml * (abv / 100) * 0.789 * 10) / 10;

const presetId = (key: keyof Presets) => `preset:${key}`;

export async function loadPresets(db: HealthDB): Promise<Presets> {
  const out: Presets = structuredClone(DEFAULT_PRESETS);
  const recs = await db.records.bulkGet((Object.keys(out) as (keyof Presets)[]).map(presetId));
  for (const r of recs) {
    if (r && !r.deleted) (out as unknown as Record<string, unknown>)[r.id.slice(7)] = (r.data as { value: unknown }).value;
  }
  return out;
}

export async function savePreset<K extends keyof Presets>(
  db: HealthDB,
  deviceId: string,
  key: K,
  value: Presets[K],
  now = Date.now()
): Promise<void> {
  const at = nowNaive(now);
  const rec: HealthRecord = {
    id: presetId(key),
    kind: 'preset',
    day: dayOf(at),
    at,
    updatedAt: now,
    deviceId,
    source: 'manual',
    data: { value }
  };
  await db.saveLocal([rec]);
}

/** Chart notes for supplements that were started or stopped in an edit. */
export function supplementChangeNotes(before: SupplementItem[], after: SupplementItem[]): string[] {
  const was = new Map(before.filter((s) => s.active).map((s) => [s.id, s.name]));
  const now = new Map(after.filter((s) => s.active).map((s) => [s.id, s.name]));
  const notes: string[] = [];
  for (const [id, name] of now) if (!was.has(id)) notes.push(`Started ${name}`);
  for (const [id, name] of was) if (!now.has(id)) notes.push(`Stopped ${name}`);
  return notes;
}
