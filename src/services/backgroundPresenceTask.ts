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
 * ⚠️ `TaskManager.defineTask` MUST run at module top level (an import
 * side-effect), never inside a component/effect — on a cold background relaunch
 * only global scope executes. This module is imported first from `index.ts` so
 * the task is defined before anything else. Also: NEVER throw out of the
 * executor (an unhandled rejection is logged as a task failure).
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import {
  getHomeGeofence,
  isBackgroundPresenceEnabled,
  reportPresenceBg,
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

/** Whether background ("Always") location permission is currently granted. */
export async function hasBackgroundPermission(): Promise<boolean> {
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
 * this returns false.
 */
export async function ensureBackgroundPermission(): Promise<boolean> {
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
  | { status: 'skipped'; reason: 'disabled' | 'no-home' | 'no-background-permission' }
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
