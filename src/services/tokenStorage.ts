/**
 * Secure storage for JWT auth tokens.
 *
 * The access and refresh tokens are sensitive credentials, so they live in the
 * OS keychain (iOS Keychain / Android Keystore) via expo-secure-store — NOT
 * AsyncStorage, which is an unencrypted on-disk store readable from device
 * backups or on a compromised device.
 *
 * SecureStore keys must match [A-Za-z0-9._-], so the legacy AsyncStorage keys
 * ('@jarvis/...') can't be reused here. Tokens written by older builds (which
 * used AsyncStorage) are migrated into the keychain on first read.
 *
 * Non-secret session data (the user blob, active household id) stays in
 * AsyncStorage — see AuthContext.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import {
  ACCESS_TOKEN_KEY as LEGACY_ACCESS_KEY,
  REFRESH_TOKEN_KEY as LEGACY_REFRESH_KEY,
} from '../config/storageKeys';

const ACCESS_TOKEN_SECURE_KEY = 'jarvis_access_token';
const REFRESH_TOKEN_SECURE_KEY = 'jarvis_refresh_token';

/** Persist both tokens to the keychain. */
export async function setTokens(
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_SECURE_KEY, accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_SECURE_KEY, refreshToken),
  ]);
}

/** Persist only the access token (e.g. after switch-household). */
export async function setAccessToken(accessToken: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_SECURE_KEY, accessToken);
}

/**
 * Read both tokens from the keychain.
 *
 * One-time migration: if the keychain is empty but tokens written by an older
 * build exist in AsyncStorage, move them into the keychain and remove the
 * plaintext copies.
 */
export async function getTokens(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
}> {
  let accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_SECURE_KEY);
  let refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_SECURE_KEY);

  if (!accessToken && !refreshToken) {
    const [legacyAccess, legacyRefresh] = await Promise.all([
      AsyncStorage.getItem(LEGACY_ACCESS_KEY),
      AsyncStorage.getItem(LEGACY_REFRESH_KEY),
    ]);
    if (legacyAccess && legacyRefresh) {
      await setTokens(legacyAccess, legacyRefresh);
      await AsyncStorage.multiRemove([LEGACY_ACCESS_KEY, LEGACY_REFRESH_KEY]);
      accessToken = legacyAccess;
      refreshToken = legacyRefresh;
    }
  }

  return { accessToken, refreshToken };
}

/**
 * Remove the tokens from the keychain (and any leftover plaintext copies in
 * AsyncStorage). Called on logout and account deletion.
 */
export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_SECURE_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_SECURE_KEY),
    AsyncStorage.removeItem(LEGACY_ACCESS_KEY),
    AsyncStorage.removeItem(LEGACY_REFRESH_KEY),
  ]);
}
