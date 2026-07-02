/**
 * Centralized storage key constants.
 *
 * All AsyncStorage and SecureStore keys in one place to avoid
 * duplication and ensure consistent naming.
 */

// ── AsyncStorage keys ────────────────────────────────────────────────────

/**
 * Legacy JWT token keys. Tokens now live in the OS keychain (see
 * services/tokenStorage.ts); these remain only so older AsyncStorage-stored
 * tokens can be migrated into the keychain on first launch after upgrade.
 */
export const ACCESS_TOKEN_KEY = '@jarvis/access_token';
export const REFRESH_TOKEN_KEY = '@jarvis/refresh_token';
/** Serialized user object */
export const USER_KEY = '@jarvis/user';
/** Active household ID */
export const ACTIVE_HOUSEHOLD_KEY = '@jarvis/active_household_id';

/** Cached service config (auth, CC, notifications URLs) */
export const SERVICE_CONFIG_KEY = '@jarvis/service_config';
/** Manual config service URL override */
export const MANUAL_CONFIG_URL_KEY = '@jarvis/manual_config_url';

/** Theme preference: 'light' | 'dark' | 'system' */
export const THEME_KEY = '@jarvis/theme';

/** Auto-play TTS responses: 'true' | 'false' */
export const AUTO_PLAY_TTS_KEY = '@jarvis/auto_play_tts';
/** Last voice node selected on the chat screen (restored on launch / quick-open) */
export const LAST_NODE_KEY = '@jarvis/last_node_id';
/**
 * A node that was just provisioned and is booting up. Serialized as
 * `{ nodeId, ts }`. While set, the chat screen polls for the node to come
 * online so it appears without an app restart. See PendingNodeContext.
 */
export const PENDING_NODE_KEY = '@jarvis/pending_node';
/** Push notifications enabled: 'true' | 'false' */
export const PUSH_NOTIFICATIONS_KEY = '@jarvis/push_notifications_enabled';
/**
 * Biometric login opt-in: 'true' | 'false'. Stores ONLY the boolean preference,
 * never any token/secret. When 'true', tokenStorage gates the refresh token
 * behind the OS keychain's biometric access control. Not preserved across
 * logout (the token is wiped anyway), so it's re-chosen on each login.
 */
export const BIOMETRIC_LOGIN_ENABLED_KEY = '@jarvis/biometric_login_enabled';
/**
 * 'true' while the session was opened with an admin-issued temporary password
 * and the user hasn't set a real one yet. Mirrors the server's
 * users.must_change_password. Gates the whole app behind
 * ForcePasswordChangeScreen (see RootNavigator); restored on cold boot,
 * cleared by change-password and by clearUserData on logout.
 */
export const MUST_CHANGE_PASSWORD_KEY = '@jarvis/must_change_password';

// Routines are server-owned (command-center) — no local routine storage keys.
