import { renderHook, act } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';

import { usePushNotifications } from '../../src/hooks/usePushNotifications';
import {
  arePushNotificationsEnabled,
  getExpoPushToken,
  registerPushToken,
  unregisterPushToken,
} from '../../src/services/pushNotificationService';
import { useAuth } from '../../src/auth/AuthContext';

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  addNotificationReceivedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  addNotificationResponseReceivedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  setNotificationHandler: jest.fn(),
}));

// Mock push notification service
jest.mock('../../src/services/pushNotificationService', () => ({
  arePushNotificationsEnabled: jest.fn().mockResolvedValue(true),
  getExpoPushToken: jest.fn(),
  registerPushToken: jest.fn(),
  unregisterPushToken: jest.fn(),
}));

// Mock AuthContext
const mockAuthState = {
  isAuthenticated: false,
  accessToken: null as string | null,
  user: null,
  refreshToken: null,
  isLoading: false,
  households: [],
  activeHouseholdId: null,
  mustChangePassword: false,
  sessionEpoch: 0,
};

// Settle the hook's promise chain (enabled → token → register) without timers.
const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
};

const authed = (overrides: Partial<typeof mockAuthState> = {}) => {
  (useAuth as jest.Mock).mockReturnValue({
    state: { ...mockAuthState, isAuthenticated: true, accessToken: 'tok-1', sessionEpoch: 1, ...overrides },
  });
};

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: jest.fn(),
}));

describe('usePushNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: not authenticated
    mockAuthState.isAuthenticated = false;
    mockAuthState.accessToken = null;
    (useAuth as jest.Mock).mockReturnValue({ state: { ...mockAuthState } });
    // Default: push enabled (opt-in already granted) — individual tests override.
    (arePushNotificationsEnabled as jest.Mock).mockResolvedValue(true);
    (getExpoPushToken as jest.Mock).mockResolvedValue(null);
    (registerPushToken as jest.Mock).mockResolvedValue(true);
    (unregisterPushToken as jest.Mock).mockResolvedValue(true);
  });

  it('should return expoPushToken as null initially', () => {
    const { result } = renderHook(() => usePushNotifications());

    expect(result.current.expoPushToken).toBeNull();
  });

  it('should set up notification listeners on mount', () => {
    renderHook(() => usePushNotifications());

    expect(Notifications.addNotificationReceivedListener).toHaveBeenCalled();
    expect(Notifications.addNotificationResponseReceivedListener).toHaveBeenCalled();
  });

  it('should clean up notification listeners on unmount', () => {
    const mockRemoveReceived = jest.fn();
    const mockRemoveResponse = jest.fn();

    (Notifications.addNotificationReceivedListener as jest.Mock).mockReturnValue({
      remove: mockRemoveReceived,
    });
    (Notifications.addNotificationResponseReceivedListener as jest.Mock).mockReturnValue({
      remove: mockRemoveResponse,
    });

    const { unmount } = renderHook(() => usePushNotifications());

    unmount();

    expect(mockRemoveReceived).toHaveBeenCalled();
    expect(mockRemoveResponse).toHaveBeenCalled();
  });

  it('should register push token when user authenticates', async () => {
    (getExpoPushToken as jest.Mock).mockResolvedValue('ExponentPushToken[abc123]');

    // Start unauthenticated
    const { rerender } = renderHook(() => usePushNotifications());

    // Simulate authentication
    (useAuth as jest.Mock).mockReturnValue({
      state: {
        ...mockAuthState,
        isAuthenticated: true,
        accessToken: 'test-access-token',
      },
    });

    await act(async () => {
      rerender({});
    });

    expect(getExpoPushToken).toHaveBeenCalled();

    // Wait for the promise chain to resolve
    await flush();

    expect(registerPushToken).toHaveBeenCalledWith(
      'test-access-token',
      'ExponentPushToken[abc123]',
    );
  });

  it('should not register when getExpoPushToken returns null', async () => {
    (getExpoPushToken as jest.Mock).mockResolvedValue(null);

    (useAuth as jest.Mock).mockReturnValue({
      state: {
        ...mockAuthState,
        isAuthenticated: true,
        accessToken: 'test-access-token',
      },
    });

    renderHook(() => usePushNotifications());

    // Wait for the async getExpoPushToken promise chain to settle
    await flush();

    expect(getExpoPushToken).toHaveBeenCalled();
    expect(registerPushToken).not.toHaveBeenCalled();
  });

  it('should not contact Expo or register when push notifications are disabled (opt-in default)', async () => {
    // Privacy default: preference unset/disabled → no egress to exp.host.
    (arePushNotificationsEnabled as jest.Mock).mockResolvedValue(false);
    (getExpoPushToken as jest.Mock).mockResolvedValue('ExponentPushToken[should-not-happen]');

    (useAuth as jest.Mock).mockReturnValue({
      state: {
        ...mockAuthState,
        isAuthenticated: true,
        accessToken: 'test-access-token',
      },
    });

    renderHook(() => usePushNotifications());

    // Flush the arePushNotificationsEnabled().then(...) microtask chain.
    await flush();

    expect(arePushNotificationsEnabled).toHaveBeenCalled();
    expect(getExpoPushToken).not.toHaveBeenCalled();
    expect(registerPushToken).not.toHaveBeenCalled();
  });

  it('should call onNotificationTap when notification response received', () => {
    const onTap = jest.fn();
    const mockData = { type: 'inbox', itemId: '42' };

    // Capture the response listener callback
    let responseCallback: (response: any) => void = () => {};
    (Notifications.addNotificationResponseReceivedListener as jest.Mock).mockImplementation(
      (cb) => {
        responseCallback = cb;
        return { remove: jest.fn() };
      },
    );

    renderHook(() => usePushNotifications(onTap));

    // Simulate a notification tap
    responseCallback({
      notification: {
        request: {
          content: {
            data: mockData,
          },
        },
      },
    });

    expect(onTap).toHaveBeenCalledWith(mockData);
  });

  it('should not call onNotificationTap when no callback provided', () => {
    let responseCallback: (response: any) => void = () => {};
    (Notifications.addNotificationResponseReceivedListener as jest.Mock).mockImplementation(
      (cb) => {
        responseCallback = cb;
        return { remove: jest.fn() };
      },
    );

    // No onNotificationTap passed
    renderHook(() => usePushNotifications());

    // Should not throw
    expect(() => {
      responseCallback({
        notification: {
          request: {
            content: {
              data: { test: true },
            },
          },
        },
      });
    }).not.toThrow();
  });

  describe('re-registration per session (temp-password reset)', () => {
    beforeEach(() => {
      (getExpoPushToken as jest.Mock).mockResolvedValue('ExponentPushToken[dev]');
    });

    it('does not register during a temp-password session (the server would 403)', async () => {
      authed({ mustChangePassword: true, accessToken: 'temp-tok' });
      renderHook(() => usePushNotifications());
      await flush();

      expect(registerPushToken).not.toHaveBeenCalled();
    });

    it('registers after the forced password change succeeds', async () => {
      authed({ mustChangePassword: true, accessToken: 'temp-tok', sessionEpoch: 1 });
      const { rerender } = renderHook(() => usePushNotifications());
      await flush();

      authed({ mustChangePassword: false, accessToken: 'fresh-tok', sessionEpoch: 2 });
      rerender({});
      await flush();

      expect(registerPushToken).toHaveBeenCalledTimes(1);
      expect(registerPushToken).toHaveBeenCalledWith('fresh-tok', 'ExponentPushToken[dev]');
    });

    it('registers once per session: a token refresh does not re-register', async () => {
      authed({ accessToken: 'tok-1', sessionEpoch: 1 });
      const { rerender } = renderHook(() => usePushNotifications());
      await flush();

      authed({ accessToken: 'tok-2', sessionEpoch: 1 }); // background refresh
      rerender({});
      await flush();

      expect(registerPushToken).toHaveBeenCalledTimes(1);
    });

    it('registers again on a new session (e.g. a later login)', async () => {
      authed({ accessToken: 'tok-1', sessionEpoch: 1 });
      const { rerender } = renderHook(() => usePushNotifications());
      await flush();

      authed({ accessToken: 'tok-9', sessionEpoch: 2 });
      rerender({});
      await flush();

      expect(registerPushToken).toHaveBeenCalledTimes(2);
      expect(registerPushToken).toHaveBeenLastCalledWith('tok-9', 'ExponentPushToken[dev]');
    });

    it('a failed registration is retried on the next token, then stops', async () => {
      (registerPushToken as jest.Mock).mockResolvedValueOnce(false);
      authed({ accessToken: 'tok-1', sessionEpoch: 1 });
      const { rerender } = renderHook(() => usePushNotifications());
      await flush();

      authed({ accessToken: 'tok-2', sessionEpoch: 1 });
      rerender({});
      await flush();
      authed({ accessToken: 'tok-3', sessionEpoch: 1 });
      rerender({});
      await flush();

      expect(registerPushToken).toHaveBeenCalledTimes(2);
      expect(registerPushToken).toHaveBeenLastCalledWith('tok-2', 'ExponentPushToken[dev]');
    });

    it('re-registers after a sign-out and sign-in', async () => {
      authed({ accessToken: 'tok-1', sessionEpoch: 1 });
      const { rerender } = renderHook(() => usePushNotifications());
      await flush();

      (useAuth as jest.Mock).mockReturnValue({ state: { ...mockAuthState, sessionEpoch: 1 } });
      rerender({});
      await flush();
      authed({ accessToken: 'tok-2', sessionEpoch: 2 });
      rerender({});
      await flush();

      expect(registerPushToken).toHaveBeenCalledTimes(2);
    });
  });
});
