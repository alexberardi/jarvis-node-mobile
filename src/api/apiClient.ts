/**
 * Authenticated axios instances with automatic token refresh on 401.
 *
 * `apiClient` is the JWT-authenticated client for command-center and the
 * other services. The SAME refresh behaviour is also attached to `authApi`
 * (the auth-service client) here, so auth-service data calls — GET
 * /households, /auth/switch-household, /invites/* — can't silently fail on a
 * stale token either. Before this, those calls used the raw `authApi` with a
 * manually-attached token and a `catch → return []`, so an expired session
 * surfaced as a blank list with no error and no re-login prompt.
 *
 * The shared interceptor catches a 401, refreshes the access token once
 * (single-flight across BOTH clients), retries the original request, and —
 * if the refresh itself fails — forces a logout so the user lands on the
 * login screen instead of an empty screen.
 *
 * Token getter/setter are wired up by AuthContext at mount time via
 * `configureApiClient()`.
 */
import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

import authApi from './authApi';

// ── Token bridge (set by AuthContext) ──────────────────────────────────

type TokenGetter = () => string | null;
type RefreshTokenGetter = () => string | null;
type TokenUpdater = (access: string, refresh: string) => void | Promise<void>;
type LogoutFn = () => void;

let getAccessToken: TokenGetter = () => null;
let getRefreshToken: RefreshTokenGetter = () => null;
let updateTokens: TokenUpdater = () => {};
let onForceLogout: LogoutFn = () => {};

/**
 * Called once by AuthProvider to wire up token access.
 */
export const configureApiClient = (opts: {
  getAccessToken: TokenGetter;
  getRefreshToken: RefreshTokenGetter;
  updateTokens: TokenUpdater;
  onForceLogout: LogoutFn;
}): void => {
  getAccessToken = opts.getAccessToken;
  getRefreshToken = opts.getRefreshToken;
  updateTokens = opts.updateTokens;
  onForceLogout = opts.onForceLogout;
};

// ── Axios instance ─────────────────────────────────────────────────────

const apiClient = axios.create({
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

// Attach current access token to every apiClient request
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Shared single-flight refresh + 401 retry ───────────────────────────

let refreshPromise: Promise<string | null> | null = null;

const doRefresh = async (): Promise<string | null> => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    // No session left to refresh — drop to the login screen rather than
    // lingering authenticated-but-broken behind empty/stale screens.
    onForceLogout();
    return null;
  }

  try {
    const res = await authApi.post<{ access_token: string; refresh_token?: string }>(
      '/auth/refresh',
      { refresh_token: refreshToken },
    );
    const newAccess = res.data.access_token;
    const newRefresh = res.data.refresh_token ?? refreshToken;
    // Await persistence: the auth server ROTATES refresh tokens, so the new one
    // must be committed to the keychain before the next refresh can fire —
    // otherwise a later path could replay the now-rotated token.
    await updateTokens(newAccess, newRefresh);
    return newAccess;
  } catch (err) {
    // A 401/403 means the refresh token itself is dead → the session is over;
    // force a clean logout so the user lands on the login screen, never on a
    // borked node/device screen. A network/5xx error is transient — keep the
    // user signed in and let the next attempt (or the still-valid access token)
    // recover.
    const status = (err as AxiosError)?.response?.status;
    if (status === 401 || status === 403) {
      onForceLogout();
    }
    return null;
  }
};

/**
 * Single-flight refresh shared across the 401 interceptor AND external callers
 * (AuthContext's background timer and AppState-resume refresh). Routing every
 * refresh through this one in-flight promise guarantees the rotated refresh
 * token is never double-spent — a stale replay would be rejected by the server
 * (and, in strict mode, could revoke the whole session family).
 */
export const refreshAuthToken = (): Promise<string | null> => {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
};

// Auth-service endpoints where a 401 is NOT a stale-session signal: the
// refresh call itself (retrying it would recurse) and the credential
// endpoints where a 401 means bad credentials, not an expired session.
// Everything else on the auth service (/households, /invites,
// /auth/switch-household) gets the refresh-and-retry treatment.
const SKIP_REFRESH_PATHS = new Set<string>([
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/me',
]);

/**
 * Attach "401 → refresh once → retry, else force-logout" to an axios
 * instance. Applied to both `apiClient` and `authApi` so neither can turn a
 * stale token into a silent empty result. The refresh is single-flight and
 * shared across both clients via the module-level `refreshPromise`.
 */
const attachAuthRefresh = (instance: AxiosInstance): void => {
  // Defensive: some unit tests replace authApi with a plain stub that has
  // no `interceptors`. Skip rather than crash at module load — real axios
  // instances always have it.
  if (!instance?.interceptors?.response) return;
  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const original = error.config as
        | (InternalAxiosRequestConfig & { _retried?: boolean })
        | undefined;

      // Only intercept 401s we can act on, only retry once, and never try
      // to refresh against the credential/refresh endpoints themselves.
      if (
        !original ||
        error.response?.status !== 401 ||
        original._retried ||
        SKIP_REFRESH_PATHS.has(original.url ?? '')
      ) {
        return Promise.reject(error);
      }

      original._retried = true;

      // Shared single-flight refresh — coalesces concurrent 401s across BOTH
      // axios instances AND the AuthContext background timer / resume refresh,
      // so the rotated refresh token is never double-spent.
      const newToken = await refreshAuthToken();
      if (!newToken) {
        // Refresh failed. `doRefresh` has already forced a logout if the
        // session is genuinely dead (no refresh token, or a 401/403 from
        // /auth/refresh). A transient network failure just rejects here so the
        // caller surfaces/retries — no spurious logout.
        return Promise.reject(error);
      }

      // Retry original request with the new token
      original.headers.Authorization = `Bearer ${newToken}`;
      return instance(original);
    },
  );
};

attachAuthRefresh(apiClient);
attachAuthRefresh(authApi);

/**
 * Returns the current access token (if any). Useful for non-axios requests
 * (e.g. XMLHttpRequest/SSE) that need JWT auth outside the interceptor.
 */
export const getCurrentAccessToken = (): string | null => getAccessToken();

export default apiClient;
