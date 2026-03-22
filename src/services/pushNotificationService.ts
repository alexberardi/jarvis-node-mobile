/**
 * Push notification registration and token management.
 *
 * Handles requesting permissions, obtaining the Expo push token,
 * and registering/unregistering it with jarvis-notifications.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { getServiceConfig } from '../config/serviceConfig';
import { PUSH_NOTIFICATIONS_KEY } from '../config/storageKeys';

export { PUSH_NOTIFICATIONS_KEY };

/**
 * Check if push notifications are enabled by the user.
 * Defaults to true for existing users who haven't set a preference.
 */
export async function arePushNotificationsEnabled(): Promise<boolean> {
  const val = await AsyncStorage.getItem(PUSH_NOTIFICATIONS_KEY);
  return val !== 'false';
}

/**
 * Set the push notifications preference.
 */
export async function setPushNotificationsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(PUSH_NOTIFICATIONS_KEY, enabled ? 'true' : 'false');
}

// Configure default notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request push notification permissions and return the Expo push token.
 * Returns null if permissions denied or not a physical device.
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn('[Push] Push notifications require a physical device');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[Push] Push notification permission denied');
    return null;
  }

  // Android needs a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.error('[Push] No EAS projectId found in app.json');
    return null;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  return tokenData.data;
}

/**
 * Register a push token with jarvis-notifications.
 */
export async function registerPushToken(
  accessToken: string,
  expoPushToken: string,
  deviceName?: string,
): Promise<boolean> {
  const { notificationsUrl } = getServiceConfig();
  if (!notificationsUrl) {
    console.warn('[Push] Notifications service URL not configured');
    return false;
  }

  try {
    const res = await fetch(`${notificationsUrl}/api/v0/tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        push_token: expoPushToken,
        device_type: Platform.OS,
        device_name: deviceName ?? `${Device.modelName ?? 'Unknown'} (${Platform.OS})`,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('[Push] Failed to register token:', res.status, body);
      return false;
    }

    console.debug('[Push] Token registered successfully');
    return true;
  } catch (error) {
    console.error('[Push] Registration error:', error);
    return false;
  }
}

/**
 * Unregister a push token from jarvis-notifications.
 */
export async function unregisterPushToken(
  accessToken: string,
  expoPushToken: string,
): Promise<boolean> {
  const { notificationsUrl } = getServiceConfig();
  if (!notificationsUrl) return false;

  try {
    const res = await fetch(`${notificationsUrl}/api/v0/tokens`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ push_token: expoPushToken }),
    });

    if (!res.ok) {
      console.error('[Push] Failed to unregister token:', res.status);
      return false;
    }

    console.debug('[Push] Token unregistered');
    return true;
  } catch (error) {
    console.error('[Push] Unregister error:', error);
    return false;
  }
}
