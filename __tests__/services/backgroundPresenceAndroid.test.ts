/**
 * Background presence is iOS-ONLY — the Android build ships without
 * ACCESS_BACKGROUND_LOCATION (Google Play gates that permission behind a
 * per-release declaration + demo-video review, which blocks shipping at all).
 *
 * This suite pins the Android contract so it can't silently regress into asking
 * for a permission the manifest no longer declares:
 *   1. `BACKGROUND_PRESENCE_SUPPORTED` is false, and the stored opt-in can never
 *      read back true — even for a user upgrading from a build where they HAD
 *      turned it on.
 *   2. No geofence is ever armed and no background permission is ever requested.
 *   3. The first foreground sync TEARS DOWN whatever an older build left armed.
 * Foreground presence (reportIfChanged, While-Using location) is unaffected and
 * is covered in presenceService.test.ts.
 *
 * `Platform` is mocked to android BEFORE the modules under test are imported —
 * BACKGROUND_PRESENCE_SUPPORTED is evaluated once at module load.
 */
jest.mock('react-native/Libraries/Utilities/Platform', () => {
  // react-native's index does `require('./Libraries/Utilities/Platform').default`,
  // so the mock has to keep the default-export shape.
  const actual = jest.requireActual('react-native/Libraries/Utilities/Platform').default;
  return {
    __esModule: true,
    default: {
      ...actual,
      OS: 'android',
      select: (objs: Record<string, unknown>) =>
        objs.android ?? objs.native ?? objs.default,
    },
  };
});

jest.mock('expo-location', () => ({
  GeofencingEventType: { Enter: 1, Exit: 2 },
  getBackgroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(),
  startGeofencingAsync: jest.fn(),
  stopGeofencingAsync: jest.fn(),
  hasStartedGeofencingAsync: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import {
  ensureBackgroundPermission,
  hasBackgroundPermission,
  GEOFENCE_TASK,
  rearmIfNeeded,
  startHomeGeofence,
} from '../../src/services/backgroundPresenceTask';
import {
  BACKGROUND_PRESENCE_SUPPORTED,
  isBackgroundPresenceEnabled,
  setBackgroundPresenceEnabled,
  setHomeGeofence,
} from '../../src/services/presenceService';
import { BG_PRESENCE_ENABLED_KEY } from '../../src/config/storageKeys';

const mLoc = Location as jest.Mocked<typeof Location>;
const HOME = { latitude: 40.7, longitude: -74, radiusMeters: 150, enabled: true };

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mLoc.getBackgroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  mLoc.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  mLoc.requestBackgroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  mLoc.hasStartedGeofencingAsync.mockResolvedValue(false as never);
  mLoc.startGeofencingAsync.mockResolvedValue(undefined as never);
  mLoc.stopGeofencingAsync.mockResolvedValue(undefined as never);
});

describe('BACKGROUND_PRESENCE_SUPPORTED', () => {
  it('is false on Android', () => {
    expect(BACKGROUND_PRESENCE_SUPPORTED).toBe(false);
  });
});

describe('the stored opt-in on Android', () => {
  it('reads back false even when an older build left it set to true', async () => {
    await AsyncStorage.setItem(BG_PRESENCE_ENABLED_KEY, 'true');
    expect(await isBackgroundPresenceEnabled()).toBe(false);
  });

  it('can never be turned on — setBackgroundPresenceEnabled(true) stores false', async () => {
    await setBackgroundPresenceEnabled(true);
    expect(await AsyncStorage.getItem(BG_PRESENCE_ENABLED_KEY)).toBe('false');
    expect(await isBackgroundPresenceEnabled()).toBe(false);
  });
});

describe('permissions on Android', () => {
  it('never reports Always-location as granted', async () => {
    expect(await hasBackgroundPermission()).toBe(false);
    expect(mLoc.getBackgroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('never PROMPTS for background location (the manifest does not declare it)', async () => {
    expect(await ensureBackgroundPermission()).toBe(false);
    expect(mLoc.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
    // Not even the foreground half of the escalation — that prompt belongs to
    // the explicit "Use current location" action, not to background presence.
    expect(mLoc.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('startHomeGeofence on Android', () => {
  it('skips as unsupported and registers nothing with the OS', async () => {
    await setHomeGeofence(HOME);
    expect(await startHomeGeofence(HOME)).toEqual({
      status: 'skipped',
      reason: 'unsupported',
    });
    expect(mLoc.startGeofencingAsync).not.toHaveBeenCalled();
  });
});

describe('rearmIfNeeded on Android (upgrade cleanup)', () => {
  // One test, because the teardown is once-per-launch and the flag guarding it
  // is module state that outlives a single `it`.
  it('stops what an older build left armed, clears the stale opt-in, and does it once', async () => {
    await AsyncStorage.setItem(BG_PRESENCE_ENABLED_KEY, 'true');
    await setHomeGeofence(HOME);
    mLoc.hasStartedGeofencingAsync.mockResolvedValue(true as never);

    // usePresence calls this on every foreground sync — three here.
    await rearmIfNeeded();
    await rearmIfNeeded();
    await rearmIfNeeded();

    expect(mLoc.stopGeofencingAsync).toHaveBeenCalledWith(GEOFENCE_TASK);
    expect(mLoc.stopGeofencingAsync).toHaveBeenCalledTimes(1);
    expect(mLoc.startGeofencingAsync).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(BG_PRESENCE_ENABLED_KEY)).toBe('false');
  });
});
