/**
 * backgroundPresenceTask — the OS geofence lifecycle (Phase 3).
 *
 * Pins the enter/exit → home/away mapping, the start/stop gating (opt-in, home
 * set, Always permission), the two-step permission escalation, and the
 * reboot re-arm. expo-task-manager is mocked globally (jest.setup); we import
 * the exported executor directly rather than introspecting defineTask.
 */
jest.mock('expo-location', () => ({
  GeofencingEventType: { Enter: 1, Exit: 2 },
  getBackgroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(),
  startGeofencingAsync: jest.fn(),
  stopGeofencingAsync: jest.fn(),
  hasStartedGeofencingAsync: jest.fn(),
}));

jest.mock('../../src/services/presenceService', () => ({
  reportPresenceBg: jest.fn(),
  isBackgroundPresenceEnabled: jest.fn(),
  getHomeGeofence: jest.fn(),
}));

import * as Location from 'expo-location';

import {
  ensureBackgroundPermission,
  geofenceTaskExecutor,
  GEOFENCE_TASK,
  rearmIfNeeded,
  startHomeGeofence,
  stopHomeGeofence,
} from '../../src/services/backgroundPresenceTask';
import {
  getHomeGeofence,
  isBackgroundPresenceEnabled,
  reportPresenceBg,
} from '../../src/services/presenceService';

const mLoc = Location as jest.Mocked<typeof Location>;
const HOME = { latitude: 40.7, longitude: -74, radiusMeters: 150, enabled: true };

beforeEach(() => {
  jest.clearAllMocks();
  (isBackgroundPresenceEnabled as jest.Mock).mockResolvedValue(true);
  (getHomeGeofence as jest.Mock).mockResolvedValue(HOME);
  mLoc.getBackgroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
  mLoc.hasStartedGeofencingAsync.mockResolvedValue(false as never);
  mLoc.startGeofencingAsync.mockResolvedValue(undefined as never);
  mLoc.stopGeofencingAsync.mockResolvedValue(undefined as never);
});

describe('geofenceTaskExecutor', () => {
  it('Enter → reports "home"', async () => {
    await geofenceTaskExecutor({ data: { eventType: 1, region: {} }, error: null } as never);
    expect(reportPresenceBg).toHaveBeenCalledWith('home');
  });

  it('Exit → reports "away"', async () => {
    await geofenceTaskExecutor({ data: { eventType: 2, region: {} }, error: null } as never);
    expect(reportPresenceBg).toHaveBeenCalledWith('away');
  });

  it('error present → no report, resolves without throwing', async () => {
    await expect(
      geofenceTaskExecutor({ data: null, error: { code: 'E', message: 'x' } } as never),
    ).resolves.toBeUndefined();
    expect(reportPresenceBg).not.toHaveBeenCalled();
  });
});

describe('startHomeGeofence', () => {
  it('skips (disabled) when background presence is off — no OS registration', async () => {
    (isBackgroundPresenceEnabled as jest.Mock).mockResolvedValue(false);
    expect(await startHomeGeofence()).toEqual({ status: 'skipped', reason: 'disabled' });
    expect(mLoc.startGeofencingAsync).not.toHaveBeenCalled();
  });

  it('skips (no-home) when there is no stored coordinate', async () => {
    (getHomeGeofence as jest.Mock).mockResolvedValue(null);
    expect(await startHomeGeofence()).toEqual({ status: 'skipped', reason: 'no-home' });
    expect(mLoc.startGeofencingAsync).not.toHaveBeenCalled();
  });

  it('skips (no-background-permission) when Always is not granted', async () => {
    mLoc.getBackgroundPermissionsAsync.mockResolvedValue({ status: 'denied' } as never);
    expect(await startHomeGeofence()).toEqual({
      status: 'skipped',
      reason: 'no-background-permission',
    });
    expect(mLoc.startGeofencingAsync).not.toHaveBeenCalled();
  });

  it('registers a single "home" region on the happy path', async () => {
    const res = await startHomeGeofence(HOME);
    expect(res).toEqual({ status: 'started' });
    expect(mLoc.startGeofencingAsync).toHaveBeenCalledWith(GEOFENCE_TASK, [
      expect.objectContaining({
        identifier: 'home',
        latitude: 40.7,
        longitude: -74,
        radius: 150,
        notifyOnEnter: true,
        notifyOnExit: true,
      }),
    ]);
  });

  it('returns an error result (never throws) when startGeofencingAsync fails', async () => {
    mLoc.startGeofencingAsync.mockRejectedValue(new Error('boom'));
    expect(await startHomeGeofence(HOME)).toEqual({ status: 'error', reason: 'boom' });
  });
});

describe('ensureBackgroundPermission (two-step escalation)', () => {
  it('does NOT request background when foreground is denied', async () => {
    mLoc.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' } as never);
    expect(await ensureBackgroundPermission()).toBe(false);
    expect(mLoc.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('returns true only when foreground AND background are granted', async () => {
    mLoc.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    mLoc.requestBackgroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    expect(await ensureBackgroundPermission()).toBe(true);
  });

  it('returns false when only foreground (When-In-Use) is granted', async () => {
    mLoc.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    mLoc.requestBackgroundPermissionsAsync.mockResolvedValue({ status: 'denied' } as never);
    expect(await ensureBackgroundPermission()).toBe(false);
  });
});

describe('stopHomeGeofence', () => {
  it('stops when a geofence is running', async () => {
    mLoc.hasStartedGeofencingAsync.mockResolvedValue(true as never);
    await stopHomeGeofence();
    expect(mLoc.stopGeofencingAsync).toHaveBeenCalledWith(GEOFENCE_TASK);
  });

  it('no-ops when nothing is running', async () => {
    mLoc.hasStartedGeofencingAsync.mockResolvedValue(false as never);
    await stopHomeGeofence();
    expect(mLoc.stopGeofencingAsync).not.toHaveBeenCalled();
  });
});

describe('rearmIfNeeded', () => {
  it('re-arms when enabled + permitted + not yet started', async () => {
    mLoc.hasStartedGeofencingAsync.mockResolvedValue(false as never);
    await rearmIfNeeded();
    expect(mLoc.startGeofencingAsync).toHaveBeenCalled();
  });

  it('no-ops when already started (idempotent)', async () => {
    mLoc.hasStartedGeofencingAsync.mockResolvedValue(true as never);
    await rearmIfNeeded();
    expect(mLoc.startGeofencingAsync).not.toHaveBeenCalled();
  });

  it('no-ops when background presence is off', async () => {
    (isBackgroundPresenceEnabled as jest.Mock).mockResolvedValue(false);
    await rearmIfNeeded();
    expect(mLoc.startGeofencingAsync).not.toHaveBeenCalled();
  });
});
