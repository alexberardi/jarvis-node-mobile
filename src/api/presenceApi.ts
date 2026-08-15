/**
 * Mobile presence reporting (jarvis-command-center).
 *
 * The phone is a presence *producer* on the Signal Bus: it decides home/away
 * on-device (see services/presenceService.ts) and POSTs just that binary state
 * here. CC writes a `presence.seen`/`presence.left` Signal server-side, scoped
 * to the calling user by their JWT — the phone can only ever report its OWN
 * user's presence. The JWT is attached automatically by apiClient.
 *
 * The PRECISE home coordinate never travels over this API — only the decision.
 */
import { getCommandCenterUrl } from '../config/serviceConfig';
import apiClient from './apiClient';

export type PresenceState = 'home' | 'away';

export interface PresenceResult {
  ok: boolean;
  signal_id: number;
  kind: string;
}

interface PresenceBody {
  household_id: string;
  state: PresenceState;
  /**
   * Display name for the signal summary ("Alex is home"). Display-only and
   * self-scoped — CC binds identity to the JWT's user_id, not this field.
   */
  name?: string;
}

/**
 * Report the calling user's home/away presence for a household.
 *
 * @param householdId The household this presence is about (the active household).
 * @param state       'home' (arrived / inside the geofence) or 'away' (left).
 * @param name        Optional display name for the "<name> is home" summary.
 */
export const reportPresence = async (
  householdId: string,
  state: PresenceState,
  name?: string,
): Promise<PresenceResult> => {
  const body: PresenceBody = { household_id: householdId, state };
  if (name) body.name = name;
  const res = await apiClient.post<PresenceResult>(
    `${getCommandCenterUrl()}/api/v0/mobile/presence`,
    body,
  );
  return res.data;
};
