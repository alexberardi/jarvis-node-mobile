import { renderHook, act } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';

import { usePushNotifications } from '../../src/hooks/usePushNotifications';
import {
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
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

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
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(getExpoPushToken).toHaveBeenCalled();
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
});
