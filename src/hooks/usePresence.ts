/**
 * Hook that drives foreground presence reporting.
 *
 * Mirrors the usePushNotifications lifecycle: samples location and reports
 * home/away when the user logs in, when the active household becomes known, and
 * whenever the app returns to the foreground (AppState → active). It also ticks
 * on a slow interval while foregrounded so a long-open session keeps the
 * server's presence fresh (the heartbeat in presenceService). On logout it
 * forgets the last-reported state so the next session reports fresh.
 *
 * Phase 3: on each foreground sync it also (a) FLUSHES any deferred edges the
 * background geofence task couldn't report (locked phone / offline), before the
 * live sample so those edges land first, and (b) RE-ARMS the OS geofence if it
 * was cleared (Android reboot / Location toggle). The heavy background geofence
 * lives in services/backgroundPresenceTask; this hook stays the foreground fast
 * path.
 *
 * All the gating lives in presenceService — reportIfChanged/flushPendingQueue
 * silently no-op when presence is disabled, no home is set, or location
 * permission isn't already granted, and reportIfChanged reports only on a
 * *change* (or a stale heartbeat). So this hook can call them liberally.
 */
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { rearmIfNeeded } from '../services/backgroundPresenceTask';
import {
  clearLastPresenceState,
  flushPendingQueue,
  reportIfChanged,
  REFRESH_AFTER_MS,
} from '../services/presenceService';

// How often to re-sample while the app stays in the foreground. Shorter than
// the heartbeat window so a still-open app re-asserts before the server TTL.
const HEARTBEAT_TICK_MS = Math.min(REFRESH_AFTER_MS, 30 * 60 * 1000);

export function usePresence(): void {
  const { state } = useAuth();
  const { isAuthenticated, activeHouseholdId, user } = state;
  const userId = user?.id;
  const name = user?.username;

  const canReport = isAuthenticated && !!activeHouseholdId && userId !== undefined;

  // Flush deferred background edges, then take a fresh foreground sample, and
  // re-arm the OS geofence if it was cleared. Flush BEFORE the live sample so
  // its edges land first and the sample no-ops on unchanged state (both write
  // the same per-(household,user) last-state map) instead of racing it.
  const syncPresence = useCallback(() => {
    if (!canReport) return;
    const hh = activeHouseholdId as string;
    const uid = userId as number;
    rearmIfNeeded().catch(() => {});
    flushPendingQueue(hh, uid, name)
      .catch(() => {})
      .finally(() => {
        reportIfChanged(hh, uid, name).catch(() => {});
      });
  }, [canReport, activeHouseholdId, userId, name]);

  // Sample on login and whenever the active household becomes known/changes.
  useEffect(() => {
    syncPresence();
  }, [syncPresence]);

  // Forget the remembered state on logout so the next login reports fresh
  // (a different user, or a re-arrival, should not be masked by a stale
  // "home" from the previous session). Per-user keying already prevents
  // cross-user masking; this is belt-and-suspenders cleanup.
  const wasAuthedRef = useRef(false);
  useEffect(() => {
    if (isAuthenticated) {
      wasAuthedRef.current = true;
    } else if (wasAuthedRef.current) {
      wasAuthedRef.current = false;
      clearLastPresenceState().catch(() => {});
    }
  }, [isAuthenticated]);

  // Re-sample when the app comes to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') syncPresence();
    });
    return () => sub.remove();
  }, [syncPresence]);

  // Heartbeat while foregrounded: a phone left open all day never fires an
  // AppState → active edge, so without this a still-valid "home" would expire
  // server-side. The tick is a no-op unless the last report has gone stale.
  useEffect(() => {
    if (!canReport) return;
    const id = setInterval(() => {
      if (AppState.currentState === 'active') {
        reportIfChanged(activeHouseholdId as string, userId as number, name).catch(() => {});
      }
    }, HEARTBEAT_TICK_MS);
    return () => clearInterval(id);
  }, [canReport, activeHouseholdId, userId, name]);
}
