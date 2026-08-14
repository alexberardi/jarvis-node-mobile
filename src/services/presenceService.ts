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
import { HOME_GEOFENCE_KEY, PRESENCE_LAST_STATE_KEY } from '../config/storageKeys';

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

// Keyed by household AND user: the server binds presence to the JWT user_id, so
// deduping by household alone would let one user on a shared phone mask another,
// and would let a stale in-flight report from a logged-out user suppress the
// next user's first report.
const keyFor = (householdId: string, userId: number | string): string =>
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

const writeLastState = async (
  key: string,
  report: LastReport,
): Promise<void> => {
  const map = await readLastStateMap();
  map[key] = report;
  await AsyncStorage.setItem(PRESENCE_LAST_STATE_KEY, JSON.stringify(map));
};

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
