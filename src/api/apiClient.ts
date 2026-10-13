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
 * It is also the ONE place that decides a session is over. Two signals end it:
 *  - a 401 that survives the refresh attempt (refresh token expired/revoked,
 *    user deleted) → reason `session_expired`;
 *  - a 403 `{"code": "password_change_required"}` (an admin issued a
 *    temp-password reset; jarvisd cuts off every route but GET /auth/me and
 *    POST /auth/change-password, even for tokens issued before the reset)
 *    → reason `password_reset`. Ignored while the app is already showing the
 *    forced-change screen (`isPasswordChangePending`), where it's expected.
 * `forceLogout` fires at most once per access token, and never once the token
 * is gone, so a burst of failing requests produces one logout and one notice,
 * and nothing after the logout can loop back into it.
 *
 * Token getter/setter are wired up by AuthContext at mount time via
 * `configureApiClient()`.
 */
import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

import authApi from './authApi';
import { readDurableRefreshToken } from '../services/tokenStorage';

// ── Token bridge (set by AuthContext) ──────────────────────────────────

type TokenGetter = () => string | null;
type RefreshTokenGetter = () => string | null;
type TokenUpdater = (access: string, refresh: string) => void | Promise<void>;
/** Why the client ended the session — drives the notice on the login screen. */
export type ForceLogoutReason = 'session_expired' | 'password_reset';
type LogoutFn = (reason: ForceLogoutReason) => void;

let getAccessToken: TokenGetter = () => null;
let getRefreshToken: RefreshTokenGetter = () => null;
let updateTokens: TokenUpdater = () => {};
let onForceLogout: LogoutFn = () => {};
let isPasswordChangePending: () => boolean = () => false;

// The access token a forced logout was last fired for. Requests in flight when
// the session dies all carry (and see) that same token until AuthContext's
// state update lands, so this collapses a burst into one logout.
let loggedOutToken: string | null = null;

/**
 * Called once by AuthProvider to wire up token access.
 */
export const configureApiClient = (opts: {
  getAccessToken: TokenGetter;
  getRefreshToken: RefreshTokenGetter;
  updateTokens: TokenUpdater;
  onForceLogout: LogoutFn;
  /** True while the forced password-change screen is up (temp-password
   *  session): a `password_change_required` 403 is expected then. */
  isPasswordChangePending?: () => boolean;
}): void => {
  getAccessToken = opts.getAccessToken;
  getRefreshToken = opts.getRefreshToken;
  updateTokens = opts.updateTokens;
  onForceLogout = opts.onForceLogout;
  isPasswordChangePending = opts.isPasswordChangePending ?? (() => false);
  loggedOutToken = null;
};

/**
 * End the session once. No-op when there is no session left (already logged
 * out — e.g. a straggler request, or the best-effort /auth/logout revoke) or
 * when this session was already ended.
 */
const forceLogout = (reason: ForceLogoutReason): void => {
  const token = getAccessToken();
  if (!token || token === loggedOutToken) return;
  loggedOutToken = token;
  onForceLogout(reason);
};

/** jarvisd's "temp password must be changed first" answer (403, not 401). */
export const isPasswordChangeRequiredError = (error: unknown): boolean => {
  const response = (error as AxiosError<{ code?: string }> | undefined)?.response;
  return response?.status === 403 && response.data?.code === 'password_change_required';
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
    forceLogout('session_expired');
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
    // A 401/403 means the refresh token we sent was rejected. Usually that means
    // the session is over → force a clean logout. But the background geofence
    // task can rotate the refresh chain out-of-band while the app is
    // backgrounded/terminated, leaving our IN-MEMORY copy a stale ANCESTOR of
    // the token now in the keychain. Replaying that ancestor 401s (the auth
    // server's ~10s grace window is long gone on resume) yet the session is very
    // much alive. So before logging out, re-read the durable keychain token; if
    // it differs from what we just sent, retry the refresh once with it. Only a
    // second 401 (or a genuinely dead session) reaches onForceLogout.
    // A network/5xx error is transient — keep the user signed in and recover on
    // the next attempt.
    const status = (err as AxiosError)?.response?.status;
    if (status === 401 || status === 403) {
      const durable = await readDurableRefreshToken();
      if (durable && durable !== refreshToken) {
        try {
          const retry = await authApi.post<{ access_token: string; refresh_token?: string }>(
            '/auth/refresh',
            { refresh_token: durable },
          );
          const retryAccess = retry.data.access_token;
          const retryRefresh = retry.data.refresh_token ?? durable;
          await updateTokens(retryAccess, retryRefresh);
          return retryAccess;
        } catch (retryErr) {
          const retryStatus = (retryErr as AxiosError)?.response?.status;
          if (retryStatus === 401 || retryStatus === 403) forceLogout('session_expired');
          return null;
        }
      }
      forceLogout('session_expired');
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
// refresh call itself (retrying it would recurse), the credential
// endpoints where a 401 means bad credentials, not an expired session, and
// the best-effort logout revoke (the session is already being torn down).
// Everything else on the auth service (/households, /invites,
// /auth/switch-household) gets the refresh-and-retry treatment.
const SKIP_REFRESH_PATHS = new Set<string>([
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
  '/auth/me',
  '/auth/change-password',
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

      // Temp-password reset: sign out (once) so the user signs in with the
      // temp password and lands in the forced-change flow. Not while that
      // flow is already showing — there the 403 is the expected answer.
      if (isPasswordChangeRequiredError(error)) {
        if (!isPasswordChangePending()) forceLogout('password_reset');
        return Promise.reject(error);
      }

      // Only intercept 401s we can act on, only retry once, and never try
      // to refresh against the credential/refresh endpoints themselves. With
      // no access token there's no session to refresh (we're logged out).
      if (
        !original ||
        !getAccessToken() ||
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
