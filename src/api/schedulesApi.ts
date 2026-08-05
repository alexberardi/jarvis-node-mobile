/**
 * Scheduled errands (jarvis-command-center).
 *
 * Talks to CC's `/api/v0/mobile/household/{id}/schedules` endpoints — the same
 * live one-time + recurring schedules the "what errands do I have scheduled?"
 * voice card lists. Authorized by the caller's role in the household (member).
 * The JWT is attached automatically by apiClient.
 */
import { getCommandCenterUrl } from '../config/serviceConfig';
import type { ScheduleView } from '../types/Schedule';
import apiClient from './apiClient';

const base = (householdId: string) =>
  `${getCommandCenterUrl()}/api/v0/mobile/household/${householdId}/schedules`;

/** The household's live scheduled + recurring errands, enriched for display. */
export const listSchedules = async (householdId: string): Promise<ScheduleView[]> => {
  const res = await apiClient.get<{ household_id: string; schedules: ScheduleView[] }>(
    base(householdId),
  );
  return res.data.schedules;
};

/**
 * Cancel a schedule so it stops firing. Idempotent server-side. Returns the
 * REFRESHED list so the screen can update in place off one round-trip.
 */
export const cancelSchedule = async (
  householdId: string,
  scheduleId: string,
): Promise<ScheduleView[]> => {
  const res = await apiClient.post<{ cancelled: boolean; schedules: ScheduleView[] }>(
    `${base(householdId)}/${scheduleId}/cancel`,
    {},
  );
  return res.data.schedules;
};
