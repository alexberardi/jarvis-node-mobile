/**
 * presenceService — the on-device presence brain.
 *
 * Pins the geometry (haversine + home/away decision), the on-device geofence
 * storage (round-trip, radius clamping, garbage tolerance), and the
 * report-on-change cycle (opt-in gating, permission gating, report only on a
 * state change, and no-persist-on-failure so a failed POST retries).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import { reportPresence } from '../../src/api/presenceApi';
import { PRESENCE_LAST_STATE_KEY } from '../../src/config/storageKeys';
import {
  decideState,
  getHomeGeofence,
  haversineMeters,
  reportIfChanged,
  setHomeGeofence,
  MIN_RADIUS_METERS,
  REFRESH_AFTER_MS,
  type HomeGeofence,
} from '../../src/services/presenceService';

jest.mock('expo-location', () => ({
  Accuracy: { High: 6, Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

jest.mock('../../src/api/presenceApi', () => ({
  reportPresence: jest.fn(),
}));

const mockLoc = Location as jest.Mocked<typeof Location>;
const mockReport = reportPresence as jest.Mock;

const HH = 'hh-abc';
const UID = 7;
const HOME = { latitude: 40, longitude: -74 };
const HOME_GEO: HomeGeofence = {
  ...HOME,
  radiusMeters: 150,
  enabled: true,
};

const atCoords = (latitude: number, longitude: number) => ({
  coords: { latitude, longitude },
});

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  mockLoc.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
  mockLoc.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
  mockLoc.getCurrentPositionAsync.mockResolvedValue(atCoords(40, -74) as any);
  mockReport.mockResolvedValue({ ok: true, signal_id: 1, kind: 'presence.seen' });
});

describe('haversineMeters', () => {
  it('is ~0 for the same point', () => {
    expect(haversineMeters(HOME, HOME)).toBeCloseTo(0, 5);
  });

  it('is ~111 km for one degree of latitude', () => {
    const d = haversineMeters({ latitude: 40, longitude: -74 }, { latitude: 41, longitude: -74 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

describe('decideState', () => {
  it('is home inside the radius', () => {
    expect(decideState({ latitude: 40, longitude: -74 }, { ...HOME, radiusMeters: 150 })).toBe('home');
  });

  it('is away outside the radius', () => {
    // ~1.1 km north — well outside a 150 m radius.
    expect(decideState({ latitude: 40.01, longitude: -74 }, { ...HOME, radiusMeters: 150 })).toBe('away');
  });
});

describe('geofence storage', () => {
  it('round-trips through AsyncStorage', async () => {
    await setHomeGeofence(HOME_GEO);
    expect(await getHomeGeofence()).toEqual(HOME_GEO);
  });

  it('clamps the radius to the floor', async () => {
    await setHomeGeofence({ ...HOME_GEO, radiusMeters: 10 });
    expect((await getHomeGeofence())?.radiusMeters).toBe(MIN_RADIUS_METERS);
  });

  it('returns null when nothing is stored', async () => {
    expect(await getHomeGeofence()).toBeNull();
  });

  it('returns null for a malformed record', async () => {
    await AsyncStorage.setItem('@jarvis/home_geofence', '{"latitude":"nope"}');
    expect(await getHomeGeofence()).toBeNull();
  });
});

describe('reportIfChanged', () => {
  it('skips (no-user) when no user id is supplied', async () => {
    await setHomeGeofence(HOME_GEO);
    const r = await reportIfChanged(HH, '' as any);
    expect(r).toEqual({ status: 'skipped', reason: 'no-user' });
    expect(mockReport).not.toHaveBeenCalled();
  });

  it('skips (disabled) when no home is set', async () => {
    const r = await reportIfChanged(HH, UID);
    expect(r).toEqual({ status: 'skipped', reason: 'disabled' });
    expect(mockReport).not.toHaveBeenCalled();
  });

  it('skips (disabled) when presence is turned off', async () => {
    await setHomeGeofence({ ...HOME_GEO, enabled: false });
    const r = await reportIfChanged(HH, UID);
    expect(r).toEqual({ status: 'skipped', reason: 'disabled' });
    expect(mockReport).not.toHaveBeenCalled();
  });

  it('skips (no-permission) without prompting when permission is not granted', async () => {
    await setHomeGeofence(HOME_GEO);
    mockLoc.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' } as any);
    const r = await reportIfChanged(HH, UID);
    expect(r).toEqual({ status: 'skipped', reason: 'no-permission' });
    expect(mockLoc.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(mockReport).not.toHaveBeenCalled();
  });

  it('reports home on first sample inside the radius, forwarding the name', async () => {
    await setHomeGeofence(HOME_GEO);
    const r = await reportIfChanged(HH, UID, 'Alex');
    expect(r).toEqual({ status: 'reported', state: 'home' });
    expect(mockReport).toHaveBeenCalledWith(HH, 'home', 'Alex');
  });

  it('does not re-report a fresh unchanged state', async () => {
    await setHomeGeofence(HOME_GEO);
    await reportIfChanged(HH, UID);
    const r = await reportIfChanged(HH, UID);
    expect(r).toEqual({ status: 'unchanged', state: 'home' });
    expect(mockReport).toHaveBeenCalledTimes(1);
  });

  it('re-asserts (heartbeat) an unchanged state once it goes stale', async () => {
    await setHomeGeofence(HOME_GEO);
    await reportIfChanged(HH, UID); // home; stores ts=now
    // Age the stored report past the refresh window.
    const raw = await AsyncStorage.getItem(PRESENCE_LAST_STATE_KEY);
    const map = JSON.parse(raw as string);
    map[`${HH}:${UID}`].ts = Date.now() - REFRESH_AFTER_MS - 1000;
    await AsyncStorage.setItem(PRESENCE_LAST_STATE_KEY, JSON.stringify(map));

    const r = await reportIfChanged(HH, UID);
    expect(r).toEqual({ status: 'reported', state: 'home' }); // refreshed, not skipped
    expect(mockReport).toHaveBeenCalledTimes(2);
  });

  it('reports the edge when the state flips home → away', async () => {
    await setHomeGeofence(HOME_GEO);
    await reportIfChanged(HH, UID); // home
    mockLoc.getCurrentPositionAsync.mockResolvedValue(atCoords(40.01, -74) as any); // ~1.1km away
    const r = await reportIfChanged(HH, UID);
    expect(r).toEqual({ status: 'reported', state: 'away' });
    expect(mockReport).toHaveBeenLastCalledWith(HH, 'away', undefined);
  });

  it('does not let one user mask another on a shared phone (per-user key)', async () => {
    await setHomeGeofence(HOME_GEO);
    await reportIfChanged(HH, UID); // user 7 reports home
    const r = await reportIfChanged(HH, 99); // user 99, same household + location
    expect(r).toEqual({ status: 'reported', state: 'home' }); // NOT deduped against user 7
    expect(mockReport).toHaveBeenCalledTimes(2);
  });

  it('does not persist the state when the POST fails, so it retries', async () => {
    await setHomeGeofence(HOME_GEO);
    mockReport.mockRejectedValueOnce(new Error('network'));
    const first = await reportIfChanged(HH, UID);
    expect(first.status).toBe('error');

    // Next sample must retry (state was not remembered) and succeed.
    const second = await reportIfChanged(HH, UID);
    expect(second).toEqual({ status: 'reported', state: 'home' });
    expect(mockReport).toHaveBeenCalledTimes(2);
  });

  it('times out a hung GPS read instead of wedging forever', async () => {
    await setHomeGeofence(HOME_GEO);
    jest.useFakeTimers();
    try {
      // A getCurrentPositionAsync that never settles.
      mockLoc.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}) as any);
      const p = reportIfChanged(HH, UID);
      // Async advance interleaves microtask flushing so the awaits before the
      // GPS read resolve and the timeout timer actually fires.
      await jest.advanceTimersByTimeAsync(20 * 1000); // past LOCATION_TIMEOUT_MS
      const r = await p;
      expect(r.status).toBe('error');
    } finally {
      jest.useRealTimers();
    }

    // The in-flight guard must have released — a subsequent sample can proceed.
    mockLoc.getCurrentPositionAsync.mockResolvedValue(atCoords(40, -74) as any);
    const r2 = await reportIfChanged(HH, UID);
    expect(r2).toEqual({ status: 'reported', state: 'home' });
  });
});
