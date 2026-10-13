/**
 * Background geofencing — Phase 3 of mobile presence.
 *
 * Registers a single "home" geofence with the OS so the phone reports
 * `presence.seen` / `presence.left` even when the app is backgrounded OR
 * terminated (foreground sampling in usePresence stays as the fast path). The
 * OS relaunches the app into a HEADLESS JS context on a boundary crossing — no
 * React tree, no AuthProvider — so the task self-sources config + tokens via
 * `reportPresenceBg` (see presenceService).
 *
 * Privacy model is unchanged from Phase 2: the precise home coordinate is fed to
 * the OS geofence and never leaves the device; only "home"/"away" is reported.
 *
 * ⚠️ iOS ONLY. Every entry point here is gated on
 * `BACKGROUND_PRESENCE_SUPPORTED` (presenceService) and no-ops on Android,
 * whose build ships without ACCESS_BACKGROUND_LOCATION so it can go through
 * Play review — Android keeps foreground-only presence (usePresence →
 * reportIfChanged). The task is still *defined* on every platform: defineTask
 * is inert without a registration, and an Android upgrader may still carry a
 * stale one until `rearmIfNeeded` tears it down.
 *
 * ⚠️ `TaskManager.defineTask` MUST run at module top level (an import
 * side-effect), never inside a component/effect — on a cold background relaunch
 * only global scope executes. This module is imported first from `index.ts` so
 * the task is defined before anything else. Also: NEVER throw out of the
 * executor (an unhandled rejection is logged as a task failure).
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import {
  BACKGROUND_PRESENCE_SUPPORTED,
  getHomeGeofence,
  isBackgroundPresenceEnabled,
  reportPresenceBg,
  setBackgroundPresenceEnabled,
  type HomeGeofence,
} from './presenceService';

/** OS task + region identifiers (stable — must match across start/stop). */
export const GEOFENCE_TASK = 'jarvis-home-geofence';
const HOME_REGION_ID = 'home';

type GeofenceEventData = {
  eventType: Location.LocationGeofencingEventType;
  region: Location.LocationRegion;
};

/**
 * The headless executor. Exported for unit testing; also registered below so it
 * exists in the cold-relaunch context. Enter → "home", Exit → "away".
 */
export const geofenceTaskExecutor: TaskManager.TaskManagerTaskExecutor<
  GeofenceEventData
> = async ({ data, error }) => {
  if (error) return;
  try {
    const state =
      data?.eventType === Location.GeofencingEventType.Enter ? 'home' : 'away';
    await reportPresenceBg(state);
  } catch {
    // A headless task must never throw — reportPresenceBg already defers on
    // failure; this is belt-and-suspenders.
  }
};

TaskManager.defineTask(GEOFENCE_TASK, geofenceTaskExecutor);

/** Whether background ("Always") location permission is currently granted.
 *  Always false where background presence isn't supported (Android — the build
 *  has no ACCESS_BACKGROUND_LOCATION, so the OS would deny it anyway). */
export async function hasBackgroundPermission(): Promise<boolean> {
  if (!BACKGROUND_PRESENCE_SUPPORTED) return false;
  try {
    const perm = await Location.getBackgroundPermissionsAsync();
    return perm.status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Request the two-step escalation to Always-location. Foreground must be granted
 * (NOT "Allow Once") before requesting background, or the background request
 * silently denies. Returns true only when background ("Always") is granted. The
 * app can't force the OS Always dialog — the caller deep-links to Settings when
 * this returns false. No-ops (false) on a platform without background presence —
 * it must never prompt for a permission the build doesn't declare.
 */
export async function ensureBackgroundPermission(): Promise<boolean> {
  if (!BACKGROUND_PRESENCE_SUPPORTED) return false;
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return false;
    const bg = await Location.requestBackgroundPermissionsAsync();
    return bg.status === 'granted';
  } catch {
    return false;
  }
}

export type StartGeofenceResult =
  | { status: 'started' }
  | {
      status: 'skipped';
      reason: 'unsupported' | 'disabled' | 'no-home' | 'no-background-permission';
    }
  | { status: 'error'; reason: string };

/**
 * Start (or replace) the home geofence. Gated on the background-presence opt-in,
 * a stored home coordinate, and Always permission — each a distinct skip reason
 * the caller can surface. Idempotent: startGeofencingAsync replaces any existing
 * registration for the task.
 */
export async function startHomeGeofence(
  home?: HomeGeofence | null,
): Promise<StartGeofenceResult> {
  try {
    if (!BACKGROUND_PRESENCE_SUPPORTED) {
      return { status: 'skipped', reason: 'unsupported' };
    }
    if (!(await isBackgroundPresenceEnabled())) {
      return { status: 'skipped', reason: 'disabled' };
    }
    const geo = home ?? (await getHomeGeofence());
    if (
      !geo ||
      typeof geo.latitude !== 'number' ||
      typeof geo.longitude !== 'number'
    ) {
      return { status: 'skipped', reason: 'no-home' };
    }
    if (!(await hasBackgroundPermission())) {
      return { status: 'skipped', reason: 'no-background-permission' };
    }
    await Location.startGeofencingAsync(GEOFENCE_TASK, [
      {
        identifier: HOME_REGION_ID,
        latitude: geo.latitude,
        longitude: geo.longitude,
        radius: geo.radiusMeters,
        notifyOnEnter: true,
        notifyOnExit: true,
      },
    ]);
    return { status: 'started' };
  } catch (e) {
    return { status: 'error', reason: e instanceof Error ? e.message : String(e) };
  }
}

/** Stop the home geofence if it's running (best-effort). */
export async function stopHomeGeofence(): Promise<void> {
  try {
    if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Re-arm the geofence on app launch/foreground when it *should* be running but
 * isn't. Android clears geofences on reboot / a Location off→on toggle and has
 * no BOOT_COMPLETED receiver here; iOS can also drop them. No-op when
 * background presence is off, no home is set, permission was revoked, or the
 * geofence is already registered.
 */
export async function rearmIfNeeded(): Promise<void> {
  try {
    if (!BACKGROUND_PRESENCE_SUPPORTED) {
      await cleanUpUnsupportedBackgroundPresence();
      return;
    }
    if (!(await isBackgroundPresenceEnabled())) return;
    const geo = await getHomeGeofence();
    if (!geo || typeof geo.latitude !== 'number' || typeof geo.longitude !== 'number') {
      return;
    }
    if (!(await hasBackgroundPermission())) return;
    if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) return;
    await startHomeGeofence(geo);
  } catch {
    /* best-effort */
  }
}

// ── Upgrade cleanup for platforms without background presence ────────────

/** Run the teardown below once per app launch, not on every foreground sync. */
let unsupportedCleanupDone = false;

/**
 * Tear down anything an OLDER build left armed on a platform that no longer
 * supports background presence (Android, which shipped background geofencing
 * before ACCESS_BACKGROUND_LOCATION was dropped for Play review). Stops a
 * lingering OS geofence registration and clears the stored opt-in, so the flag
 * can't keep downgrading keychain accessibility (tokenStorage) for a feature
 * that no longer runs. Best-effort and idempotent; never throws.
 */
async function cleanUpUnsupportedBackgroundPresence(): Promise<void> {
  if (unsupportedCleanupDone) return;
  unsupportedCleanupDone = true;
  try {
    await stopHomeGeofence();
    await setBackgroundPresenceEnabled(false);
  } catch {
    /* best-effort */
  }
}
