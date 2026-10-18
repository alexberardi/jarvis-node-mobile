/**
 * Inbox media attachments (images and video, e.g. ComfyUI output): parsing,
 * authenticated download to the local cache, save to photos and share.
 *
 * Contract (docs/decisions/inbox-attachments.md): an inbox item carries
 *   attachments = [{ kind: 'image'|'video', url, mime_type?, thumbnail_url?, … }]
 * at the top level, or the same list under metadata.attachments. Older
 * servers send neither — that means "no attachments", nothing else changes.
 *
 * Like the phone-call audio, the bytes are only served to the user's JWT
 * (no presigned URLs), so everything is downloaded with FileSystem.downloadAsync
 * and shown, saved and shared from the local file. downloadAsync bypasses the
 * axios refresh interceptor, so a 401 refreshes the token once and retries once.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

import { getCurrentAccessToken, refreshAuthToken } from '../api/apiClient';
import { getServiceConfig } from '../config/serviceConfig';

const MEDIA_CACHE_DIR = 'inbox-media/';
const MAX_ATTACHMENTS = 10;

export type InboxAttachmentKind = 'image' | 'video';

export interface InboxAttachment {
  id?: string;
  kind: InboxAttachmentKind;
  url: string;
  mime_type?: string;
  thumbnail_url?: string;
  width?: number;
  height?: number;
  duration_seconds?: number;
  filename?: string;
  size_bytes?: number;
}

const STRING_FIELDS = ['id', 'mime_type', 'thumbnail_url', 'filename'] as const;
const NUMBER_FIELDS = ['width', 'height', 'duration_seconds', 'size_bytes'] as const;

const parseOne = (raw: unknown): InboxAttachment | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const a = raw as Record<string, unknown>;
  if (a.kind !== 'image' && a.kind !== 'video') return null;
  if (typeof a.url !== 'string' || a.url.length === 0) return null;
  const out: InboxAttachment = { kind: a.kind, url: a.url };
  for (const key of STRING_FIELDS) {
    if (a[key] == null) continue;
    if (typeof a[key] !== 'string') return null;
    out[key] = a[key] as string;
  }
  for (const key of NUMBER_FIELDS) {
    if (a[key] == null) continue;
    if (typeof a[key] !== 'number') return null;
    out[key] = a[key] as number;
  }
  return out;
};

/**
 * Attachments of an inbox item: the top-level list, else metadata.attachments.
 * Malformed entries are dropped one by one; anything else → [].
 */
export const parseInboxAttachments = (item: {
  attachments?: unknown;
  metadata?: Record<string, any> | null;
}): InboxAttachment[] => {
  const raw = item.attachments ?? item.metadata?.attachments;
  if (!Array.isArray(raw)) return [];
  const out: InboxAttachment[] = [];
  for (const entry of raw) {
    const parsed = parseOne(entry);
    if (parsed) out.push(parsed);
    if (out.length >= MAX_ATTACHMENTS) break;
  }
  return out;
};

/** Relative paths resolve against the notifications service (the inbox API). */
export const resolveMediaUrl = (url: string): string => {
  if (/^https?:\/\//i.test(url)) return url;
  const base = getServiceConfig().notificationsUrl.replace(/\/$/, '');
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
};

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

const KNOWN_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic', 'mp4', 'mov', 'm4v', 'webm']);

/** The photo library needs a real extension; take it from the type, else the URL. */
const extensionFor = (url: string, mimeType?: string): string => {
  const fromMime = mimeType ? MIME_EXTENSIONS[mimeType.toLowerCase()] : undefined;
  if (fromMime) return fromMime;
  const path = url.split(/[?#]/)[0];
  const match = /\.([a-z0-9]{2,5})$/i.exec(path);
  const ext = match?.[1].toLowerCase();
  if (ext && KNOWN_EXTENSIONS.has(ext)) return ext;
  return mimeType?.startsWith('video/') ? 'mp4' : 'bin';
};

/** Stable cache filename per source URL (djb2 hex — collision-irrelevant here). */
const cacheNameFor = (url: string, mimeType?: string): string => {
  let hash = 5381;
  for (let i = 0; i < url.length; i += 1) {
    hash = ((hash << 5) + hash + url.charCodeAt(i)) >>> 0;
  }
  return `${hash.toString(16)}.${extensionFor(url, mimeType)}`;
};

const authHeaders = (): Record<string, string> => {
  const token = getCurrentAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Download a media URL to the cache (once — later calls return the cached
 * file) and return the local file URI.
 */
export const downloadInboxMedia = async (url: string, mimeType?: string): Promise<string> => {
  const dir = `${FileSystem.cacheDirectory}${MEDIA_CACHE_DIR}`;
  const fileUri = `${dir}${cacheNameFor(url, mimeType)}`;

  const existing = await FileSystem.getInfoAsync(fileUri);
  if (existing.exists) return fileUri;

  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {
    // Already exists — fine.
  });

  const source = resolveMediaUrl(url);
  let result = await FileSystem.downloadAsync(source, fileUri, { headers: authHeaders() });
  if (result.status === 401) {
    // downloadAsync skips the axios interceptor: refresh once, retry once.
    await refreshAuthToken().catch(() => null);
    result = await FileSystem.downloadAsync(source, fileUri, { headers: authHeaders() });
  }

  if (result.status !== 200) {
    // Never leave an error body cached as if it were the media.
    await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
    throw new Error(`Media download failed (HTTP ${result.status})`);
  }
  return fileUri;
};

/** Save a local file to the photo library, asking (write-only) only now. */
export const saveMediaToPhotos = async (localUri: string): Promise<'saved' | 'denied'> => {
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) return 'denied';
  await MediaLibrary.saveToLibraryAsync(localUri);
  return 'saved';
};

/** Open the system share sheet on a local file; false when sharing is unavailable. */
export const shareMedia = async (localUri: string, mimeType?: string): Promise<boolean> => {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(localUri, mimeType ? { mimeType } : {});
  return true;
};
