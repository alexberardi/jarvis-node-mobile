/**
 * A scheduled errand as the CC mobile schedules endpoint returns it
 * (`GET /api/v0/mobile/household/{id}/schedules`). The display strings
 * (`cadence`, `next_local`, `description`) are computed server-side so the
 * schedules screen and the "what errands do I have scheduled?" voice card read a
 * cadence identically — the screen just renders them.
 */
export interface ScheduleView {
  id: string;
  /** What the errand will do — the goal the schedule re-plans each fire. */
  intent: string;
  /** active | paused (the list only returns live ones). */
  state: string;
  /** Next fire, ISO-8601 UTC (or null). */
  next_fire_at: string | null;
  /** Recurrence spec as JSON (cron/interval), or null for a one-time errand. */
  recurrence: string | null;
  timezone: string | null;
  last_fired_at: string | null;
  /** True when it repeats (recurrence set). */
  is_recurring: boolean;
  /** Human cadence, e.g. "every day at 9:00 AM" | "on weekdays" | "once". */
  cadence: string;
  /** Next fire in the schedule's local zone, e.g. "Tue Aug 5, 9:00 AM" ("" if none). */
  next_local: string;
  /** One-line "intent · cadence · next …" summary. */
  description: string;
}
