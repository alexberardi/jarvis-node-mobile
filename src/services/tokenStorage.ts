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
  BG_PRESENCE_ENABLED_KEY,
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

// Background-readable options: readable/writable while the device is LOCKED
// (after the first unlock since boot), so the headless geofence task can report
// presence and rotate tokens from the background. Still THIS_DEVICE_ONLY (never
// in backups) and never gated. Applied to BOTH tokens only when the user has
// opted into background presence AND biometric login is OFF (biometric wins the
// refresh token below).
const BG_PLAIN_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/** Whether background presence is on — drives the at-rest keychain policy. */
async function backgroundPresenceEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(BG_PRESENCE_ENABLED_KEY)) === 'true';
  } catch {
    return false;
  }
}

/**
 * Decide the at-rest keychain policy for the two token items from the two
 * opt-ins, so every write goes through ONE decision (no path can silently
 * downgrade a background user's access item to locked-unreadable, and no path
 * can strand a background token behind a WHEN_UNLOCKED gate). Biometric login
 * ALWAYS wins the refresh token — it stays gated, and the background task then
 * gets access-token-only best-effort. Background presence (biometric off)
 * relaxes BOTH items to AFTER_FIRST_UNLOCK so the headless task can read/write
 * them while the phone is locked.
 */
async function computeAccessibility(): Promise<{
  access: SecureStore.SecureStoreOptions;
  refresh: SecureStore.SecureStoreOptions;
}> {
  const [bioOn, bgOn] = await Promise.all([
    refreshGateRequested(),
    backgroundPresenceEnabled(),
  ]);
  const access = bgOn ? BG_PLAIN_OPTS : PLAIN_OPTS;
  const refresh = bioOn ? biometricOpts() : bgOn ? BG_PLAIN_OPTS : PLAIN_OPTS;
  return { access, refresh };
}

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

async function writeRefreshToken(
  refreshToken: string,
  opts: SecureStore.SecureStoreOptions,
): Promise<void> {
  // ALWAYS delete first so the write is a CREATE, not an UPDATE. On iOS,
  // updating an existing item prompts for biometrics — and updating a GATED item
  // would prompt even when the user is DISABLING biometrics. CREATE never
  // prompts, so both enable and disable stay prompt-free on the write; the only
  // prompt is the READ at the next cold boot.
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_SECURE_KEY).catch(() => {});
  if (opts.requireAuthentication) {
    try {
      await SecureStore.setItemAsync(REFRESH_TOKEN_SECURE_KEY, refreshToken, opts);
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
      await SecureStore.setItemAsync(REFRESH_TOKEN_SECURE_KEY, refreshToken, PLAIN_OPTS);
      return;
    }
  }
  await SecureStore.setItemAsync(REFRESH_TOKEN_SECURE_KEY, refreshToken, opts);
}

/**
 * Persist the access token as a CREATE (delete-before-set) so a change of
 * accessibility class — e.g. toggling background presence flips it between
 * WHEN_UNLOCKED and AFTER_FIRST_UNLOCK — is a clean re-key rather than an
 * in-place update that could leave the stale accessibility attribute in place.
 * The access token is never gated, so this never prompts.
 */
async function writeAccessToken(
  accessToken: string,
  opts: SecureStore.SecureStoreOptions,
): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_SECURE_KEY).catch(() => {});
  await SecureStore.setItemAsync(ACCESS_TOKEN_SECURE_KEY, accessToken, opts);
}

/**
 * Persist both tokens to the keychain under the current policy
 * (`computeAccessibility`): refresh gated iff biometric login is on; both
 * background-readable iff background presence is on (biometric off).
 */
export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  const { access, refresh } = await computeAccessibility();
  await Promise.all([
    writeAccessToken(accessToken, access),
    writeRefreshToken(refreshToken, refresh),
  ]);
}

/** Persist only the access token (e.g. after switch-household). Never gated. */
export async function setAccessToken(accessToken: string): Promise<void> {
  const { access } = await computeAccessibility();
  await writeAccessToken(accessToken, access);
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

// ── Background-task token access (Phase 3) ──────────────────────────────
// The headless geofence task runs with no React tree and often while the
// device is locked. These helpers give it prompt-free, best-effort token
// access and let the foreground survive a token the background rotated
// out-of-band. See services/backgroundPresenceTask.ts + api/apiClient.ts.

/**
 * Prompt-free token read for the headless background task. The access token's
 * accessibility is a WRITE-time attribute — a locked-readable AFTER_FIRST_UNLOCK
 * item reads fine here — so we read with plain options and never pass
 * `requireAuthentication`. The refresh token is read ONLY when biometric login
 * is OFF (a gated item would trip a biometric prompt the background can't
 * satisfy → biometric users get access-token-only best-effort). Returns nulls
 * on a locked-unreadable / missing item rather than throwing.
 */
export async function readTokenForBg(): Promise<{ access: string | null; refresh: string | null }> {
  const bioOn = await refreshGateRequested();
  let access: string | null = null;
  try {
    access = await SecureStore.getItemAsync(ACCESS_TOKEN_SECURE_KEY, PLAIN_OPTS);
  } catch {
    access = null;
  }
  let refresh: string | null = null;
  if (!bioOn) {
    try {
      refresh = await SecureStore.getItemAsync(REFRESH_TOKEN_SECURE_KEY, PLAIN_OPTS);
    } catch {
      refresh = null;
    }
  }
  return { access, refresh };
}

/**
 * Persist a token pair rotated by the BACKGROUND task. Forces the
 * background-readable (AFTER_FIRST_UNLOCK, ungated) policy directly rather than
 * recomputing it — this path is only ever reached on the non-biometric
 * background-refresh flow, and forcing the class keeps it deterministic in the
 * headless context (where a mis-read opt-in must not gate the token).
 */
export async function persistBgRotatedTokens(
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  await Promise.all([
    writeAccessToken(accessToken, BG_PLAIN_OPTS),
    writeRefreshToken(refreshToken, BG_PLAIN_OPTS),
  ]);
}

/**
 * Read the durable refresh token WITHOUT a biometric prompt, for the foreground
 * `doRefresh` safeguard: on a 401 from /auth/refresh the in-memory token we sent
 * may be a stale ANCESTOR of what the background task rotated into the keychain
 * (the ~10s auth grace window has long passed on resume). Re-reading the durable
 * tail lets the foreground retry with the live token instead of force-logging
 * out. Returns null when biometric login is on — those users have no background
 * rotation (so the safeguard doesn't apply), and we must not prompt here.
 */
export async function readDurableRefreshToken(): Promise<string | null> {
  const bioOn = await refreshGateRequested();
  if (bioOn) return null;
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_SECURE_KEY, PLAIN_OPTS);
  } catch {
    return null;
  }
}
