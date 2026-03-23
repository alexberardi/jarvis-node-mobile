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
export type SummaryStyle = 'compact' | 'detailed';
export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const ALL_DAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const WEEKDAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
export const WEEKENDS: DayOfWeek[] = ['sat', 'sun'];

export const INTERVAL_PRESETS = [5, 15, 30, 60, 120, 240] as const;
export const TTL_PRESETS = [15, 30, 60, 240, 480, 1440] as const;

export interface RoutineBackground {
  enabled: boolean;
  schedule_type: ScheduleType;
  interval_minutes: number;
  run_on_startup: boolean;
  days: DayOfWeek[];
  time: string;
  summary_style: SummaryStyle;
  alert_priority: 1 | 2 | 3;
  alert_ttl_minutes: number;
}

export interface RoutinePlaceholder {
  type: 'device';
  domain: string;
  label: string;
  required: boolean;
}

export type RoutineStatus = 'ready' | 'needs_config' | 'missing_commands';

export interface Routine {
  id: string;
  name: string;
  trigger_phrases: string[];
  steps: RoutineStep[];
  response_instruction: string;
  response_length: ResponseLength;
  background: RoutineBackground | null;
  placeholders?: Record<string, RoutinePlaceholder>;
  required_commands?: string[];
}

export const DEFAULT_BACKGROUND: RoutineBackground = {
  enabled: true,
  schedule_type: 'interval',
  interval_minutes: 30,
  run_on_startup: true,
  days: [...ALL_DAYS],
  time: '08:00',
  summary_style: 'compact',
  alert_priority: 2,
  alert_ttl_minutes: 240,
};
