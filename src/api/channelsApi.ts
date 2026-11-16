/**
 * Chat-service channels: talk to Jarvis from Discord, Slack and the like (jarvisd
 * `docs/CHANNELS.md`, `internal/modules/cc/channels_wire.go`).
 *
 * A channel is a package running on one of the household's nodes; the server lists the ones
 * that have called in. Nothing here knows any one service: a provider is just its name.
 * Every member can link their own account, change their own settings and unlink.
 */
import { getCommandCenterUrl } from '../config/serviceConfig';
import apiClient from './apiClient';

/** One channel of the household, with the caller's link to it. */
export interface Channel {
  /** The service's name as its package chose it, e.g. `discord`. */
  provider: string;
  /** Its package is running on a node right now. */
  online: boolean;
  linked: boolean;
  /** Present when linked. */
  node_id?: string;
  /** Reminders, alarms and timers also go to the caller's direct messages there. */
  proactive?: boolean;
}

/** `POST .../link-code`: the code to send to Jarvis on that service before it expires. */
export interface ChannelLinkCode {
  code: string;
  expires_in: number;
}

const base = (householdId: string) =>
  `${getCommandCenterUrl()}/api/v0/mobile/household/${householdId}/channels`;

export const listChannels = async (householdId: string): Promise<Channel[]> =>
  (await apiClient.get<{ channels: Channel[] }>(base(householdId))).data.channels ?? [];

/** `nodeId` may be omitted when the household has exactly one node. */
export const createChannelLinkCode = async (
  householdId: string,
  provider: string,
  nodeId?: string,
): Promise<ChannelLinkCode> =>
  (
    await apiClient.post<ChannelLinkCode>(
      `${base(householdId)}/${provider}/link-code`,
      nodeId ? { node_id: nodeId } : {},
    )
  ).data;

export const setChannelPrefs = async (
  householdId: string,
  provider: string,
  prefs: { node_id?: string; proactive?: boolean },
): Promise<Channel> =>
  (await apiClient.put<Channel>(`${base(householdId)}/${provider}/me`, prefs)).data;

export const unlinkChannel = async (householdId: string, provider: string): Promise<void> => {
  await apiClient.delete(`${base(householdId)}/${provider}/me`);
};
