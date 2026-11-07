/**
 * Now playing (jarvis-server docs/agent/PLAYBACK.md piece 6): what each node of the household
 * plays, from any source (Spotify, a radio package, the display's player…), and its controls.
 * Nothing here names a service: the node reports a generic state and the actions it supports.
 */
import { getCommandCenterUrl } from '../config/serviceConfig';
import apiClient from './apiClient';

export const PLAYBACK_ACTIONS = [
  'play', 'pause', 'next', 'previous', 'seek', 'volume', 'shuffle', 'repeat', 'like',
] as const;
export type PlaybackAction = (typeof PLAYBACK_ACTIONS)[number];

export interface PlaybackState {
  state: 'playing' | 'paused' | 'idle';
  media_title: string;
  media_artist: string;
  media_album: string;
  context: string;
  actions: string[];
  position?: number;
  duration?: number;
  volume?: number;
  shuffle?: boolean;
  repeat?: 'off' | 'all' | 'one';
  liked?: boolean;
}

export interface NodePlayback {
  node_id: string;
  node_name: string;
  source: string;
  /** The source's display name ("Spotify"). */
  name: string;
  state: PlaybackState;
  /** When the node read the state; position advances from here while playing. */
  updated_at: string;
  /** The cover's key, when the node uploaded one: the cache key of coverUrl. */
  cover?: string;
}

export const getPlayback = async (householdId: string): Promise<NodePlayback[]> => {
  const res = await apiClient.get<{ playing: NodePlayback[] }>(
    `${getCommandCenterUrl()}/api/v0/mobile/playback`,
    { params: { household_id: householdId } },
  );
  return res.data.playing ?? [];
};

export interface PlaybackControl {
  node_id: string;
  action: PlaybackAction;
  volume?: number;
  position?: number;
}

/** Sends one control; jarvisd answers with the node's state read back after it (null: stopped). */
export const controlPlayback = async (c: PlaybackControl): Promise<NodePlayback | null> => {
  const res = await apiClient.post<{ node_id: string; playing: NodePlayback | null }>(
    `${getCommandCenterUrl()}/api/v0/mobile/playback/control`,
    c,
    { timeout: 10000 }, // jarvisd waits up to 3 s for the node's read-back
  );
  return res.data.playing;
};

/** The cover jarvisd serves for the node's current track (needs the bearer token). */
export const coverUrl = (p: NodePlayback): string | null =>
  p.cover
    ? `${getCommandCenterUrl()}/api/v0/mobile/playback/cover?node_id=${encodeURIComponent(p.node_id)}&v=${encodeURIComponent(p.cover)}`
    : null;

/** Seconds into the track now: the reading plus the time since, while playing. */
export const positionAt = (p: NodePlayback, now: number): number | undefined => {
  const { position, duration, state } = p.state;
  if (position === undefined) return undefined;
  const at = state === 'playing' ? position + Math.max(0, now - Date.parse(p.updated_at)) / 1000 : position;
  return duration ? Math.min(at, duration) : at;
};
