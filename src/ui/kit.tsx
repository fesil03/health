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
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-dial-deep/70 backdrop-blur-[2px]" onClick={onClose} role="dialog" aria-label={title}>
      <div
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-t-[28px] bg-dial-raised px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_40px_rgba(5,10,20,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="title text-xl">{title}</h2>
          <button className="-mr-2 px-2 text-2xl leading-none text-steel" aria-label="Close" onClick={onClose}>
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
        <div className="fixed inset-x-0 top-[calc(3.75rem+env(safe-area-inset-top))] z-40 flex justify-center px-4" key={msg.key}>
          <div role="status" className="flex max-w-md items-center gap-4 rounded-2xl bg-ink px-4 py-3 text-sm text-dial-deep shadow-[0_8px_30px_rgba(5,10,20,0.45)]">
            <span className="flex-1">{msg.text}</span>
            {msg.actions?.map((a) => (
              <button
                key={a.label}
                className="font-semibold text-dial underline decoration-dial/30 underline-offset-4"
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
      <button className="btn-ghost h-11 w-11 p-0 text-lg" aria-label={`Less ${label}`} onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <span className="cond w-10 text-center text-xl font-semibold">{value}</span>
      <button className="btn-ghost h-11 w-11 p-0 text-lg" aria-label={`More ${label}`} onClick={() => onChange(value + step)}>
        +
      </button>
    </div>
  );
}

/** Yes / No / unanswered */
export function YesNo({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean | null) => void }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-ink">{label}</span>
      <div className="flex gap-1" role="group" aria-label={label}>
        {([true, false] as const).map((v) => (
          <button
            key={String(v)}
            aria-pressed={value === v}
            className={`rounded-full px-3.5 py-1 text-sm ${value === v ? 'bg-lume font-semibold text-dial-deep' : 'border border-dial-rule text-steel'}`}
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
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3.5 py-2 text-sm transition-transform active:scale-95 ${
        active ? 'border-lume bg-lume font-semibold text-dial-deep' : 'border-steel-dim/50 text-ink'
      }`}
    >
      {children}
    </button>
  );
}

/** "2026-11-08T09:05:00" <-> datetime-local input value */
export const toInput = (naive: string) => naive.slice(0, 16);
export const fromInput = (v: string) => (v.length === 16 ? `${v}:00` : v);
