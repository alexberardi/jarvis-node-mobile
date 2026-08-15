/**
 * apiClient — the doRefresh "durable keychain retry" safeguard (Phase 3).
 *
 * The background geofence task can rotate the refresh chain out-of-band while
 * the app is backgrounded/terminated, leaving AuthContext's in-memory copy a
 * stale ANCESTOR. Replaying it 401s (the ~10s auth grace is long gone on
 * resume) yet the session is alive. The safeguard re-reads the durable keychain
 * token and retries ONCE with it before force-logging-out — so a live session
 * is never killed by a background rotation.
 */
jest.mock('../../src/services/tokenStorage', () => ({
  readDurableRefreshToken: jest.fn(),
}));

import apiClient, { configureApiClient, refreshAuthToken } from '../../src/api/apiClient';
import authApi from '../../src/api/authApi';
import { readDurableRefreshToken } from '../../src/services/tokenStorage';

type AdapterFn = (config: any) => Promise<any>;

const reject401 = (config: any) =>
  Promise.reject(Object.assign(new Error('401'), { config, response: { status: 401, data: {}, config } }));

const ok = (config: any, data: any) =>
  Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config });

const setAdapter = (instance: typeof apiClient, fn: AdapterFn) => {
  (instance.defaults as any).adapter = fn;
};

const bodyToken = (config: any): string => {
  const raw = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  return raw?.refresh_token;
};

describe('doRefresh durable-keychain safeguard', () => {
  let onForceLogout: jest.Mock;
  let updateTokens: jest.Mock;
  let access: string;
  let refresh: string | null;

  beforeEach(() => {
    jest.clearAllMocks();
    access = 'stale-access';
    refresh = 'stale-parent'; // the in-memory token we send first
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
  });

  it('a stale in-memory parent 401s, then the durable tail retries and SURVIVES (no logout)', async () => {
    (readDurableRefreshToken as jest.Mock).mockResolvedValue('durable-tail');
    setAdapter(authApi, (config) => {
      if (config.url === '/auth/refresh') {
        return bodyToken(config) === 'durable-tail'
          ? ok(config, { access_token: 'fresh', refresh_token: 'rotated' })
          : reject401(config); // the stale-parent replay 401s
      }
      return reject401(config);
    });

    const token = await refreshAuthToken();

    expect(token).toBe('fresh');
    expect(updateTokens).toHaveBeenCalledWith('fresh', 'rotated');
    expect(onForceLogout).not.toHaveBeenCalled();
  });

  it('forces logout when the durable token matches the one we already sent (genuinely dead)', async () => {
    (readDurableRefreshToken as jest.Mock).mockResolvedValue('stale-parent'); // same → no retry
    setAdapter(authApi, (config) => reject401(config));

    const token = await refreshAuthToken();

    expect(token).toBeNull();
    expect(onForceLogout).toHaveBeenCalledTimes(1);
  });

  it('forces logout when the durable retry ALSO 401s', async () => {
    (readDurableRefreshToken as jest.Mock).mockResolvedValue('durable-tail');
    setAdapter(authApi, (config) => reject401(config)); // even durable-tail is dead

    const token = await refreshAuthToken();

    expect(token).toBeNull();
    expect(onForceLogout).toHaveBeenCalledTimes(1);
  });

  it('forces logout when there is no durable token to fall back to', async () => {
    (readDurableRefreshToken as jest.Mock).mockResolvedValue(null);
    setAdapter(authApi, (config) => reject401(config));

    const token = await refreshAuthToken();

    expect(token).toBeNull();
    expect(onForceLogout).toHaveBeenCalledTimes(1);
  });
});
