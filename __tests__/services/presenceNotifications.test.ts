/**
 * presenceNotifications — the opt-in + local arrive/leave notification logic.
 * Pins: the opt-in round-trip, the permission flow (request only when needed),
 * and that firePresenceNotification only fires when opted-in AND permitted, with
 * the right home/away copy.
 */
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('local-notif-id'),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import {
  ensureNotifyPermission,
  firePresenceNotification,
  isPresenceNotifyEnabled,
  setPresenceNotifyEnabled,
} from '../../src/services/presenceNotifications';

const sched = Notifications.scheduleNotificationAsync as jest.Mock;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
});

describe('opt-in flag', () => {
  it('defaults off and round-trips', async () => {
    expect(await isPresenceNotifyEnabled()).toBe(false);
    await setPresenceNotifyEnabled(true);
    expect(await isPresenceNotifyEnabled()).toBe(true);
    await setPresenceNotifyEnabled(false);
    expect(await isPresenceNotifyEnabled()).toBe(false);
  });
});

describe('ensureNotifyPermission', () => {
  it('returns true without re-requesting when already granted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    expect(await ensureNotifyPermission()).toBe(true);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('requests when undetermined and returns the grant result', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    expect(await ensureNotifyPermission()).toBe(true);
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
  });

  it('returns false when denied', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    expect(await ensureNotifyPermission()).toBe(false);
  });
});

describe('firePresenceNotification', () => {
  it('no-ops when the user has not opted in', async () => {
    await setPresenceNotifyEnabled(false);
    await firePresenceNotification('home', 'Alex');
    expect(sched).not.toHaveBeenCalled();
  });

  it('no-ops when opted in but permission is not granted (never prompts here)', async () => {
    await setPresenceNotifyEnabled(true);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    await firePresenceNotification('home');
    expect(sched).not.toHaveBeenCalled();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('fires "Welcome home, <name>" on arrival when opted in + granted', async () => {
    await setPresenceNotifyEnabled(true);
    await firePresenceNotification('home', 'Alex');
    expect(sched).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ title: 'Welcome home, Alex' }),
      }),
    );
  });

  it('fires a "left home" notification on departure', async () => {
    await setPresenceNotifyEnabled(true);
    await firePresenceNotification('away');
    expect(sched).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ title: expect.stringContaining('left home') }),
      }),
    );
  });
});
