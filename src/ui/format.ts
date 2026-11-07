export const hm = (mins: number | null | undefined) =>
  mins == null ? '–' : `${Math.floor(mins / 60)}h ${String(Math.round(mins % 60)).padStart(2, '0')}m`;

export const clock = (naive: string) => naive.slice(11, 16);

export function ago(ms?: number): string {
  if (!ms) return 'never';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export const shortDay = (day: string) => {
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

/** "5 Nov → 7 Nov" this year, "19 Sep 2024 → 7 Nov 2026" otherwise. */
export function range(first?: string, last?: string): string {
  if (!first || !last) return '–';
  const thisYear = String(new Date().getFullYear());
  const f = (d: string) => {
    const s = new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return first.startsWith(thisYear) && last.startsWith(thisYear) ? s : `${s} ${d.slice(0, 4)}`;
  };
  return first === last ? f(first) : `${f(first)} → ${f(last)}`;
}
