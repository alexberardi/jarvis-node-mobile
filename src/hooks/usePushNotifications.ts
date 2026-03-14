/**
 * Hook that manages push notification lifecycle.
 *
 * - Requests permissions and registers token on login
 * - Unregisters token on logout
 * - Listens for incoming notifications
 */

import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';

import { useAuth } from '../auth/AuthContext';
import {
  getExpoPushToken,
  registerPushToken,
  unregisterPushToken,
} from '../services/pushNotificationService';

export function usePushNotifications(onNotificationTap?: (data: Record<string, any>) => void) {
  const { state } = useAuth();
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const prevAuthRef = useRef(false);
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  // Register token when user authenticates
  useEffect(() => {
    if (state.isAuthenticated && state.accessToken && !prevAuthRef.current) {
      prevAuthRef.current = true;

      getExpoPushToken().then((token) => {
        if (token && state.accessToken) {
          setExpoPushToken(token);
          registerPushToken(state.accessToken, token);
        }
      });
    }

    // Unregister on logout
    if (!state.isAuthenticated && prevAuthRef.current) {
      prevAuthRef.current = false;

      if (expoPushToken && state.accessToken) {
        unregisterPushToken(state.accessToken, expoPushToken);
      }
      setExpoPushToken(null);
    }
  }, [state.isAuthenticated, state.accessToken, expoPushToken]);

  // Set up notification listeners
  useEffect(() => {
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('[Push] Notification received:', notification.request.content.title);
      },
    );

    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        console.log('[Push] Notification tapped:', data);
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
