// Samsung stores times in UTC with a separate `time_offset` like "UTC+0800".
// The app works in local naive time strings: YYYY-MM-DDTHH:mm:ss.

const pad = (n: number) => String(n).padStart(2, '0');

export function parseOffsetMinutes(offset: string | undefined): number {
  const m = /^UTC([+-])(\d{2})(\d{2})$/.exec((offset ?? '').trim());
  if (!m) return 8 * 60; // default: Beijing
  const mins = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === '-' ? -mins : mins;
}

/** "2026-11-06 16:47:58.000" (UTC) + "UTC+0800" -> "2026-11-07T00:47:58" */
export function utcToLocal(utc: string, offset: string | undefined): string | null {
  const ms = parseUtcMs(utc);
  if (ms === null) return null;
  return msToNaive(ms + parseOffsetMinutes(offset) * 60_000);
}

export function parseUtcMs(utc: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec((utc ?? '').trim());
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

/** Formats an epoch value as if it were UTC: used for already-shifted times. */
export function msToNaive(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

export const dayOf = (naive: string) => naive.slice(0, 10);
export const monthOf = (naive: string) => naive.slice(0, 7);

/** Real-world sanity window: no data before 2010, none more than a day ahead. */
export function isPlausible(naive: string, nowMs = Date.now()): boolean {
  const ms = parseUtcMs(naive.replace('T', ' '));
  if (ms === null) return false;
  return ms >= Date.UTC(2010, 0, 1) && ms <= nowMs + 2 * 86_400_000;
}

export function minutesBetween(a: string, b: string): number {
  const x = parseUtcMs(a.replace('T', ' '));
  const y = parseUtcMs(b.replace('T', ' '));
  return x === null || y === null ? 0 : Math.round((y - x) / 60_000);
}
