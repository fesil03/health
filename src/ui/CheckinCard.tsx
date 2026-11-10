import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../lib/db';
import {
  doneCheckins,
  dueCheckins,
  emptyCheckin,
  saveCheckin,
  SCREEN_TIME,
  type CheckinData,
  type CheckinType,
  type MorningData,
  type NightData
} from '../lib/checkins';
import { scheduleSync } from '../lib/syncClient';
import { nowNaive } from '../lib/time';
import { Chip, useToast, YesNo } from './kit';

/** The questions themselves; also used when editing a saved check-in from the day log. */
export function CheckinFields({ d, set, late }: { d: CheckinData; set: (d: CheckinData) => void; late?: boolean }) {
  if (d.type === 'morning') {
    const m = (c: Partial<MorningData>) => set({ ...d, ...c });
    return (
      <div className="divide-y divide-dial-rule">
        <YesNo label="Woke up rested?" value={d.rested} onChange={(rested) => m({ rested })} />
        <YesNo label="Slept through the night?" value={d.sleptThrough} onChange={(sleptThrough) => m({ sleptThrough })} />
        <YesNo label="Hit snooze?" value={d.snoozed} onChange={(snoozed) => m({ snoozed })} />
      </div>
    );
  }
  const n = (c: Partial<NightData>) => set({ ...d, ...c });
  return (
    <div className="space-y-3">
      <YesNo label={late ? 'Exercised yesterday?' : 'Exercised today?'} value={d.exercised} onChange={(exercised) => n({ exercised })} />
      <div>
        <span className="text-ink">Screen in bed before sleep</span>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Screen in bed before sleep">
          {SCREEN_TIME.map((s) => (
            <Chip key={s.id} active={d.screenInBed === s.id} onClick={() => n({ screenInBed: d.screenInBed === s.id ? null : s.id })}>
              {s.label}
            </Chip>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-steel-dim">Quick: under 15 min. A while: 15–45 min. A lot: 45 min or more.</p>
      </div>
    </div>
  );
}

function OneCheckin({ type, day, today, deviceId }: { type: CheckinType; day: string; today: string; deviceId: string }) {
  const [d, setD] = useState<CheckinData>(emptyCheckin(type));
  const toast = useToast();
  const answered = Object.entries(d).some(([k, v]) => k !== 'type' && v != null);
  const title = type === 'morning' ? 'Morning check-in' : day === today ? 'Night check-in' : "Last night's check-in";
  return (
    <section className="section" aria-label={title}>
      <h2 className="title mb-2">{title}</h2>
      <CheckinFields d={d} set={setD} late={day !== today} />
      <div className="mt-3 flex gap-2">
        <button
          className="btn flex-1"
          disabled={!answered}
          onClick={async () => {
            await saveCheckin({ db, deviceId, at: nowNaive() }, day, d);
            scheduleSync();
            toast({ text: `${title} saved` });
          }}
        >
          Save
        </button>
        <button
          className="btn-ghost"
          onClick={async () => {
            const skipped = await db.getSetting<string[]>('checkinSkipped', []);
            await db.setSetting('checkinSkipped', [...skipped.slice(-20), `${type}:${day}`]);
          }}
        >
          Not now
        </button>
      </div>
    </section>
  );
}

/** Shows whichever check-ins are due right now and not yet answered or skipped. */
export function CheckinCards({ today, hour, deviceId }: { today: string; hour: number; deviceId: string }) {
  const due = useLiveQuery(async () => {
    const list = dueCheckins(nowNaive());
    const done = await doneCheckins(db, list);
    const skipped = new Set(await db.getSetting<string[]>('checkinSkipped', []));
    return list.filter((c) => !done.has(`checkin:${c.type}:${c.day}`) && !skipped.has(`${c.type}:${c.day}`));
  }, [today, hour]);
  if (!due?.length) return null;
  return (
    <div data-testid="checkins">
      {due.map((c) => (
        <OneCheckin key={`${c.type}:${c.day}`} {...c} today={today} deviceId={deviceId} />
      ))}
    </div>
  );
}
