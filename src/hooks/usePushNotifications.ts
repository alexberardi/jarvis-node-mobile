/**
 * Hook that manages push notification lifecycle.
 *
 * - Requests permissions and registers the token once per session — every
 *   login, every successful password change, every cold-boot restore (keyed on
 *   AuthState.sessionEpoch). Registration is an upsert server-side, so a
 *   repeat is harmless; this just avoids re-posting on every token refresh.
 * - Skips temp-password sessions: jarvisd answers 403 password_change_required
 *   until the password is changed, and the change bumps the epoch, which
 *   registers then.
 * - A failed registration is retried on the next access-token change.
 * - Unregisters token on logout
 * - Listens for incoming notifications
 */

import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';

import { useAuth } from '../auth/AuthContext';
import {
  arePushNotificationsEnabled,
  getExpoPushToken,
  registerPushToken,
  unregisterPushToken,
} from '../services/pushNotificationService';

export function usePushNotifications(onNotificationTap?: (data: Record<string, any>) => void) {
  const { state } = useAuth();
  const { isAuthenticated, accessToken, mustChangePassword, sessionEpoch } = state;
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  // Mirror for the effect below, so storing the token doesn't re-run it (a
  // re-run right after a failed POST would retry with the same dead token).
  const expoPushTokenRef = useRef<string | null>(null);
  const prevAuthRef = useRef(false);
  // The session (epoch) this device is registered — or registering — for.
  const registeredEpochRef = useRef<number | null>(null);
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  // Register token once per usable session
  useEffect(() => {
    if (isAuthenticated && accessToken && !mustChangePassword) {
      prevAuthRef.current = true;
      if (registeredEpochRef.current === sessionEpoch) return;
      registeredEpochRef.current = sessionEpoch;
      const epoch = sessionEpoch;

      (async () => {
        if (!(await arePushNotificationsEnabled())) return;
        const token = await getExpoPushToken();
        if (!token) return;
        expoPushTokenRef.current = token;
        setExpoPushToken(token);
        const ok = await registerPushToken(accessToken, token);
        // Let the next access-token change retry, unless a newer session
        // already took over.
        if (!ok && registeredEpochRef.current === epoch) registeredEpochRef.current = null;
      })().catch((err) => {
        console.debug('[Push] Registration skipped:', err instanceof Error ? err.message : err);
        if (registeredEpochRef.current === epoch) registeredEpochRef.current = null;
      });
    }

    // Unregister on logout
    if (!isAuthenticated && prevAuthRef.current) {
      prevAuthRef.current = false;
      registeredEpochRef.current = null;

      if (expoPushTokenRef.current && accessToken) {
        unregisterPushToken(accessToken, expoPushTokenRef.current);
      }
      expoPushTokenRef.current = null;
      setExpoPushToken(null);
    }
  }, [isAuthenticated, accessToken, mustChangePassword, sessionEpoch]);

  // Set up notification listeners
  useEffect(() => {
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.debug('[Push] Notification received:', notification.request.content.title);
      },
    );

    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        console.debug('[Push] Notification tapped:', data);
        if (onNotificationTap && data) {
          onNotificationTap(data as Record<string, any>);
        }
      },
    );

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  return { expoPushToken };
}
