// Runs only on a machine that has a real Samsung export (never committed).
// Usage: HEALTH_EXPORT_DIR=/path/to/csvs npm run test:real
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSamsungExport } from '../src/lib/samsung/parse';

const dir = process.env.HEALTH_EXPORT_DIR;

describe.runIf(!!dir)('real Samsung export', () => {
  const files = !dir
    ? []
    : readdirSync(dir)
        .filter((f) => f.endsWith('.csv'))
        .map((f) => ({ path: f, text: readFileSync(join(dir, f), 'utf8') }));
  const results = parseSamsungExport(files, 'test-device', Date.UTC(2026, 10, 7, 12));
  const by = Object.fromEntries(results.map((r) => [r.kind, r]));

  it('reads every kind present', () => {
    console.table(
      results.map((r) => ({
        kind: r.kind,
        rows: r.rows,
        kept: r.records.length,
        dropped: r.dropped,
        first: r.records.map((x) => x.day).sort()[0],
        last: r.records.map((x) => x.day).sort().at(-1)
      }))
    );
    expect(results.length).toBeGreaterThanOrEqual(7);
  });

  it('drops the impossible 2089 stress reading', () => {
    expect(by.stress_hourly.records.some((r) => r.day > '2027')).toBe(false);
    expect(by.stress_hourly.dropped).toBeGreaterThanOrEqual(1);
  });

  it('puts sleep on the wake-up day in local time', () => {
    const night = by.sleep.records.find((r) => r.day === '2026-11-07');
    expect(night?.at).toBe('2026-11-07T00:47:58');
    expect((night?.data as { score: number }).score).toBe(88);
  });

  it('files every sleep stage under a sleep night', () => {
    const nights = new Set(by.sleep.records.map((r) => r.day));
    const orphans = by.sleep_stage.records.filter((r) => !nights.has(r.day));
    expect(orphans.length / by.sleep_stage.records.length).toBeLessThan(0.05);
  });

  it('keeps one step total per day', () => {
    const days = by.steps_daily.records.map((r) => r.day);
    expect(new Set(days).size).toBe(days.length);
  });
});
