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
type TokenUpdater = (access: string, refresh: string) => void;
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
  if (!refreshToken) return null;

  try {
    const res = await authApi.post<{ access_token: string; refresh_token?: string }>(
      '/auth/refresh',
      { refresh_token: refreshToken },
    );
    const newAccess = res.data.access_token;
    const newRefresh = res.data.refresh_token ?? refreshToken;
    updateTokens(newAccess, newRefresh);
    return newAccess;
  } catch {
    return null;
  }
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

      // Single-flight: if a refresh is already in progress, wait for it
      if (!refreshPromise) {
        refreshPromise = doRefresh().finally(() => {
          refreshPromise = null;
        });
      }

      const newToken = await refreshPromise;
      if (!newToken) {
        // Refresh token is dead too — surface the login screen rather than
        // leaving the user authenticated-but-broken behind empty screens.
        onForceLogout();
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
