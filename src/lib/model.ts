// Every piece of data in the app is a HealthRecord. Records are merged across
// devices by `id`; the newest `updatedAt` wins. Deletes are tombstones.

export type Kind =
  | 'sleep'
  | 'sleep_stage'
  | 'hr_hourly'
  | 'stress_hourly'
  | 'steps_daily'
  | 'spo2'
  | 'exercise'
  | 'water';

export interface HealthRecord<D = Record<string, unknown>> {
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
}
export interface WaterData {
  ml: number;
}
