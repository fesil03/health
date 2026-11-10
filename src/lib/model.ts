// Every piece of data in the app is a HealthRecord. Records are merged across
// devices by `id`; the newest `updatedAt` wins. Deletes are tombstones.

export type SamsungKind =
  | 'sleep'
  | 'sleep_stage'
  | 'hr_hourly'
  | 'stress_hourly'
  | 'steps_daily'
  | 'spo2'
  | 'exercise'
  | 'energy' // from the watch bridge
  | 'skin_temp'; // from the watch bridge

export type LogKind = 'stool' | 'coffee' | 'alcohol' | 'nicotine' | 'body' | 'supplement' | 'meal' | 'lab' | 'note' | 'symptom' | 'checkin';

/** `water` comes from both Samsung and the app's taps. `preset` holds synced preset lists. */
export type Kind = SamsungKind | LogKind | 'water' | 'preset';

export interface HealthRecord<D = unknown> {
  id: string; // stable across devices; Samsung rows use `samsung:<kind>:<datauuid>`
  kind: Kind;
  day: string; // local date the record belongs to, YYYY-MM-DD
  at: string; // local naive time, YYYY-MM-DDTHH:mm:ss
  updatedAt: number; // ms since epoch, last edit
  deviceId: string; // device that made the last edit
  deleted?: boolean; // tombstone
  source: 'samsung' | 'manual' | 'paste';
  data: D;
}

export interface SleepData {
  end: string; // local naive
  score: number | null;
  durationMin: number | null;
  efficiency: number | null;
}
export interface SleepStageData {
  sleepId: string;
  end: string;
  stage: 'awake' | 'light' | 'deep' | 'rem' | 'unknown';
}
export interface HourlyData {
  end: string;
  avg: number;
  min: number | null;
  max: number | null;
  n?: number; // readings in the hour (watch bridge)
}
export interface StepsData {
  steps: number;
  distanceM: number | null;
}
export interface Spo2Data {
  end: string;
  avg: number;
  min: number | null;
}
export interface ExerciseData {
  end: string;
  typeCode: number;
  type: string;
  durationMin: number;
  kcal: number | null;
  meanHr: number | null;
  // Extra fields the watch bridge adds when Samsung Health has them
  maxHr?: number | null;
  distanceM?: number | null;
  vo2Max?: number | null;
  title?: string;
}
/** Samsung's daily energy score, 0-100. */
export interface EnergyData {
  score: number;
}
export interface SkinTempData {
  end: string;
  avg: number;
  min: number | null;
  max: number | null;
}
export interface WaterData {
  ml: number;
}

// ---- Phase 2: things logged in the app ----

export type StoolColor = 'brown' | 'yellow' | 'green' | 'black' | 'red' | 'pale';
export interface StoolData {
  bristol: number | null; // 1-7, null until details are added
  color: StoolColor | null;
  ease: number | null; // 1 easy … 4 hard straining
  urgent: boolean | null;
  complete: boolean | null;
  blood: boolean | null;
  durationMin: number | null;
  note?: string;
}

export interface CoffeeData {
  presetId: string;
  name: string;
  shots: number;
  mgPerShot: number;
  caffeineMg: number;
  estimated: boolean; // café drinks: shot count is a guess
  milk: string;
}

export interface AlcoholData {
  presetId: string;
  name: string;
  ml: number;
  abv: number; // percent
  grams: number;
}

export type NicotineForm = 'cigarette' | 'vape' | 'pouch';
export interface NicotineData {
  form: NicotineForm;
  count: number;
}

export interface BodyData {
  kg: number | null;
  fatPct: number | null;
}

export interface SupplementData {
  supplementId: string;
  name: string;
}

/** 1 mild, 2 moderate, 3 strong. */
export type Severity = 1 | 2 | 3;
export interface SymptomData {
  symptomId: string;
  name: string;
  severity: Severity | null;
  note?: string;
}

export interface MealData {
  meal: string;
  items: string;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  oilHeavy: boolean | null;
  note?: string;
}

export interface LabMarker {
  marker: string;
  value: string; // as printed, e.g. "32" or "<0.5"
  num: number | null;
  unit: string;
  refLow: number | null;
  refHigh: number | null;
}
export interface LabData {
  lab: string;
  markers: LabMarker[];
}

/** Chart notes, e.g. "Started folic acid". */
export interface NoteData {
  text: string;
  auto?: boolean;
}
