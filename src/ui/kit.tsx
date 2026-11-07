// Small shared UI pieces: bottom sheet, toast with undo, steppers, toggles.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { getDeviceId } from '../lib/db';

export function useDeviceId(): string {
  const [id, setId] = useState('');
  useEffect(() => void getDeviceId().then(setId), []);
  return id;
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60" onClick={onClose} role="dialog" aria-label={title}>
      <div
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-slate-800 bg-slate-900 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="px-2 text-2xl leading-none text-slate-400" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

interface ToastMsg {
  text: string;
  actions?: { label: string; run: () => void }[];
}
const ToastCtx = createContext<(m: ToastMsg) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<(ToastMsg & { key: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const show = useCallback((m: ToastMsg) => {
    clearTimeout(timer.current);
    setMsg({ ...m, key: Date.now() });
    timer.current = setTimeout(() => setMsg(null), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4" key={msg.key}>
          <div role="status" className="flex max-w-md items-center gap-3 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-900 shadow-lg">
            <span className="flex-1">{msg.text}</span>
            {msg.actions?.map((a) => (
              <button
                key={a.label}
                className="font-semibold text-emerald-700"
                onClick={() => {
                  setMsg(null);
                  a.run();
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export function Stepper({ value, onChange, min = 0, step = 1, label }: { value: number; onChange: (n: number) => void; min?: number; step?: number; label: string }) {
  return (
    <div className="flex items-center gap-3" aria-label={label}>
      <button className="btn-ghost w-11" aria-label={`Less ${label}`} onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <span className="w-10 text-center text-lg tabular-nums">{value}</span>
      <button className="btn-ghost w-11" aria-label={`More ${label}`} onClick={() => onChange(value + step)}>
        +
      </button>
    </div>
  );
}

/** Yes / No / unanswered */
export function YesNo({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean | null) => void }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-slate-300">{label}</span>
      <div className="flex gap-1" role="group" aria-label={label}>
        {([true, false] as const).map((v) => (
          <button
            key={String(v)}
            aria-pressed={value === v}
            className={`rounded-lg px-3 py-1 text-sm ${value === v ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}
            onClick={() => onChange(value === v ? null : v)}
          >
            {v ? 'Yes' : 'No'}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Chip({ children, onClick, active, label }: { children: ReactNode; onClick: () => void; active?: boolean; label?: string }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-sm active:scale-95 ${
        active ? 'border-emerald-500 bg-emerald-500/15 text-emerald-200' : 'border-slate-700 bg-slate-800/60 text-slate-100'
      }`}
    >
      {children}
    </button>
  );
}

/** "2026-11-08T09:05:00" <-> datetime-local input value */
export const toInput = (naive: string) => naive.slice(0, 16);
export const fromInput = (v: string) => (v.length === 16 ? `${v}:00` : v);
