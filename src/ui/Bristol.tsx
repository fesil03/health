// Simple drawings of the 7 Bristol stool types, for the picker.
const C = '#a16207';

export const BRISTOL_LABELS = [
  '',
  'Separate hard lumps',
  'Lumpy sausage',
  'Sausage with cracks',
  'Smooth, soft sausage',
  'Soft blobs, clear edges',
  'Mushy, ragged pieces',
  'Watery, no pieces'
];

export function BristolIcon({ type }: { type: number }) {
  return (
    <svg viewBox="0 0 64 24" className="h-6 w-16" aria-hidden="true">
      {type === 1 && [8, 22, 36, 50].map((x) => <circle key={x} cx={x} cy={12} r={5} fill={C} />)}
      {type === 2 && (
        <g fill={C}>
          {[12, 22, 32, 42, 52].map((x) => (
            <circle key={x} cx={x} cy={12} r={6} />
          ))}
        </g>
      )}
      {type === 3 && (
        <g>
          <rect x={6} y={6} width={52} height={12} rx={6} fill={C} />
          {[20, 32, 44].map((x) => (
            <path key={x} d={`M${x} 6 l2 5 l-2 2`} stroke="#0f172a" strokeWidth={1.5} fill="none" />
          ))}
        </g>
      )}
      {type === 4 && <rect x={4} y={7} width={56} height={10} rx={5} fill={C} />}
      {type === 5 && [10, 26, 42, 54].map((x, i) => <ellipse key={x} cx={x} cy={12 + (i % 2) * 2} rx={6} ry={4} fill={C} />)}
      {type === 6 && <path d="M6 14 q4 -8 10 -2 q4 -6 9 0 q5 -7 10 0 q4 -6 9 0 q5 -6 10 1 q-5 6 -10 3 q-5 5 -10 0 q-5 5 -9 0 q-5 5 -10 0 q-5 4 -9 -2z" fill={C} />}
      {type === 7 && <path d="M4 15 q8 -6 16 0 t16 0 t16 0 t8 -2 v5 h-56z" fill={C} opacity={0.7} />}
    </svg>
  );
}

export function BristolPicker({ value, onChange }: { value: number | null; onChange: (n: number) => void }) {
  return (
    <div className="grid grid-cols-1 gap-1" role="radiogroup" aria-label="Bristol type">
      {[1, 2, 3, 4, 5, 6, 7].map((t) => (
        <button
          key={t}
          role="radio"
          aria-checked={value === t}
          aria-label={`Type ${t}`}
          onClick={() => onChange(t)}
          className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm ${
            value === t ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800'
          }`}
        >
          <span className="w-4 font-semibold tabular-nums">{t}</span>
          <BristolIcon type={t} />
          <span className="flex-1 text-slate-300">{BRISTOL_LABELS[t]}</span>
          <span className="text-xs text-slate-500">{t <= 2 ? 'hard' : t <= 4 ? 'normal' : 'loose'}</span>
        </button>
      ))}
    </div>
  );
}
