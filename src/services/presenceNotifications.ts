/**
 * Local arrive/leave notifications — "Welcome home" / "You've left home" fired
 * on a presence STATE CHANGE, from both the background geofence task
 * (reportPresenceBg) and the foreground sample (reportIfChanged). Opt-in via the
 * "Notify me when I arrive/leave" toggle (PRESENCE_NOTIFY_ENABLED_KEY), separate
 * from the detection toggles.
 *
 * Purely local (expo-notifications, immediate trigger) — no server round-trip —
 * so it works from the headless geofence task even when the app is terminated.
 * Never throws: presence reporting must never depend on notifications.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import type { PresenceState } from '../api/presenceApi';
import { PRESENCE_NOTIFY_ENABLED_KEY } from '../config/storageKeys';

/** Whether the user opted into arrive/leave notifications. */
export const isPresenceNotifyEnabled = async (): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(PRESENCE_NOTIFY_ENABLED_KEY)) === 'true';
  } catch {
    return false;
  }
};

/** Persist the arrive/leave-notification opt-in (boolean only — never a token). */
export const setPresenceNotifyEnabled = async (enabled: boolean): Promise<void> => {
  await AsyncStorage.setItem(PRESENCE_NOTIFY_ENABLED_KEY, enabled ? 'true' : 'false');
};

/**
 * Request notification permission — call ONLY from an explicit user action (the
 * settings toggle). Returns true if granted. Never throws.
 */
export const ensureNotifyPermission = async (): Promise<boolean> => {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') return true;
    const req = await Notifications.requestPermissionsAsync();
    return req.status === 'granted';
  } catch {
    return false;
  }
};

/**
 * Fire a local arrive/leave notification for a presence CHANGE. No-op unless the
 * user opted in AND notification permission is already granted (we never prompt
 * from here — the background task can't). Best-effort; never throws.
 */
export const firePresenceNotification = async (
  state: PresenceState,
  name?: string,
): Promise<void> => {
  try {
    if (!(await isPresenceNotifyEnabled())) return;
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted') return;
    const title =
      state === 'home' ? `Welcome home${name ? `, ${name}` : ''}` : 'You’ve left home';
    const body =
      state === 'home'
        ? 'Jarvis detected you’re home.'
        : 'Jarvis detected you’ve left home.';
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null, // present immediately
    });
  } catch {
    /* best-effort — presence reporting must not depend on notifications */
  }
};
