/**
 * The caller's own Discord link (jarvisd `internal/modules/cc/discord_wire.go`).
 *
 * Talks to CC's `/api/v0/mobile/household/{id}/discord*` routes, open to any household
 * member: link my Discord account, change my own Discord settings, unlink. The bot itself
 * (token, server, channel) is set by an admin through the household settings.
 */
import { getCommandCenterUrl } from '../config/serviceConfig';
import apiClient from './apiClient';

/** `GET .../discord`: whether the bridge is on and connected, and the caller's link. */
export interface DiscordStatus {
  /** The household turned the bridge on. */
  enabled: boolean;
  /** The bot is connected to Discord right now. */
  online: boolean;
  linked: boolean;
  /** Present when linked. */
  node_id?: string;
  voice_replies?: VoiceReplies;
  /** Reminders and alarms go to the caller's Discord direct messages. */
  proactive?: boolean;
}

export type VoiceReplies = 'auto' | 'always' | 'never';

/** `POST .../discord/link-code`: send `/jarvis link <code>` to the bot before it expires. */
export interface DiscordLinkCode {
  code: string;
  expires_in: number;
}

const base = (householdId: string) =>
  `${getCommandCenterUrl()}/api/v0/mobile/household/${householdId}/discord`;

export const getDiscordStatus = async (householdId: string): Promise<DiscordStatus> =>
  (await apiClient.get<DiscordStatus>(base(householdId))).data;

/** `nodeId` may be omitted when the household has exactly one node. */
export const createDiscordLinkCode = async (
  householdId: string,
  nodeId?: string,
): Promise<DiscordLinkCode> =>
  (
    await apiClient.post<DiscordLinkCode>(
      `${base(householdId)}/link-code`,
      nodeId ? { node_id: nodeId } : {},
    )
  ).data;

export const setDiscordPrefs = async (
  householdId: string,
  prefs: { node_id?: string; voice_replies?: VoiceReplies; proactive?: boolean },
): Promise<DiscordStatus> => (await apiClient.put<DiscordStatus>(`${base(householdId)}/me`, prefs)).data;

export const unlinkDiscord = async (householdId: string): Promise<void> => {
  await apiClient.delete(`${base(householdId)}/me`);
};
