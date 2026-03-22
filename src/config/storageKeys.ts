/**
 * Centralized storage key constants.
 *
 * All AsyncStorage and SecureStore keys in one place to avoid
 * duplication and ensure consistent naming.
 */

// ── AsyncStorage keys ────────────────────────────────────────────────────

/** JWT access token */
export const ACCESS_TOKEN_KEY = '@jarvis/access_token';
/** JWT refresh token */
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
/** Push notifications enabled: 'true' | 'false' */
export const PUSH_NOTIFICATIONS_KEY = '@jarvis/push_notifications_enabled';

/** Serialized routine definitions */
export const ROUTINES_KEY = '@jarvis/routines';
/** Routine seed version marker */
export const ROUTINES_SEEDED_KEY = '@jarvis/routines_seeded_v2';

// ── SecureStore keys ─────────────────────────────────────────────────────

/** Cached LLM API key for routine builder / suggest */
export const ROUTINE_API_KEY = 'jarvis_routine_api_key';
