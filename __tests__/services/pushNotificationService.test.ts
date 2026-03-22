import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import {
  getExpoPushToken,
  registerPushToken,
  unregisterPushToken,
} from '../../src/services/pushNotificationService';
import { getServiceConfig } from '../../src/config/serviceConfig';

// Mock expo-device with a mutable isDevice flag
let mockIsDevice = true;
jest.mock('expo-device', () => ({
  get isDevice() { return mockIsDevice; },
  modelName: 'iPhone 15 Pro',
}));

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  AndroidImportance: { MAX: 5 },
  addNotificationReceivedListener: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
}));

// Mock expo-constants
jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      eas: {
        projectId: 'test-project-id-123',
      },
    },
  },
}));

// Mock serviceConfig
jest.mock('../../src/config/serviceConfig', () => ({
  getServiceConfig: jest.fn().mockReturnValue({
    notificationsUrl: 'http://localhost:7712',
  }),
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('pushNotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    mockIsDevice = true;
  });

  describe('getExpoPushToken', () => {
    it('should return null when not a physical device', async () => {
      mockIsDevice = false;

      const token = await getExpoPushToken();

      expect(token).toBeNull();
      expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
    });

    it('should return token when permissions already granted', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
        data: 'ExponentPushToken[abc123]',
      });

      const token = await getExpoPushToken();

      expect(token).toBe('ExponentPushToken[abc123]');
      expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    });

    it('should request permissions when not already granted', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'undetermined',
      });
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
        data: 'ExponentPushToken[def456]',
      });

      const token = await getExpoPushToken();

      expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
      expect(token).toBe('ExponentPushToken[def456]');
    });

    it('should return null when permissions denied', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'undetermined',
      });
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
      });

      const token = await getExpoPushToken();

      expect(token).toBeNull();
    });

    it('should return null when no EAS projectId', async () => {
      // Override Constants to have no projectId
      const originalConfig = Constants.expoConfig;
      (Constants as any).expoConfig = { extra: {} };

      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });

      const token = await getExpoPushToken();

      expect(token).toBeNull();

      // Restore
      (Constants as any).expoConfig = originalConfig;
    });

    it('should set up Android notification channel on Android', async () => {
      const originalOS = Platform.OS;
      try {
        (Platform as any).OS = 'android';

        (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
          status: 'granted',
        });
        (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
          data: 'ExponentPushToken[android]',
        });

        await getExpoPushToken();

        expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
          'default',
          expect.objectContaining({
            name: 'Default',
            importance: Notifications.AndroidImportance.MAX,
          }),
        );
      } finally {
        (Platform as any).OS = originalOS;
      }
    });

    it('should pass projectId to getExpoPushTokenAsync', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
        data: 'ExponentPushToken[xyz]',
      });

      await getExpoPushToken();

      expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
        projectId: 'test-project-id-123',
      });
    });
  });

  describe('registerPushToken', () => {
    it('should register token successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1 }),
      });

      const result = await registerPushToken(
        'access-token-123',
        'ExponentPushToken[abc]',
        'My iPhone',
      );

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:7712/api/v0/tokens',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer access-token-123',
          },
        }),
      );

      // Verify body contents
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.push_token).toBe('ExponentPushToken[abc]');
      expect(callBody.device_name).toBe('My iPhone');
    });

    it('should use default device name when not provided', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await registerPushToken('token', 'ExponentPushToken[abc]');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.device_name).toContain('iPhone 15 Pro');
    });

    it('should return false when notifications URL not configured', async () => {
      (getServiceConfig as jest.Mock).mockReturnValueOnce({
        notificationsUrl: null,
      });

      const result = await registerPushToken('token', 'ExponentPushToken[abc]');

      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return false on HTTP error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      const result = await registerPushToken('bad-token', 'ExponentPushToken[abc]');

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await registerPushToken('token', 'ExponentPushToken[abc]');

      expect(result).toBe(false);
    });
  });

  describe('unregisterPushToken', () => {
    it('should unregister token successfully', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const result = await unregisterPushToken(
        'access-token-123',
        'ExponentPushToken[abc]',
      );

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:7712/api/v0/tokens',
        expect.objectContaining({
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer access-token-123',
          },
        }),
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.push_token).toBe('ExponentPushToken[abc]');
    });

    it('should return false when notifications URL not configured', async () => {
      (getServiceConfig as jest.Mock).mockReturnValueOnce({
        notificationsUrl: null,
      });

      const result = await unregisterPushToken('token', 'ExponentPushToken[abc]');

      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return false on HTTP error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await unregisterPushToken('token', 'ExponentPushToken[abc]');

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await unregisterPushToken('token', 'ExponentPushToken[abc]');

      expect(result).toBe(false);
    });
  });
});
