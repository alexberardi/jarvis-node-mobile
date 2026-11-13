/**
 * Android Auto car chat. The native reply receiver (modules/jarvis-car) starts
 * the headless task `JarvisCarReply` with the dictated text; this sends it to
 * Jarvis and posts the answer back as a car notification that Android Auto
 * reads aloud.
 *
 * Runs with NO React tree, like the presence geofence task, so it self-sources
 * config, identity and tokens the same way (see reportPresenceBg). It never
 * throws and never forces a logout. Biometric users only get the access token
 * (readTokenForBg), so an expired session asks them to open the app.
 *
 * Transports, tried in order: Tailscale (the normal server URL), then a public
 * URL. Discord is added once the jarvis-server bridge is merged.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseSSEChunk } from '../api/chatApi';
import { postReply } from '../../modules/jarvis-car';
import {
  ACTIVE_HOUSEHOLD_KEY,
  CAR_CONVERSATION_KEY,
  CAR_PUBLIC_URL_KEY,
  LAST_NODE_KEY,
} from '../config/storageKeys';
import { getServiceConfig, loadCachedConfig } from '../config/serviceConfig';
import { accessTokenUsable, bgRefresh } from './presenceService';
import { persistBgRotatedTokens, readTokenForBg } from './tokenStorage';

export const CAR_REPLY_TASK = 'JarvisCarReply';

const PROBE_TIMEOUT_MS = 2000; // inside Android Auto's 2 s button-response budget
const CHAT_TIMEOUT_MS = 25000;
const CONVERSATION_TTL_MS = 9 * 60 * 1000; // server idle TTL is 10 minutes
const MAX_SPOKEN_CHARS = 400;

export const MSG_UNREACHABLE = "I can't reach Jarvis.";
export const MSG_SIGN_IN = 'Open Jarvis on your phone to sign in.';
export const MSG_NO_NODE = 'Pick a Jarvis device in the app first.';
const MSG_FAILED = 'Something went wrong.';

/** Plain, speakable text: no markdown, one line, capped at a sentence end where possible. */
export const toSpeech = (text: string): string => {
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= MAX_SPOKEN_CHARS) return plain;
  const cut = plain.slice(0, MAX_SPOKEN_CHARS);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return end > 80 ? cut.slice(0, end + 1) : cut.trimEnd() + '...';
};

const withTimeout = async (url: string, init: RequestInit, ms: number): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const isReachable = async (baseUrl: string): Promise<boolean> => {
  try {
    return (await withTimeout(`${baseUrl}/health`, {}, PROBE_TIMEOUT_MS)).ok;
  } catch {
    return false;
  }
};

type ChatOutcome =
  | { kind: 'ok'; text: string; conversationId?: string }
  | { kind: 'unauthorized' }
  | { kind: 'error' };

const postChat = async (
  baseUrl: string,
  token: string,
  body: Record<string, unknown>,
): Promise<ChatOutcome> => {
  try {
    const res = await withTimeout(
      `${baseUrl}/api/v0/mobile/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(body),
      },
      CHAT_TIMEOUT_MS,
    );
    if (res.status === 401 || res.status === 403) return { kind: 'unauthorized' };
    if (!res.ok) return { kind: 'error' };
    // RN's fetch does not stream, so the whole SSE body arrives at once.
    const events = parseSSEChunk(await res.text());
    const failed = events.find((e) => e.type === 'error');
    const done = events.find((e) => e.type === 'done');
    const text =
      done?.full_text ??
      events
        .filter((e) => e.type === 'delta')
        .map((e) => e.text ?? '')
        .join('');
    const conversationId = (done ?? failed)?.conversation_id;
    if (failed && !text) return { kind: 'ok', text: failed.message ?? MSG_FAILED, conversationId };
    return text ? { kind: 'ok', text, conversationId } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
};

const readConversationId = async (): Promise<string | undefined> => {
  try {
    const raw = await AsyncStorage.getItem(CAR_CONVERSATION_KEY);
    const saved = raw ? (JSON.parse(raw) as { id?: string; ts?: number }) : null;
    return saved?.id && saved.ts && Date.now() - saved.ts < CONVERSATION_TTL_MS
      ? saved.id
      : undefined;
  } catch {
    return undefined;
  }
};

/** Send one command to Jarvis and return the text to speak. Never throws. */
export const askJarvis = async (text: string): Promise<string> => {
  try {
    let cfg = getServiceConfig();
    if (!cfg.commandCenterUrl || !cfg.authBaseUrl) cfg = (await loadCachedConfig()) ?? cfg;
    const [householdId, nodeId, publicUrl] = await Promise.all([
      AsyncStorage.getItem(ACTIVE_HOUSEHOLD_KEY),
      AsyncStorage.getItem(LAST_NODE_KEY),
      AsyncStorage.getItem(CAR_PUBLIC_URL_KEY),
    ]);
    const tokens = await readTokenForBg();
    if (!householdId || !tokens.access) return MSG_SIGN_IN;
    if (!nodeId) return MSG_NO_NODE;

    let access = tokens.access;
    if (!accessTokenUsable(access) && tokens.refresh && cfg.authBaseUrl) {
      const rotated = await bgRefresh(cfg.authBaseUrl, tokens.refresh);
      if (rotated) {
        access = rotated.access;
        await persistBgRotatedTokens(rotated.access, rotated.refresh);
      }
    }

    const body = {
      message: text.trim(),
      node_id: nodeId,
      household_id: householdId,
      conversation_id: await readConversationId(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    const bases = [cfg.commandCenterUrl, publicUrl?.replace(/\/+$/, '')].filter(
      (u): u is string => !!u,
    );
    let sawUnauthorized = false;
    for (const base of bases) {
      if (!(await isReachable(base))) continue;
      const out = await postChat(base, access, body);
      if (out.kind === 'ok') {
        if (out.conversationId) {
          AsyncStorage.setItem(
            CAR_CONVERSATION_KEY,
            JSON.stringify({ id: out.conversationId, ts: Date.now() }),
          ).catch(() => {});
        }
        return toSpeech(out.text);
      }
      if (out.kind === 'unauthorized') sawUnauthorized = true;
    }
    return sawUnauthorized ? MSG_SIGN_IN : MSG_UNREACHABLE;
  } catch {
    return MSG_FAILED;
  }
};

/** Headless task body: answer, then hand the text to the native notifier. */
export const carReplyTask = async (data: { text?: string }): Promise<void> => {
  const text = data?.text?.trim();
  if (!text) return;
  await postReply(await askJarvis(text));
};
