/**
 * Centralized clear of all per-user / per-environment caches.
 *
 * Called when the user logs out OR switches the manual config URL.
 * Without this, dev-environment data (nodes, devices, K2 keys, cached
 * service URLs, react-query cache entries keyed by householdId) bleeds
 * into the next environment the user logs into.
 *
 * Preserves only true UI preferences (theme, auto-play, push toggle).
 * Everything else — auth tokens, household, cached service config,
 * manual URL override, routine bindings, react-query cache, K2 in-memory
 * userId — is wiped. Triggers a fresh service discovery so the app
 * immediately reconnects against the new environment.
 *
 * SecureStore K2 keys (`jarvis_k2_u{userId}_{nodeId}`) are intentionally
 * NOT deleted: they are scoped by userId and unreachable to any other
 * user. Deleting them would force re-provisioning of the current user's
 * own nodes if they log back in on the same device.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';

import { setK2UserId } from './k2Service';

const PRESERVE_KEYS = new Set<string>([
  '@jarvis/theme',
  '@jarvis/auto_play_tts',
  '@jarvis/push_notifications_enabled',
]);

interface ClearUserDataOptions {
  queryClient?: QueryClient;
  rediscover?: () => Promise<void>;
}

export async function clearUserData(
  opts: ClearUserDataOptions = {},
): Promise<void> {
  const { queryClient, rediscover } = opts;

  const allKeys = await AsyncStorage.getAllKeys();
  const keysToRemove = allKeys.filter(
    (k) =>
      (k.startsWith('@jarvis/') && !PRESERVE_KEYS.has(k)) ||
      k.startsWith('routine_bindings:'),
  );

  if (keysToRemove.length > 0) {
    await AsyncStorage.multiRemove(keysToRemove);
  }

  setK2UserId(null);

  if (queryClient) {
    queryClient.clear();
  }

  if (rediscover) {
    try {
      await rediscover();
    } catch (e) {
      console.warn('[clearUserData] Rediscovery failed:', e);
    }
  }
}
