/**
 * Central forced-logout handling in the API client layer.
 *
 * jarvisd answers 403 {"code": "password_change_required"} on every user route
 * (except GET /auth/me and POST /auth/change-password) once an admin issues a
 * temp-password reset — including for tokens minted BEFORE the reset. The
 * client must sign out once, cleanly, with a reason the login screen can show.
 * A 401 that survives a refresh attempt (dead/revoked refresh token, deleted
 * user) goes through the same single handler.
 *
 * Invariants:
 *  - exactly one forced logout per session, however many requests fail at once;
 *  - nothing after the session is gone (no token) can re-trigger it (no loop);
 *  - during the forced-change flow itself the 403 is expected → ignored.
 */
import apiClient, { configureApiClient } from '../../src/api/apiClient';
import authApi from '../../src/api/authApi';

type AdapterFn = (config: any) => Promise<any>;

const fail = (config: any, status: number, data: any = {}) =>
  Promise.reject(
    Object.assign(new Error(String(status)), { config, response: { status, data, config } }),
  );

const ok = (config: any, data: any = { ok: true }) =>
  Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config });

const PW_REQUIRED = { detail: 'password change required', code: 'password_change_required' };

const setAdapter = (instance: typeof apiClient, fn: AdapterFn) => {
  (instance.defaults as any).adapter = fn;
};

describe('central forced logout', () => {
  let onForceLogout: jest.Mock;
  let access: string | null;
  let refresh: string | null;
  let pending: boolean;
  let refreshCalls: number;

  beforeEach(() => {
    access = 'access-1';
    refresh = 'refresh-1';
    pending = false;
    refreshCalls = 0;
    onForceLogout = jest.fn(() => {
      // Mirrors AuthContext.logout(): the session is gone afterwards.
      access = null;
      refresh = null;
    });
    configureApiClient({
      getAccessToken: () => access,
      getRefreshToken: () => refresh,
      updateTokens: (a: string, r: string) => {
        access = a;
        refresh = r;
      },
      onForceLogout,
      isPasswordChangePending: () => pending,
    });
    setAdapter(authApi, (config) => {
      if (config.url === '/auth/refresh') {
        refreshCalls += 1;
        return fail(config, 401); // refresh token revoked / user deleted
      }
      return fail(config, 401);
    });
  });

  it('403 password_change_required on apiClient signs out with the password_reset reason', async () => {
    setAdapter(apiClient, (config) => fail(config, 403, PW_REQUIRED));

    await expect(apiClient.get('http://cc/api/v0/mobile/nodes')).rejects.toBeTruthy();

    expect(onForceLogout).toHaveBeenCalledTimes(1);
    expect(onForceLogout).toHaveBeenCalledWith('password_reset');
    expect(refreshCalls).toBe(0); // 403 is not a refresh trigger
  });

  it('403 password_change_required on authApi (e.g. /households) signs out too', async () => {
    setAdapter(authApi, (config) => fail(config, 403, PW_REQUIRED));

    await expect(authApi.get('/households')).rejects.toBeTruthy();

    expect(onForceLogout).toHaveBeenCalledWith('password_reset');
  });

  it('a plain 403 (permission denied) does NOT sign out', async () => {
    setAdapter(apiClient, (config) => fail(config, 403, { detail: 'admin only' }));

    await expect(apiClient.get('http://cc/api/v0/admin/thing')).rejects.toBeTruthy();

    expect(onForceLogout).not.toHaveBeenCalled();
  });

  it('ignores password_change_required while the forced-change flow is showing', async () => {
    pending = true;
    setAdapter(apiClient, (config) => fail(config, 403, PW_REQUIRED));

    await expect(apiClient.get('http://cc/api/v0/mobile/nodes')).rejects.toBeTruthy();

    expect(onForceLogout).not.toHaveBeenCalled();
  });

  it('a 401 that survives the refresh attempt signs out with the session_expired reason', async () => {
    setAdapter(apiClient, (config) => fail(config, 401));

    await expect(apiClient.get('http://cc/api/v0/mobile/nodes')).rejects.toBeTruthy();

    expect(refreshCalls).toBe(1);
    expect(onForceLogout).toHaveBeenCalledTimes(1);
    expect(onForceLogout).toHaveBeenCalledWith('session_expired');
  });

  it('many requests failing at once sign out exactly once', async () => {
    // Don't clear the token synchronously: models the real app, where state
    // (and so getAccessToken) only changes after a re-render.
    onForceLogout.mockImplementation(() => {});
    setAdapter(apiClient, (config) =>
      config.url.endsWith('/a') ? fail(config, 401) : fail(config, 403, PW_REQUIRED),
    );

    await Promise.allSettled([
      apiClient.get('http://cc/x/a'),
      apiClient.get('http://cc/x/b'),
      apiClient.get('http://cc/x/c'),
      authApi.get('/households'),
    ]);

    expect(onForceLogout).toHaveBeenCalledTimes(1);
  });

  it('a later failure with the same dead token does not sign out again', async () => {
    onForceLogout.mockImplementation(() => {});
    setAdapter(apiClient, (config) => fail(config, 403, PW_REQUIRED));

    await expect(apiClient.get('http://cc/x/1')).rejects.toBeTruthy();
    await expect(apiClient.get('http://cc/x/2')).rejects.toBeTruthy();

    expect(onForceLogout).toHaveBeenCalledTimes(1);
  });

  it('a new session after sign-in can be force-logged-out again', async () => {
    setAdapter(apiClient, (config) => fail(config, 403, PW_REQUIRED));
    await expect(apiClient.get('http://cc/x/1')).rejects.toBeTruthy();

    // User signs back in → new token pair.
    access = 'access-2';
    refresh = 'refresh-2';
    await expect(apiClient.get('http://cc/x/2')).rejects.toBeTruthy();

    expect(onForceLogout).toHaveBeenCalledTimes(2);
  });

  it('after sign-out (no tokens left) a stray 401 cannot trigger another logout (no loop)', async () => {
    access = null;
    refresh = null;
    setAdapter(apiClient, (config) => fail(config, 401));

    await expect(apiClient.get('http://cc/x')).rejects.toBeTruthy();

    expect(onForceLogout).not.toHaveBeenCalled();
    expect(refreshCalls).toBe(0);
  });

  it('a 401 from /auth/logout (the best-effort revoke) is never refreshed', async () => {
    await expect(authApi.post('/auth/logout', { refresh_token: 'x' })).rejects.toBeTruthy();

    expect(refreshCalls).toBe(0);
    expect(onForceLogout).not.toHaveBeenCalled();
  });
});
