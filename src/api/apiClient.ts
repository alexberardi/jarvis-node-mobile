/**
 * Authenticated axios instance with automatic token refresh on 401.
 *
 * All API modules that require JWT auth should use `apiClient` instead of
 * raw `axios`. The interceptor catches 401 responses, refreshes the access
 * token via authApi, and retries the original request exactly once.
 *
 * Token getter/setter are wired up by AuthContext at mount time via
 * `configureApiClient()`.
 */
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

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

// Attach current access token to every request
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── 401 interceptor with single-flight refresh ─────────────────────────

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

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean };

    // Only intercept 401s, and only retry once
    if (error.response?.status !== 401 || original._retried) {
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
      onForceLogout();
      return Promise.reject(error);
    }

    // Retry original request with new token
    original.headers.Authorization = `Bearer ${newToken}`;
    return apiClient(original);
  },
);

export default apiClient;
