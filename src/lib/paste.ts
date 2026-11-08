// Parsers for the blocks Claude writes in the chat: `#meal v1` and `#labs v1`.
import type { HealthRecord, LabData, LabMarker, MealData } from './model';
import { dayOf } from './time';

export interface ParsedMeal {
  at: string | null; // local naive; null = use "now"
  data: MealData;
}
export interface ParsedLabs {
  date: string;
  data: LabData;
}
export interface PasteResult {
  meals: ParsedMeal[];
  labs: ParsedLabs[];
  errors: string[];
}

const num = (s: string | undefined): number | null => {
  if (!s) return null;
  const m = /-?\d+(?:[.,]\d+)?/.exec(s.replace(/\s/g, ''));
  return m ? Number(m[0].replace(',', '.')) : null;
};
const yes = (s: string | undefined): boolean | null => {
  if (!s) return null;
  if (/^(y|yes|true|sim|s|1)$/i.test(s.trim())) return true;
  if (/^(n|no|false|não|nao|0)$/i.test(s.trim())) return false;
  return null;
};

/** "2026-11-07 13:14" / "2026-11-07T13:14" -> naive local. */
function parseTime(s: string | undefined): string | null {
  const m = /(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/.exec(s ?? '');
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4].padStart(2, '0')}:${m[5]}:00`;
}

/** Splits text into blocks starting with #meal or #labs; tolerates code fences and full-width colons. */
function blocks(text: string): { tag: 'meal' | 'labs'; lines: string[] }[] {
  const out: { tag: 'meal' | 'labs'; lines: string[] }[] = [];
  let cur: { tag: 'meal' | 'labs'; lines: string[] } | null = null;
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.replace(/：/g, ':').trim();
    if (!line || line.startsWith('```')) continue;
    const head = /^#(meal|labs)\b/i.exec(line);
    if (head) {
      cur = { tag: head[1].toLowerCase() as 'meal' | 'labs', lines: [] };
      out.push(cur);
    } else if (cur) cur.lines.push(line);
  }
  return out;
}

function kv(lines: string[]): { map: Record<string, string>; rest: string[] } {
  const map: Record<string, string> = {};
  const rest: string[] = [];
  for (const l of lines) {
    const m = /^([a-z_ ]+?)\s*:\s*(.*)$/i.exec(l);
    if (m && !l.includes('|')) map[m[1].trim().toLowerCase().replace(/ /g, '_')] = m[2].trim();
    else rest.push(l);
  }
  return { map, rest };
}

const MEAL_KEYS = ['time', 'meal', 'items', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'oil_heavy', 'note'];

export function parsePaste(text: string): PasteResult {
  const res: PasteResult = { meals: [], labs: [], errors: [] };
  const found = blocks(text);
  if (!found.length) res.errors.push('No #meal or #labs block found.');
  for (const b of found) {
    const { map, rest } = kv(b.lines);
    if (b.tag === 'meal') {
      if (!map.items) {
        res.errors.push('A #meal block has no "items" line.');
        continue;
      }
      const extra = Object.entries(map)
        .filter(([k]) => !MEAL_KEYS.includes(k))
        .map(([k, v]) => `${k}: ${v}`);
      const note = [map.note, ...extra, ...rest].filter(Boolean).join('; ');
      res.meals.push({
        at: parseTime(map.time),
        data: {
          meal: map.meal || 'meal',
          items: map.items,
          kcal: num(map.kcal),
          proteinG: num(map.protein_g),
          carbsG: num(map.carbs_g),
          fatG: num(map.fat_g),
          fiberG: num(map.fiber_g),
          oilHeavy: yes(map.oil_heavy),
          ...(note ? { note } : {})
        }
      });
    } else {
      const date = /(\d{4}-\d{2}-\d{2})/.exec(map.date ?? '')?.[1];
      if (!date) {
        res.errors.push('A #labs block has no valid "date: YYYY-MM-DD" line.');
        continue;
      }
      const markers: LabMarker[] = [];
      for (const l of rest) {
        const cells = l.split('|').map((c) => c.trim());
        if (cells.length < 2 || /^marker$/i.test(cells[0]) || /^-+$/.test(cells[0])) continue;
        const [marker, value = '', unit = '', lo, hi] = cells;
        markers.push({ marker, value, num: num(value), unit, refLow: num(lo), refHigh: num(hi) });
      }
      if (!markers.length) {
        res.errors.push(`The #labs block for ${date} has no marker rows.`);
        continue;
      }
      res.labs.push({ date, data: { lab: map.lab || 'Lab', markers } });
    }
  }
  return res;
}

/** Stable id from content, so pasting the same block twice doesn't duplicate it. */
export function contentId(prefix: string, s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `${prefix}:${(h >>> 0).toString(36)}`;
}

export function pasteToRecords(p: PasteResult, deviceId: string, nowAt: string, now = Date.now()): HealthRecord[] {
  const out: HealthRecord[] = [];
  for (const m of p.meals) {
    const at = m.at ?? nowAt;
    out.push({
      id: contentId('meal', `${at}|${m.data.items}`),
      kind: 'meal',
      day: dayOf(at),
      at,
      updatedAt: now,
      deviceId,
      source: 'paste',
      data: m.data
    });
  }
  for (const l of p.labs) {
    out.push({
      id: contentId('lab', `${l.date}|${l.data.lab}`),
      kind: 'lab',
      day: l.date,
      at: `${l.date}T08:00:00`,
      updatedAt: now,
      deviceId,
      source: 'paste',
      data: l.data
    });
  }
  return out;
}

export interface PastePlanItem {
  rec: HealthRecord;
  /** already in the app (and not deleted): skipped, so edits made in the app are kept */
  exists: boolean;
}

/** What a paste would add: every block with a flag for ones already logged. */
export async function planPaste(
  db: { records: { bulkGet(ids: string[]): Promise<(HealthRecord | undefined)[]> } },
  p: PasteResult,
  deviceId: string,
  nowAt: string,
  now = Date.now()
): Promise<PastePlanItem[]> {
  const recs = pasteToRecords(p, deviceId, nowAt, now);
  const existing = await db.records.bulkGet(recs.map((r) => r.id));
  return recs.map((rec, i) => ({ rec, exists: !!existing[i] && !existing[i]!.deleted }));
}

/** "2 meals and 1 lab result set" */
export function describeCounts(meals: number, labs: number): string {
  const parts = [];
  if (meals) parts.push(`${meals} ${meals === 1 ? 'meal' : 'meals'}`);
  if (labs) parts.push(`${labs} lab result ${labs === 1 ? 'set' : 'sets'}`);
  return parts.join(' and ');
}
