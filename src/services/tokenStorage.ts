/**
 * Secure storage for JWT auth tokens.
 *
 * The access and refresh tokens are sensitive credentials, so they live in the
 * OS keychain (iOS Keychain / Android Keystore) via expo-secure-store — NOT
 * AsyncStorage, which is an unencrypted on-disk store readable from device
 * backups or on a compromised device.
 *
 * Biometric login (opt-in): when the user enables it, the durable refresh token
 * is rewritten with `requireAuthentication: true`, binding it to the device's
 * Secure Enclave / StrongBox. The OS then refuses to release that item without a
 * live Face ID / Touch ID / Class-3 biometric — so the silent session restore at
 * cold boot (AuthContext.bootstrapAuth) requires biometric unlock. This is an
 * OS-enforced gate, not a JS-layer check: an attacker reading the keychain
 * offline gets the gated REFRESH token only as ciphertext bound to hardware.
 *
 * Scope: ONLY the refresh token is gated. The short-lived access token stays
 * ungated (WHEN_UNLOCKED_THIS_DEVICE_ONLY: not in backups, device must be
 * unlocked, but no biometric) so the background refresh timer and the 401
 * interceptor can rotate it unattended without a biometric prompt mid-session.
 * So the durable re-auth credential (refresh token) is hardware-bound; the
 * access token remains a short-lived (~10 min) bearer credential recoverable on
 * a compromised/unlocked device for up to its TTL — it cannot mint new refresh
 * tokens, so it can't extend persistence past its expiry. K2 node keys
 * (k2Service.ts) are a separate store with their own (ungated) policy.
 *
 * Availability: a biometric failure/cancel/lockout/enrollment-change never
 * strands the user — the read returns a null refresh token (token left intact)
 * and the app falls back to email+password login. There is NO device-passcode
 * fallback inside the keychain prompt (expo-secure-store gates with
 * biometryCurrentSet / BIOMETRIC_STRONG only), so the password path is the sole
 * safety net by design.
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
  BIOMETRIC_LOGIN_ENABLED_KEY,
} from '../config/storageKeys';

const ACCESS_TOKEN_SECURE_KEY = 'jarvis_access_token';
const REFRESH_TOKEN_SECURE_KEY = 'jarvis_refresh_token';

// Keep tokens off iCloud/iTunes backups and unreadable while the device is
// locked. (keychainAccessible is iOS-only; on Android the Keystore key is
// inherently non-exportable, which gives the same "this device only" property.)
const PLAIN_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

// Gated refresh-token options: the OS keychain prompts for biometrics on read.
const biometricOpts = (): SecureStore.SecureStoreOptions => ({
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: true,
  authenticationPrompt: 'Unlock Jarvis',
});

/**
 * Whether this device can store an item with `requireAuthentication` — i.e. it
 * has enrolled, strong (Class-3) biometrics and (on iOS) the Face ID usage
 * string is present. Synchronous. Falls back to false if the API is
 * unavailable (older runtimes / Expo Go).
 */
export function biometricCapable(): boolean {
  try {
    return SecureStore.canUseBiometricAuthentication();
  } catch {
    return false;
  }
}

/** Whether the user has opted in to biometric login. */
export async function isBiometricLoginEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(BIOMETRIC_LOGIN_ENABLED_KEY)) === 'true';
  } catch {
    return false;
  }
}

/** Persist the biometric-login opt-in preference (boolean only — never a token). */
export async function setBiometricLoginEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(BIOMETRIC_LOGIN_ENABLED_KEY, enabled ? 'true' : 'false');
}

/**
 * Whether the refresh token should be stored behind biometrics. This follows
 * USER INTENT (the opt-in flag) only — NOT a momentary `biometricCapable()`
 * probe. Deciding the at-rest policy from a live capability check is unsafe:
 * a transient biometric lockout (too many failed attempts) makes
 * canUseBiometricAuthentication() return false, and a token rotation in that
 * window would silently rewrite the durable refresh token UNGATED. Capability
 * governs only whether the UI OFFERS the feature; an actual inability to create
 * a gated item is caught at write time (writeRefreshToken) and degraded there.
 */
async function refreshGateRequested(): Promise<boolean> {
  return isBiometricLoginEnabled();
}

async function writeRefreshToken(refreshToken: string, gated: boolean): Promise<void> {
  // ALWAYS delete first so the write is a CREATE, not an UPDATE. On iOS,
  // updating an existing item prompts for biometrics — and updating a GATED item
  // would prompt even when the user is DISABLING biometrics. CREATE never
  // prompts, so both enable and disable stay prompt-free on the write; the only
  // prompt is the READ at the next cold boot.
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_SECURE_KEY).catch(() => {});
  if (gated) {
    try {
      await SecureStore.setItemAsync(REFRESH_TOKEN_SECURE_KEY, refreshToken, biometricOpts());
      return;
    } catch (error) {
      // The device genuinely cannot store a gated item right now (no enrolled
      // biometrics / missing usage string). Degrade to ungated so the session
      // still persists rather than breaking login. This is the ONLY downgrade
      // path — a mere biometric lockout does NOT reach here, because a keychain
      // CREATE does not evaluate biometrics. The UI only offers opt-in on
      // capable devices, so this is rare.
      console.debug(
        '[tokenStorage] gated refresh write failed; storing ungated:',
        error instanceof Error ? error.message : error,
      );
    }
  }
  await SecureStore.setItemAsync(REFRESH_TOKEN_SECURE_KEY, refreshToken, PLAIN_OPTS);
}

/** Persist both tokens to the keychain (refresh gated iff biometric login is on). */
export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  const gated = await refreshGateRequested();
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_SECURE_KEY, accessToken, PLAIN_OPTS),
    writeRefreshToken(refreshToken, gated),
  ]);
}

/** Persist only the access token (e.g. after switch-household). Never gated. */
export async function setAccessToken(accessToken: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_SECURE_KEY, accessToken, PLAIN_OPTS);
}

export interface GetTokensResult {
  accessToken: string | null;
  refreshToken: string | null;
  /**
   * True when a biometric gate was active but the refresh-token read was
   * cancelled / failed (user cancel, lockout, or enrollment-changed
   * invalidation). The token is left intact in the keychain for a retry; the
   * caller should treat the session as locked, NOT cleared.
   */
  biometricCancelled: boolean;
}

/**
 * Read both tokens from the keychain. When biometric login is active, reading
 * the refresh token triggers the OS biometric prompt; a cancel/failure returns
 * a null refresh token with `biometricCancelled = true` (token NOT removed).
 *
 * One-time migration: if the keychain is empty but tokens written by an older
 * build exist in AsyncStorage, move them into the keychain and remove the
 * plaintext copies.
 */
export async function getTokens(): Promise<GetTokensResult> {
  const gated = await refreshGateRequested();

  let accessToken: string | null = null;
  try {
    accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_SECURE_KEY, PLAIN_OPTS);
  } catch {
    accessToken = null;
  }

  let refreshToken: string | null = null;
  let biometricCancelled = false;
  try {
    refreshToken = await SecureStore.getItemAsync(
      REFRESH_TOKEN_SECURE_KEY,
      gated ? biometricOpts() : PLAIN_OPTS,
    );
  } catch {
    // Cancel / lockout / invalidated-by-enrollment-change. Leave the item in
    // place; the caller falls back to password login and can retry biometrics.
    refreshToken = null;
    biometricCancelled = gated;
  }

  if (!accessToken && !refreshToken && !biometricCancelled) {
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

  return { accessToken, refreshToken, biometricCancelled };
}

/**
 * Remove the tokens from the keychain (and any leftover plaintext copies in
 * AsyncStorage). Called on logout and account deletion. deleteItemAsync never
 * requires authentication, so logout works even while biometric-locked.
 */
export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_SECURE_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_SECURE_KEY),
    AsyncStorage.removeItem(LEGACY_ACCESS_KEY),
    AsyncStorage.removeItem(LEGACY_REFRESH_KEY),
  ]);
}
