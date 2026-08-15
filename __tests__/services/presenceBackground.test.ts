/**
 * presenceService — the HEADLESS background report + the deferred pending-edge
 * queue (Phase 3). Pins: config fallback (in-memory config is empty in a
 * headless launch), identity gating, the token-usability/refresh path, and that
 * the background NEVER uses the authed apiClient (only bare fetch) and defers on
 * any failure. Plus the queue's coalescing, cap, and stale-drop flush rules.
 */
jest.mock('expo-location', () => ({
  Accuracy: { High: 6, Balanced: 3 },
}));

jest.mock('../../src/config/serviceConfig', () => ({
  getServiceConfig: jest.fn(),
  loadCachedConfig: jest.fn(),
}));

jest.mock('../../src/services/tokenStorage', () => ({
  readTokenForBg: jest.fn(),
  persistBgRotatedTokens: jest.fn(),
  readDurableRefreshToken: jest.fn(),
}));

jest.mock('../../src/api/presenceApi', () => ({
  reportPresence: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';

import { reportPresence } from '../../src/api/presenceApi';
import { getServiceConfig, loadCachedConfig } from '../../src/config/serviceConfig';
import {
  ACTIVE_HOUSEHOLD_KEY,
  PRESENCE_LAST_STATE_KEY,
  PRESENCE_PENDING_QUEUE_KEY,
  USER_KEY,
} from '../../src/config/storageKeys';
import {
  enqueuePendingEdge,
  flushPendingQueue,
  reportPresenceBg,
} from '../../src/services/presenceService';
import {
  persistBgRotatedTokens,
  readTokenForBg,
} from '../../src/services/tokenStorage';

const CC = 'http://cc';
const AUTH = 'http://auth';
const fullCfg = {
  authBaseUrl: AUTH,
  commandCenterUrl: CC,
  configServiceUrl: null,
  notificationsUrl: '',
  pantryUrl: '',
};
const emptyCfg = { ...fullCfg, authBaseUrl: '', commandCenterUrl: '' };

const makeJwt = (expDeltaSec: number): string => {
  const exp = Math.floor(Date.now() / 1000) + expDeltaSec;
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  return `hdr.${payload}.sig`;
};

const res200 = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const res401 = () => ({ ok: false, status: 401, json: async () => ({}) });

const routeFetch = (routes: { refresh?: unknown; presence?: unknown }) => {
  (global.fetch as unknown) = jest.fn(async (url: string) => {
    if (url.includes('/auth/refresh')) return routes.refresh;
    if (url.includes('/api/v0/mobile/presence')) return routes.presence;
    throw new Error(`unexpected fetch ${url}`);
  });
};

const setIdentity = async () => {
  await AsyncStorage.setItem(ACTIVE_HOUSEHOLD_KEY, 'hh1');
  await AsyncStorage.setItem(USER_KEY, JSON.stringify({ id: 7, username: 'Alex' }));
};

const readQueue = async () => JSON.parse((await AsyncStorage.getItem(PRESENCE_PENDING_QUEUE_KEY)) || '[]');

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  (getServiceConfig as jest.Mock).mockReturnValue(fullCfg);
  (loadCachedConfig as jest.Mock).mockResolvedValue(fullCfg);
  (readTokenForBg as jest.Mock).mockResolvedValue({ access: makeJwt(600), refresh: 'r1' });
  (reportPresence as jest.Mock).mockResolvedValue({ ok: true, signal_id: 1, kind: 'presence.seen' });
  (global.fetch as unknown) = jest.fn();
});

describe('reportPresenceBg', () => {
  it('reports via bare fetch (NOT the authed apiClient) on the happy path', async () => {
    await setIdentity();
    routeFetch({ presence: res200({ ok: true }) });

    await reportPresenceBg('home');

    expect(global.fetch).toHaveBeenCalledWith(
      `${CC}/api/v0/mobile/presence`,
      expect.objectContaining({ method: 'POST' }),
    );
    // The background must never route through the foreground authed client.
    expect(reportPresence).not.toHaveBeenCalled();
    // Last-state recorded per (household, user) so the foreground sample no-ops.
    const last = JSON.parse((await AsyncStorage.getItem(PRESENCE_LAST_STATE_KEY)) || '{}');
    expect(last['hh1:7'].state).toBe('home');
    expect(await readQueue()).toHaveLength(0);
  });

  it('falls back to the cached config when in-memory config is empty (headless)', async () => {
    await setIdentity();
    (getServiceConfig as jest.Mock).mockReturnValue(emptyCfg);
    (loadCachedConfig as jest.Mock).mockResolvedValue(fullCfg);
    routeFetch({ presence: res200({ ok: true }) });

    await reportPresenceBg('home');

    expect(global.fetch).toHaveBeenCalledWith(`${CC}/api/v0/mobile/presence`, expect.anything());
  });

  it('enqueues (no fetch) when no config can be resolved', async () => {
    await setIdentity();
    (getServiceConfig as jest.Mock).mockReturnValue(emptyCfg);
    (loadCachedConfig as jest.Mock).mockResolvedValue(null);

    await reportPresenceBg('home');

    expect(global.fetch).not.toHaveBeenCalled();
    const q = await readQueue();
    expect(q).toHaveLength(1);
    expect(q[0].state).toBe('home');
  });

  it('enqueues (no fetch) when identity is missing', async () => {
    await AsyncStorage.setItem(ACTIVE_HOUSEHOLD_KEY, 'hh1'); // no USER_KEY

    await reportPresenceBg('away');

    expect(global.fetch).not.toHaveBeenCalled();
    expect(await readQueue()).toHaveLength(1);
  });

  it('refreshes a stale access token before posting, and persists the rotation', async () => {
    await setIdentity();
    (readTokenForBg as jest.Mock).mockResolvedValue({ access: makeJwt(-100), refresh: 'r1' });
    routeFetch({
      refresh: res200({ access_token: makeJwt(600), refresh_token: 'r2' }),
      presence: res200({ ok: true }),
    });

    await reportPresenceBg('away');

    expect(global.fetch).toHaveBeenCalledWith(`${AUTH}/auth/refresh`, expect.anything());
    expect(persistBgRotatedTokens).toHaveBeenCalledWith(expect.any(String), 'r2');
    expect(global.fetch).toHaveBeenCalledWith(`${CC}/api/v0/mobile/presence`, expect.anything());
  });

  it('biometric user (no bg refresh token): a 401 defers instead of logging out', async () => {
    await setIdentity();
    (readTokenForBg as jest.Mock).mockResolvedValue({ access: makeJwt(-100), refresh: null });
    routeFetch({ presence: res401() });

    await reportPresenceBg('home');

    // No refresh attempted (no bg refresh token), presence 401 → deferred.
    expect(persistBgRotatedTokens).not.toHaveBeenCalled();
    const q = await readQueue();
    expect(q).toHaveLength(1);
    expect(q[0].state).toBe('home');
  });
});

describe('enqueuePendingEdge', () => {
  it('coalesces consecutive same-state edges (bumps the tail ts)', async () => {
    await enqueuePendingEdge({ state: 'home', ts: 1, householdId: 'h', userId: 7 });
    await enqueuePendingEdge({ state: 'home', ts: 2, householdId: 'h', userId: 7 });
    let q = await readQueue();
    expect(q).toHaveLength(1);
    expect(q[0].ts).toBe(2);

    await enqueuePendingEdge({ state: 'away', ts: 3, householdId: 'h', userId: 7 });
    q = await readQueue();
    expect(q).toHaveLength(2);
  });

  it('bounds the log to 20 entries (drop-oldest)', async () => {
    for (let i = 0; i < 25; i++) {
      await enqueuePendingEdge({
        state: i % 2 === 0 ? 'home' : 'away',
        ts: i,
        householdId: 'h',
        userId: 7,
      });
    }
    expect(await readQueue()).toHaveLength(20);
  });
});

describe('flushPendingQueue', () => {
  it('flushes fresh edges, drops stale (except newest), via the authed path', async () => {
    const now = Date.now();
    await enqueuePendingEdge({ state: 'home', ts: now - 5 * 3600 * 1000, householdId: 'h', userId: 7 });
    await enqueuePendingEdge({ state: 'away', ts: now, householdId: 'h', userId: 7 });

    await flushPendingQueue('h', 7, 'Alex');

    // The stale, non-newest "home" is dropped; the fresh "away" is reported.
    expect(reportPresence).toHaveBeenCalledTimes(1);
    expect(reportPresence).toHaveBeenCalledWith('h', 'away', 'Alex');
    expect(await readQueue()).toHaveLength(0);
  });

  it('stops on the first failure and keeps the remainder', async () => {
    const now = Date.now();
    await enqueuePendingEdge({ state: 'home', ts: now, householdId: 'h', userId: 7 });
    await enqueuePendingEdge({ state: 'away', ts: now + 1, householdId: 'h', userId: 7 });
    (reportPresence as jest.Mock).mockRejectedValueOnce(new Error('net'));

    await flushPendingQueue('h', 7);

    expect(reportPresence).toHaveBeenCalledTimes(1); // stopped after the failure
    expect(await readQueue()).toHaveLength(2); // nothing lost
  });

  it('leaves another (household, user) pair queued', async () => {
    await enqueuePendingEdge({ state: 'home', ts: Date.now(), householdId: 'other', userId: 9 });

    await flushPendingQueue('h', 7);

    expect(reportPresence).not.toHaveBeenCalled();
    expect(await readQueue()).toHaveLength(1);
  });
});
