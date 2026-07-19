/**
 * Authenticated download of inbox audio attachments (phone-call recordings)
 * to the local cache for expo-av playback.
 *
 * Contract: inbox items reference audio via
 *   metadata.audio = { url, duration_seconds?, title? }
 * where `url` is either absolute or a command-center-relative path
 * (e.g. "/api/v0/phone/sessions/{id}/audio"). The endpoint requires the
 * user JWT — audio is never served via presigned/unauthenticated URLs
 * (phone-calls PRD decision 9).
 *
 * expo-av's Sound.createAsync cannot attach request headers reliably across
 * platforms, so we download to cache first with FileSystem.downloadAsync and
 * play the local file. The Authorization header uses the live access token
 * from the apiClient token bridge; a request that fails with 401 is NOT
 * silently retried through the refresh interceptor (downloadAsync bypasses
 * axios) — callers surface a retry affordance instead, and by the next
 * attempt normal app traffic will have refreshed the token.
 */

import * as FileSystem from 'expo-file-system/legacy';

import { getCurrentAccessToken } from '../api/apiClient';
import { getCommandCenterUrl } from '../config/serviceConfig';

const AUDIO_CACHE_DIR = 'inbox-audio/';

export interface InboxAudioRef {
  url: string;
  duration_seconds?: number;
  title?: string;
}

/** Parse metadata.audio; malformed shapes → null (no player rendered). */
export const parseInboxAudio = (
  metadata: Record<string, any> | null | undefined,
): InboxAudioRef | null => {
  const audio = metadata?.audio;
  if (!audio || typeof audio !== 'object' || Array.isArray(audio)) return null;
  if (typeof audio.url !== 'string' || audio.url.length === 0) return null;
  if (audio.duration_seconds != null && typeof audio.duration_seconds !== 'number') return null;
  if (audio.title != null && typeof audio.title !== 'string') return null;
  return {
    url: audio.url,
    duration_seconds: audio.duration_seconds ?? undefined,
    title: audio.title ?? undefined,
  };
};

/** Relative paths resolve against command-center (the authz audio endpoint lives there). */
export const resolveAudioUrl = (url: string): string => {
  if (/^https?:\/\//i.test(url)) return url;
  const base = getCommandCenterUrl().replace(/\/$/, '');
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
};

/** Stable cache filename per source URL (djb2 hex — collision-irrelevant here). */
const cacheNameFor = (url: string): string => {
  let hash = 5381;
  for (let i = 0; i < url.length; i += 1) {
    hash = ((hash << 5) + hash + url.charCodeAt(i)) >>> 0;
  }
  return `${hash.toString(16)}.wav`;
};

/**
 * Download the audio to the cache (once — subsequent calls return the cached
 * file) and return a local file URI playable by expo-av.
 */
export const downloadInboxAudio = async (url: string): Promise<string> => {
  const dir = `${FileSystem.cacheDirectory}${AUDIO_CACHE_DIR}`;
  const fileUri = `${dir}${cacheNameFor(url)}`;

  const existing = await FileSystem.getInfoAsync(fileUri);
  if (existing.exists) return fileUri;

  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {
    // Already exists — fine.
  });

  const token = getCurrentAccessToken();
  const result = await FileSystem.downloadAsync(resolveAudioUrl(url), fileUri, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (result.status !== 200) {
    // Never leave a non-audio error body cached as if it were audio.
    await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
    throw new Error(`Audio download failed (HTTP ${result.status})`);
  }
  return fileUri;
};
