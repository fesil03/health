// The day as a 24-hour watch dial: midnight at the top, like a GMT bezel.
// Last night's sleep is an arc on the bezel; each kind of entry sits on its own ring.
import type { CoffeeData, HealthRecord, SleepData, StoolData, WaterData } from '../lib/model';

const CX = 160;
const CY = 160;

export const DIAL_COLORS = {
  coffee: '#CDA36C',
  water: '#80B4E6',
  meal: '#8FCBC0',
  stool: '#BE8A57',
  supplement: '#9FC79C',
  drink: '#D88EA2',
  sleep: '#4F6694'
};

type Lane = keyof typeof DIAL_COLORS;
const LANES: { lane: Exclude<Lane, 'sleep'>; r: number; kinds: string[] }[] = [
  { lane: 'coffee', r: 118, kinds: ['coffee'] },
  { lane: 'water', r: 103, kinds: ['water'] },
  { lane: 'meal', r: 88, kinds: ['meal'] },
  { lane: 'stool', r: 73, kinds: ['stool'] },
  { lane: 'supplement', r: 58, kinds: ['supplement'] },
  { lane: 'drink', r: 43, kinds: ['alcohol', 'nicotine'] }
];

const hours = (naive: string) => Number(naive.slice(11, 13)) + Number(naive.slice(14, 16)) / 60;
const angle = (h: number) => ((h / 24) * 360 - 90) * (Math.PI / 180);
const pt = (h: number, r: number) => [CX + r * Math.cos(angle(h)), CY + r * Math.sin(angle(h))] as const;

/** Glyph per lane, so the dial reads without colour too. */
export function Glyph({ lane, x = 0, y = 0, rot = 0 }: { lane: Lane; x?: number; y?: number; rot?: number }) {
  const c = DIAL_COLORS[lane];
  const t = `translate(${x} ${y}) rotate(${rot})`;
  switch (lane) {
    case 'coffee':
      return <rect transform={t} x={-2} y={-6} width={4} height={12} rx={2} fill={c} />;
    case 'water':
      return <circle transform={t} r={3.6} fill={c} />;
    case 'meal':
      return <rect transform={t} x={-3.6} y={-3.6} width={7.2} height={7.2} rx={1.5} fill={c} />;
    case 'stool':
      return <path transform={t} d="M0 -4.6 L4.4 3.6 L-4.4 3.6 Z" fill={c} />;
    case 'supplement':
      return <circle transform={t} r={3.4} fill="none" stroke={c} strokeWidth={2} />;
    case 'drink':
      return <path transform={t} d="M0 -4.6 L4 0 L0 4.6 L-4 0 Z" fill={c} />;
    case 'sleep':
      return <rect transform={t} x={-6} y={-2.5} width={12} height={5} rx={2.5} fill={c} />;
  }
}

export function GlyphIcon({ lane }: { lane: Lane }) {
  return (
    <svg viewBox="-7 -7 14 14" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
      <Glyph lane={lane} />
    </svg>
  );
}

export interface DialProps {
  day: string;
  dayNumber: number;
  entries: HealthRecord[];
  sleep?: HealthRecord<SleepData>;
  nowHours: number | null; // null when not today
}

export function DayDial({ day, dayNumber, entries, sleep, nowHours }: DialProps) {
  const sleepArc = (() => {
    if (!sleep) return null;
    const start = sleep.at.slice(0, 10) < day ? 0 : hours(sleep.at);
    const end = hours(sleep.data.end);
    if (end <= start) return null;
    const r = 132;
    const [x1, y1] = pt(start, r);
    const [x2, y2] = pt(end, r);
    const large = end - start > 12 ? 1 : 0;
    return <path d={`M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2}`} stroke={DIAL_COLORS.sleep} strokeWidth={8} strokeLinecap="round" fill="none" />;
  })();

  const coffeeMg = entries.filter((e) => e.kind === 'coffee').reduce((s, e) => s + (e.data as CoffeeData).caffeineMg, 0);
  const water = entries.filter((e) => e.kind === 'water').reduce((s, e) => s + (e.data as WaterData).ml, 0);
  const stools = entries.filter((e) => e.kind === 'stool').length;
  const label =
    `Day dial for ${day}. ` +
    (sleep ? `Slept ${sleep.at.slice(11, 16)} to ${sleep.data.end.slice(11, 16)}. ` : '') +
    `${coffeeMg} mg caffeine, ${water} ml water, ${stools} stool entries.`;

  return (
    <svg viewBox="0 0 320 320" className="mx-auto block w-full max-w-[340px]" role="img" aria-label={label} data-testid="day-dial">
      {/* bezel */}
      <circle cx={CX} cy={CY} r={152} fill="#0F1A2D" />
      <circle cx={CX} cy={CY} r={127} fill="#15233B" />
      {sleepArc}
      {/* hour ticks and bezel numerals */}
      {Array.from({ length: 24 }, (_, h) => {
        if (h % 6 === 0) return null; // numerals sit here
        const major = h % 3 === 0;
        const [x1, y1] = pt(h, major ? 142 : 145);
        const [x2, y2] = pt(h, 149);
        return <line key={h} x1={x1} y1={y1} x2={x2} y2={y2} stroke={major ? '#E9D9AE' : '#7C899D'} strokeWidth={major ? 2 : 1} />;
      })}
      {[0, 6, 12, 18].map((h) => {
        const [x, y] = pt(h, 144);
        return (
          <text key={h} x={x} y={y + 4} textAnchor="middle" className="cond" fontSize={12} fontWeight={700} fill="#E9D9AE">
            {h}
          </text>
        );
      })}
      {/* lanes */}
      {LANES.map(({ lane, r }) => (
        <circle key={lane} cx={CX} cy={CY} r={r} fill="none" stroke="#2B3D5C" strokeWidth={1} strokeDasharray="1 4" />
      ))}
      {LANES.flatMap(({ lane, r, kinds }) =>
        entries
          .filter((e) => kinds.includes(e.kind))
          .map((e) => {
            const h = hours(e.at);
            const [x, y] = pt(h, r);
            const rot = (h / 24) * 360;
            const urgent = e.kind === 'stool' && (e.data as StoolData).bristol == null;
            return (
              <g key={e.id} opacity={urgent ? 0.7 : 1}>
                <Glyph lane={lane} x={x} y={y} rot={rot} />
              </g>
            );
          })
      )}
      {/* date window, like the one on a watch */}
      <rect x={CX - 14} y={CY + 14} width={28} height={19} rx={3} fill="#F2EFE6" />
      <text x={CX} y={CY + 28.5} textAnchor="middle" className="cond" fontSize={15} fontWeight={700} fill="#0F1A2D">
        {dayNumber}
      </text>
      {/* now hand */}
      {nowHours != null && (() => {
        const [x, y] = pt(nowHours, 128);
        const [tx, ty] = pt(nowHours + 12, 16);
        return (
          <g data-testid="now-hand">
            <line x1={tx} y1={ty} x2={x} y2={y} stroke="#E8743F" strokeWidth={2} strokeLinecap="round" />
            <circle cx={x} cy={y} r={3} fill="#E8743F" />
          </g>
        );
      })()}
      <circle cx={CX} cy={CY} r={5} fill="#E9D9AE" />
    </svg>
  );
}
