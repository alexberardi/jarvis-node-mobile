export interface RoutineStepArg {
  key: string;
  value: string;
}

export interface RoutineStep {
  command: string;
  args: RoutineStepArg[];
  label: string;
}

export type ResponseLength = 'short' | 'medium' | 'long';
export type ScheduleType = 'interval' | 'cron';
export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const ALL_DAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const WEEKDAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
export const WEEKENDS: DayOfWeek[] = ['sat', 'sun'];

/** Minutes-based presets for the interval schedule picker. */
export const INTERVAL_PRESETS = [15, 30, 60, 120, 240, 360, 720] as const;

/**
 * A routine schedule. `null` on a Routine means voice / run-now only.
 *  - interval: fire every `interval_seconds`.
 *  - cron: fire on a 5-field crontab string, evaluated in `timezone`.
 * `target_node_id` is which node a scheduled run fires on (defaults to the
 * household primary node, resolved server-side when omitted).
 */
export interface RoutineSchedule {
  type: ScheduleType;
  cron?: string | null;
  interval_seconds?: number | null;
  timezone: string;
  target_node_id?: string | null;
  enabled: boolean;
  last_fired_at?: string | null;
}

export interface Routine {
  id: string;
  slug?: string;
  name: string;
  trigger_phrases: string[];
  steps: RoutineStep[];
  response_instruction: string;
  response_length: ResponseLength;
  schedule: RoutineSchedule | null;
  enabled?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}
