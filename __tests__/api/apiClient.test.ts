/**
 * Regression tests for the shared auth-refresh interceptor.
 *
 * The bug this guards against: a stale token on an auth-service data call
 * (e.g. GET /households) used to surface as a silent empty result — no
 * refresh, no re-login prompt — because the call bypassed the interceptor.
 * The interceptor is now attached to BOTH apiClient and authApi, so a 401
 * must either transparently refresh-and-retry or force a logout.
 *
 * We drive the real axios instances through canned per-instance adapters so
 * the actual interceptor logic runs.
 */
import apiClient, { configureApiClient, refreshAuthToken } from '../../src/api/apiClient';
import authApi from '../../src/api/authApi';

type AdapterFn = (config: any) => Promise<any>;

const reject401 = (config: any) =>
  Promise.reject(Object.assign(new Error('401'), { config, response: { status: 401, data: {}, config } }));

const ok = (config: any, data: any = { ok: true }) =>
  Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config });

const setAdapter = (instance: typeof apiClient, fn: AdapterFn) => {
  (instance.defaults as any).adapter = fn;
};

describe('auth-refresh interceptor', () => {
  let onForceLogout: jest.Mock;
  let updateTokens: jest.Mock;
  let access: string;
  let refresh: string | null;

  beforeEach(() => {
    access = 'stale-token';
    refresh = 'refresh-token';
    onForceLogout = jest.fn();
    updateTokens = jest.fn((a: string) => {
      access = a;
    });
    configureApiClient({
      getAccessToken: () => access,
      getRefreshToken: () => refresh,
      updateTokens,
      onForceLogout,
    });
    // authApi serves the refresh endpoint with a fresh token by default.
    setAdapter(authApi, (config) =>
      config.url === '/auth/refresh' ? ok(config, { access_token: 'fresh-token' }) : reject401(config),
    );
  });

  it('apiClient: 401 → refresh succeeds → retries with the new token', async () => {
    let calls = 0;
    setAdapter(apiClient, (config) => {
      calls += 1;
      if (config._retried) {
        expect(config.headers.Authorization).toBe('Bearer fresh-token');
        return ok(config, { data: 'recovered' });
      }
      return reject401(config);
    });

    const res = await apiClient.get('http://cc/api/v0/mobile/command-data/nodes');

    expect(res.data).toEqual({ data: 'recovered' });
    expect(updateTokens).toHaveBeenCalledWith('fresh-token', 'refresh-token');
    expect(onForceLogout).not.toHaveBeenCalled();
    expect(calls).toBe(2); // original 401 + retry
  });

  it('apiClient: 401 with a dead refresh token → forces logout, no silent empty', async () => {
    refresh = null; // refresh token is gone → refresh cannot succeed
    setAdapter(apiClient, (config) => reject401(config));

    await expect(apiClient.get('http://cc/api/v0/mobile/command-data/nodes')).rejects.toBeTruthy();
    expect(onForceLogout).toHaveBeenCalledTimes(1);
  });

  it('authApi: 401 on /households (the original bug) refreshes and retries', async () => {
    let calls = 0;
    setAdapter(authApi, (config) => {
      if (config.url === '/auth/refresh') return ok(config, { access_token: 'fresh-token' });
      calls += 1;
      return config._retried ? ok(config, [{ id: 'h1' }]) : reject401(config);
    });

    const res = await authApi.get('/households', {
      headers: { Authorization: `Bearer ${access}` },
    });

    expect(res.data).toEqual([{ id: 'h1' }]);
    expect(updateTokens).toHaveBeenCalled();
    expect(onForceLogout).not.toHaveBeenCalled();
    expect(calls).toBe(2);
  });

  it('authApi: 401 on /auth/login is NOT refreshed (bad credentials, not a stale session)', async () => {
    setAdapter(authApi, (config) => reject401(config)); // login itself 401s

    await expect(authApi.post('/auth/login', { email: 'x', password: 'wrong' })).rejects.toBeTruthy();
    expect(updateTokens).not.toHaveBeenCalled();
    expect(onForceLogout).not.toHaveBeenCalled();
  });

  // ── Shared single-flight + centralized logout (M1) ─────────────────────────

  it('refreshAuthToken: concurrent callers share ONE /auth/refresh (single-flight)', async () => {
    let refreshCalls = 0;
    setAdapter(authApi, (config) => {
      if (config.url === '/auth/refresh') {
        refreshCalls += 1;
        return ok(config, { access_token: 'fresh-token', refresh_token: 'rotated' });
      }
      return reject401(config);
    });

    // The timer, the resume refresh, and the interceptor can all ask at once.
    const results = await Promise.all([refreshAuthToken(), refreshAuthToken(), refreshAuthToken()]);

    expect(results).toEqual(['fresh-token', 'fresh-token', 'fresh-token']);
    expect(refreshCalls).toBe(1); // never double-spends the rotated refresh token
    expect(updateTokens).toHaveBeenCalledWith('fresh-token', 'rotated');
  });

  it('refreshAuthToken: a 401 from /auth/refresh forces a clean logout (dead session)', async () => {
    setAdapter(authApi, (config) => reject401(config)); // refresh token itself is dead

    const token = await refreshAuthToken();

    expect(token).toBeNull();
    expect(onForceLogout).toHaveBeenCalledTimes(1);
  });

  it('refreshAuthToken: a transient network error does NOT force logout', async () => {
    setAdapter(authApi, (config) =>
      config.url === '/auth/refresh'
        ? Promise.reject(Object.assign(new Error('Network Error'), { config })) // no response → transient
        : reject401(config),
    );

    const token = await refreshAuthToken();

    expect(token).toBeNull();
    expect(onForceLogout).not.toHaveBeenCalled(); // stay signed in; the access token may still work
  });

  it('refreshAuthToken: no refresh token at all forces logout (no silent limbo)', async () => {
    refresh = null;

    const token = await refreshAuthToken();

    expect(token).toBeNull();
    expect(onForceLogout).toHaveBeenCalledTimes(1);
  });
});
