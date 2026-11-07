// One colour and one shape per kind of entry, used everywhere the kind appears.

export const KIND_COLORS = {
  coffee: '#CDA36C',
  water: '#80B4E6',
  meal: '#8FCBC0',
  stool: '#BE8A57',
  supplement: '#9FC79C',
  drink: '#D88EA2',
  sleep: '#4F6694'
};

type Lane = keyof typeof KIND_COLORS;

/** Shape per kind, so it reads without colour too. */
export function Glyph({ lane, x = 0, y = 0, rot = 0 }: { lane: Lane; x?: number; y?: number; rot?: number }) {
  const c = KIND_COLORS[lane];
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
