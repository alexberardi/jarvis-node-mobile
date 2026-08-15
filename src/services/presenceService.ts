/**
 * Presence detection — the phone as a Signal Bus presence producer.
 *
 * Privacy model (locked with the user): the PRECISE home coordinate lives ONLY
 * on this device (AsyncStorage). We compute home/away locally by comparing the
 * current location against the stored home geofence, and report just that binary
 * state to command-center via presenceApi. The lat/lng never leaves the phone.
 *
 * Phase 2 is FOREGROUND ONLY: sampling happens when the app is open (on login,
 * on AppState → active, and on a periodic while-foregrounded tick — all driven
 * by usePresence). We never prompt for location while sampling — `reportIfChanged`
 * only reports when permission is ALREADY granted (the user grants it explicitly
 * when setting their home in Household Settings). Phase 3 adds true background
 * geofencing.
 *
 * We report on a *change* of state, but also re-assert an unchanged state once
 * it goes stale (the HEARTBEAT below) so the server's presence TTL doesn't
 * silently expire a still-valid "home" while the user is home all day. The
 * last-reported state is keyed per (household, user) so a shared phone can't
 * mask a second user's presence and a re-login always reports fresh.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import { reportPresence, type PresenceState } from '../api/presenceApi';
import { getServiceConfig, loadCachedConfig } from '../config/serviceConfig';
import {
  ACTIVE_HOUSEHOLD_KEY,
  BG_PRESENCE_ENABLED_KEY,
  HOME_GEOFENCE_KEY,
  PRESENCE_LAST_STATE_KEY,
  PRESENCE_PENDING_QUEUE_KEY,
  USER_KEY,
} from '../config/storageKeys';
import {
  persistBgRotatedTokens,
  readDurableRefreshToken,
  readTokenForBg,
} from './tokenStorage';

/** A user's home geofence, stored on-device only. */
export interface HomeGeofence {
  latitude: number;
  longitude: number;
  /** Radius (meters) within which the phone is considered "home". */
  radiusMeters: number;
  /** Master switch — presence reporting is off until the user turns it on. */
  enabled: boolean;
}

export const DEFAULT_RADIUS_METERS = 150;
/** Floor for the radius: GPS is only accurate to ~tens of meters, and a too-tight
 *  geofence flaps between home/away on jitter. */
export const MIN_RADIUS_METERS = 75;
export const MAX_RADIUS_METERS = 1000;

/**
 * Re-assert an unchanged state once the last report is older than this. Must be
 * comfortably under the server's mobile presence TTL (4h) so a still-valid
 * "home" gets refreshed before the server expires it. See the HEARTBEAT note.
 */
export const REFRESH_AFTER_MS = 90 * 60 * 1000; // 90 min

/** Cap on a single GPS read so a device that never gets a fix can't wedge the
 *  in-flight guard forever (expo-location has no built-in timeout). */
export const LOCATION_TIMEOUT_MS = 15 * 1000;

/** Outcome of a sample+report cycle (for logging / the hook / tests). */
export type PresenceReportResult =
  | { status: 'reported'; state: PresenceState }
  | { status: 'unchanged'; state: PresenceState }
  | { status: 'skipped'; reason: 'disabled' | 'no-home' | 'no-permission' | 'in-flight' | 'no-user' }
  | { status: 'error'; reason: string };

const EARTH_RADIUS_METERS = 6_371_000;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two coordinates, in meters (haversine).
 * Exported for testing and for the settings screen's live "you are N m away".
 */
export const haversineMeters = (
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number => {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** Decide home/away from a current position and a home geofence. */
export const decideState = (
  current: { latitude: number; longitude: number },
  home: Pick<HomeGeofence, 'latitude' | 'longitude' | 'radiusMeters'>,
): PresenceState =>
  haversineMeters(current, home) <= home.radiusMeters ? 'home' : 'away';

/** Reject if a promise doesn't settle within `ms` (GPS reads have no timeout). */
const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });

// ── On-device home geofence storage ────────────────────────────────────

export const getHomeGeofence = async (): Promise<HomeGeofence | null> => {
  const raw = await AsyncStorage.getItem(HOME_GEOFENCE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<HomeGeofence>;
    if (
      typeof parsed.latitude !== 'number' ||
      typeof parsed.longitude !== 'number' ||
      typeof parsed.radiusMeters !== 'number'
    ) {
      return null;
    }
    return {
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      radiusMeters: parsed.radiusMeters,
      enabled: !!parsed.enabled,
    };
  } catch {
    return null;
  }
};

export const setHomeGeofence = async (home: HomeGeofence): Promise<void> => {
  const radius = Math.min(
    MAX_RADIUS_METERS,
    Math.max(MIN_RADIUS_METERS, Math.round(home.radiusMeters)),
  );
  await AsyncStorage.setItem(
    HOME_GEOFENCE_KEY,
    JSON.stringify({ ...home, radiusMeters: radius }),
  );
};

export const clearHomeGeofence = async (): Promise<void> => {
  await AsyncStorage.removeItem(HOME_GEOFENCE_KEY);
};

// ── Per-(household, user) last-reported state (report-on-change + heartbeat) ──

interface LastReport {
  state: PresenceState;
  /** epoch ms of the last successful report; drives the heartbeat refresh. */
  ts: number;
}
type LastStateMap = Record<string, LastReport>;

// Serialize AsyncStorage read-modify-write on the presence stores (last-state
// map + pending queue) so they stay atomic across ALL three writers: the
// foreground sample (reportIfChanged), the foreground flush (flushPendingQueue),
// and the IN-PROCESS background report (reportPresenceBg). The `inFlight` guard
// below only covers the two foreground paths; a geofence crossing delivered to
// the live JS runtime (app backgrounded-not-killed, or foreground) runs
// reportPresenceBg concurrently, so without this a slow flush could clobber a
// fresh bg enqueue (lost crossing) or resurrect a flushed edge (duplicate
// report). Network is kept OUTSIDE this critical section — only the store
// mutation is serialized.
let opChain: Promise<unknown> = Promise.resolve();
const runSerialized = <T>(fn: () => Promise<T>): Promise<T> => {
  const result = opChain.then(fn, fn);
  opChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
};

// Keyed by household AND user: the server binds presence to the JWT user_id, so
// deduping by household alone would let one user on a shared phone mask another,
// and would let a stale in-flight report from a logged-out user suppress the
// next user's first report.
export const keyFor = (householdId: string, userId: number | string): string =>
  `${householdId}:${userId}`;

const readLastStateMap = async (): Promise<LastStateMap> => {
  const raw = await AsyncStorage.getItem(PRESENCE_LAST_STATE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as LastStateMap) : {};
  } catch {
    return {};
  }
};

const writeLastState = async (key: string, report: LastReport): Promise<void> =>
  runSerialized(async () => {
    const map = await readLastStateMap();
    map[key] = report;
    await AsyncStorage.setItem(PRESENCE_LAST_STATE_KEY, JSON.stringify(map));
  });

/** Forget the remembered state (e.g. on logout, so the next login reports fresh). */
export const clearLastPresenceState = async (): Promise<void> => {
  await AsyncStorage.removeItem(PRESENCE_LAST_STATE_KEY);
};

// ── Permission + capture (used by the settings screen) ──────────────────

/**
 * Request foreground location permission and capture the CURRENT position as a
 * candidate home coordinate. Prompts the OS permission dialog if needed — call
 * this ONLY from an explicit user action ("Use current location"). Returns null
 * if permission is denied.
 */
export const captureCurrentLocation = async (): Promise<{
  latitude: number;
  longitude: number;
} | null> => {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  const pos = await withTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
    LOCATION_TIMEOUT_MS,
    'location',
  );
  return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
};

// ── The sample + report cycle (driven by usePresence) ───────────────────

// Guards against concurrent samples (login + AppState-active + the heartbeat
// tick can fire together). The GPS read below is timeout-bounded, so this can
// never wedge past LOCATION_TIMEOUT_MS.
let inFlight = false;

/**
 * Sample the current location and report presence to CC when it's newsworthy:
 * on a CHANGE of home/away state, or when the last report has gone stale (the
 * heartbeat, so the server TTL doesn't expire a still-valid "home").
 *
 * Silent no-ops (returns a 'skipped' result) when presence is disabled, no home
 * is set, or foreground permission isn't already granted — it never prompts.
 *
 * @param householdId The active household to report against.
 * @param userId      The current user's id (dedup key + shared-phone safety).
 * @param name        Optional display name for the "<name> is home" summary.
 */
export const reportIfChanged = async (
  householdId: string,
  userId: number | string,
  name?: string,
): Promise<PresenceReportResult> => {
  if (userId === undefined || userId === null || userId === '') {
    return { status: 'skipped', reason: 'no-user' };
  }
  if (inFlight) return { status: 'skipped', reason: 'in-flight' };
  inFlight = true;
  try {
    const home = await getHomeGeofence();
    if (!home || !home.enabled) return { status: 'skipped', reason: 'disabled' };
    if (
      typeof home.latitude !== 'number' ||
      typeof home.longitude !== 'number'
    ) {
      return { status: 'skipped', reason: 'no-home' };
    }

    // Never prompt while sampling — only report when permission is already granted.
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      return { status: 'skipped', reason: 'no-permission' };
    }

    const pos = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      LOCATION_TIMEOUT_MS,
      'location',
    );
    const state = decideState(
      { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
      home,
    );

    const key = keyFor(householdId, userId);
    const lastMap = await readLastStateMap();
    const last = lastMap[key];
    const now = Date.now();
    // Report on a state change OR when a same-state report has gone stale (the
    // heartbeat) so the server's presence TTL is refreshed while still home.
    const fresh = last && last.ts <= now && now - last.ts < REFRESH_AFTER_MS;
    if (last && last.state === state && fresh) {
      return { status: 'unchanged', state };
    }

    await reportPresence(householdId, state, name);
    // Persist only after a successful POST, so a failed report retries next sample.
    await writeLastState(key, { state, ts: Date.now() });
    return { status: 'reported', state };
  } catch (err) {
    return {
      status: 'error',
      reason: err instanceof Error ? err.message : String(err),
    };
  } finally {
    inFlight = false;
  }
};

// ── Background presence opt-in (Phase 3) ────────────────────────────────

/**
 * Whether the user has opted into TRUE background geofencing (Always-location +
 * an OS geofence that fires when the app is backgrounded/terminated). DISTINCT
 * from the foreground `HomeGeofence.enabled` flag: this one also downgrades
 * keychain token accessibility (see tokenStorage.computeAccessibility), so it's
 * only set once the user explicitly turns it on AND grants Always permission.
 */
export const isBackgroundPresenceEnabled = async (): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(BG_PRESENCE_ENABLED_KEY)) === 'true';
  } catch {
    return false;
  }
};

/** Persist the background-presence opt-in (boolean only — never a token). */
export const setBackgroundPresenceEnabled = async (enabled: boolean): Promise<void> => {
  await AsyncStorage.setItem(BG_PRESENCE_ENABLED_KEY, enabled ? 'true' : 'false');
};

// ── Deferred pending-edge queue (Phase 3 background fallback) ────────────

/** How long a queued edge stays worth replaying — the server's mobile-presence
 *  TTL. Older edges are dropped on flush (except the newest, which asserts
 *  current truth) so we never replay a stale "home" as a fresh arrival. */
export const PRESENCE_STALE_MS = 4 * 60 * 60 * 1000;
/** Bound the log so a device offline for days can't grow it unboundedly. */
const MAX_PENDING_EDGES = 20;
/** Treat the access token as unusable this many seconds before its real exp. */
const ACCESS_EXP_SKEW_SECONDS = 30;

/** A presence edge captured by the background task when it couldn't report. */
export interface PendingEdge {
  state: PresenceState;
  ts: number;
  householdId: string;
  userId: number | string;
  name?: string;
}

const readPendingQueue = async (): Promise<PendingEdge[]> => {
  const raw = await AsyncStorage.getItem(PRESENCE_PENDING_QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingEdge[]) : [];
  } catch {
    return [];
  }
};

const writePendingQueue = async (queue: PendingEdge[]): Promise<void> => {
  await AsyncStorage.setItem(PRESENCE_PENDING_QUEUE_KEY, JSON.stringify(queue));
};

/**
 * Append a deferred edge. Consecutive same-state edges for the same (household,
 * user) are COALESCED (the tail's timestamp is bumped) so the log strictly
 * alternates home/away — an arrive→leave transition that happened while
 * backgrounded still delivers both edges, but a heartbeat-style repeat doesn't
 * bloat the log. Bounded to MAX_PENDING_EDGES, dropping oldest on overflow.
 */
export const enqueuePendingEdge = async (entry: PendingEdge): Promise<void> =>
  runSerialized(async () => {
    const queue = await readPendingQueue();
    const tail = queue[queue.length - 1];
    if (
      tail &&
      tail.state === entry.state &&
      tail.householdId === entry.householdId &&
      String(tail.userId) === String(entry.userId)
    ) {
      tail.ts = entry.ts;
      if (entry.name) tail.name = entry.name;
    } else {
      queue.push(entry);
    }
    while (queue.length > MAX_PENDING_EDGES) queue.shift();
    await writePendingQueue(queue);
  });

/** Value-identity of an edge, for removal that survives a concurrent re-read. */
const edgeKey = (e: PendingEdge): string =>
  `${e.householdId}:${e.userId}:${e.state}:${e.ts}`;

/**
 * Flush deferred edges for the active (household, user) via the normal authed
 * path (the token is fresh in the foreground). Oldest→newest so transitions
 * replay in order; entries older than PRESENCE_STALE_MS are dropped (except the
 * newest, so current truth is still asserted). Stops on the first POST failure
 * and keeps the remainder for the next flush. Edges for other (household, user)
 * pairs are left in place.
 *
 * The `inFlight` guard keeps this from double-sending with a concurrent live
 * foreground sample. The POSTs run OUTSIDE the store's serialization lock; the
 * queue removal at the end is done under `runSerialized` and removes only the
 * exact edges we sent/dropped (by value identity), so a geofence crossing that
 * enqueued a NEW edge mid-flush is preserved rather than clobbered.
 */
export const flushPendingQueue = async (
  householdId: string,
  userId: number | string,
  name?: string,
): Promise<void> => {
  if (inFlight) return;
  inFlight = true;
  try {
    const snapshot = await readPendingQueue();
    if (snapshot.length === 0) return;
    const now = Date.now();
    const lastIdx = snapshot.length - 1;

    // Edges we've fully resolved (sent or dropped-stale) → to remove from the
    // live queue at the end. Others (not ours, or after a failure) stay.
    const resolved = new Set<string>();
    let stopped = false;
    for (let i = 0; i < snapshot.length; i++) {
      const edge = snapshot[i];
      // Only flush the active session's edges; leave a shared phone's other
      // user / household edges queued for when that session is active.
      if (edge.householdId !== householdId || String(edge.userId) !== String(userId)) {
        continue;
      }
      // Once a POST has failed, stop resolving anything so the remainder is
      // preserved intact for the next flush.
      if (stopped) continue;
      // Drop stale entries (server TTL passed) but always keep the newest.
      if (i !== lastIdx && now - edge.ts > PRESENCE_STALE_MS) {
        resolved.add(edgeKey(edge));
        continue;
      }
      try {
        await reportPresence(edge.householdId, edge.state, edge.name ?? name);
        await writeLastState(keyFor(edge.householdId, edge.userId), {
          state: edge.state,
          ts: Date.now(),
        });
        resolved.add(edgeKey(edge));
      } catch {
        stopped = true; // keep this and everything after it for the next flush
      }
    }
    if (resolved.size > 0) {
      // Re-read under the lock and remove only the resolved edges, so an edge
      // enqueued concurrently (different ts) survives.
      await runSerialized(async () => {
        const live = await readPendingQueue();
        await writePendingQueue(live.filter((e) => !resolved.has(edgeKey(e))));
      });
    }
  } finally {
    inFlight = false;
  }
};

// ── Headless background report (Phase 3) ────────────────────────────────

/** Decode a JWT's `exp` (seconds) without verifying the signature. */
const decodeJwtExpSeconds = (token: string): number | null => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded));
    return typeof claims.exp === 'number' ? claims.exp : null;
  } catch {
    return null;
  }
};

const accessTokenUsable = (token: string | null): boolean => {
  if (!token) return false;
  const exp = decodeJwtExpSeconds(token);
  // Can't parse → optimistically try; a 401 on the POST handles a bad token.
  if (exp === null) return true;
  return exp - ACCESS_EXP_SKEW_SECONDS > Date.now() / 1000;
};

/** Bare (interceptor-free) refresh — the headless context has no apiClient
 *  wiring and authApi's baseURL is empty. Returns null on any failure (the
 *  background NEVER forces a logout). */
const bgRefresh = async (
  authBaseUrl: string,
  refreshToken: string,
): Promise<{ access: string; refresh: string } | null> => {
  try {
    const res = await fetch(`${authBaseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.access_token) return null;
    return { access: data.access_token, refresh: data.refresh_token ?? refreshToken };
  } catch {
    return null;
  }
};

type BgPostOutcome = 'ok' | 'unauthorized' | 'error';

const bgPostPresence = async (
  commandCenterUrl: string,
  accessToken: string,
  householdId: string,
  state: PresenceState,
  name?: string,
): Promise<BgPostOutcome> => {
  try {
    const body: { household_id: string; state: PresenceState; name?: string } = {
      household_id: householdId,
      state,
    };
    if (name) body.name = name;
    const res = await fetch(`${commandCenterUrl}/api/v0/mobile/presence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
    if (res.ok) return 'ok';
    if (res.status === 401 || res.status === 403) return 'unauthorized';
    return 'error';
  } catch {
    return 'error';
  }
};

/**
 * Report presence from the HEADLESS background geofence task. There is no React
 * tree, no apiClient interceptor, and the device is often locked. Best-effort
 * with a deferred fallback: anything that can't report right now is enqueued and
 * flushed on the next foreground. NEVER throws, NEVER forces a logout, NEVER
 * clears tokens. Full design in project_mobile_presence.md (Phase 3).
 */
export const reportPresenceBg = async (state: PresenceState): Promise<void> => {
  try {
    // 1. Config — the in-memory currentConfig is EMPTY in a headless launch;
    //    fall back to the AsyncStorage-cached copy.
    let cfg = getServiceConfig();
    if (!cfg.commandCenterUrl || !cfg.authBaseUrl) {
      const cached = await loadCachedConfig();
      if (cached) cfg = cached;
    }
    // 2. Identity — from AsyncStorage (self-scoped; CC binds identity to the JWT).
    const [householdId, userRaw] = await Promise.all([
      AsyncStorage.getItem(ACTIVE_HOUSEHOLD_KEY),
      AsyncStorage.getItem(USER_KEY),
    ]);
    let userId: number | string | undefined;
    let name: string | undefined;
    if (userRaw) {
      try {
        const user = JSON.parse(userRaw);
        userId = user?.id;
        name = user?.username;
      } catch {
        /* fall through to the missing-identity guard */
      }
    }
    const hasIdentity =
      !!householdId && userId !== undefined && userId !== null && userId !== '';
    const edge: PendingEdge = {
      state,
      ts: Date.now(),
      householdId: householdId ?? '',
      userId: userId ?? '',
      name,
    };

    if (!cfg.commandCenterUrl || !cfg.authBaseUrl || !hasIdentity) {
      await enqueuePendingEdge(edge);
      return;
    }

    // 3. Tokens (adaptive: refresh is null for biometric users → access-only).
    const tokens = await readTokenForBg();
    let access = tokens.access;
    const refresh = tokens.refresh;

    // 4. Refresh if the access token is stale AND we have a bg-usable refresh
    //    token (read immediately before the POST to stay inside the auth grace).
    if (!accessTokenUsable(access) && refresh) {
      const rotated = await bgRefresh(cfg.authBaseUrl, refresh);
      if (rotated) {
        access = rotated.access;
        await persistBgRotatedTokens(rotated.access, rotated.refresh);
      }
    }

    if (!access) {
      await enqueuePendingEdge(edge);
      return;
    }

    // 5. Report; on a rejected access token do ONE refresh+retry with the live
    //    durable tail, else defer.
    let outcome = await bgPostPresence(cfg.commandCenterUrl, access, householdId!, state, name);
    if (outcome === 'unauthorized' && refresh) {
      const durable = (await readDurableRefreshToken()) ?? refresh;
      const rotated = await bgRefresh(cfg.authBaseUrl, durable);
      if (rotated) {
        await persistBgRotatedTokens(rotated.access, rotated.refresh);
        outcome = await bgPostPresence(
          cfg.commandCenterUrl,
          rotated.access,
          householdId!,
          state,
          name,
        );
      }
    }

    if (outcome === 'ok') {
      await writeLastState(keyFor(householdId!, userId!), { state, ts: Date.now() });
    } else {
      await enqueuePendingEdge(edge);
    }
  } catch {
    // A headless executor must never throw — swallow and let the next crossing
    // or the next foreground sample reconcile.
  }
};
