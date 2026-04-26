import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider, useAuth } from '../../src/auth/AuthContext';
import authApi from '../../src/api/authApi';

// Mock authApi
jest.mock('../../src/api/authApi', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
    defaults: { baseURL: '' },
  },
}));

// AuthProvider depends on ConfigContext for `rediscover`. Mock it so we don't
// need to spin up the real network-discovery flow in tests.
jest.mock('../../src/contexts/ConfigContext', () => ({
  useConfig: () => ({
    config: {
      configServiceUrl: 'http://localhost:7700',
      authBaseUrl: 'http://localhost:7701',
      commandCenterUrl: 'http://localhost:7703',
    },
    isUsingCloud: false,
    fallbackMessage: null,
    manualUrl: null,
    rediscover: jest.fn().mockResolvedValue(undefined),
    setManualUrl: jest.fn().mockResolvedValue(undefined),
  }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
      ['@jarvis/access_token', null],
      ['@jarvis/refresh_token', null],
      ['@jarvis/user', null],
      ['@jarvis/active_household_id', null],
    ]);
  });

  describe('useAuth', () => {
    it('should throw when used outside AuthProvider', () => {
      // Suppress console.error for expected error
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useAuth());
      }).toThrow('useAuth must be used within AuthProvider');

      spy.mockRestore();
    });
  });

  describe('initial state', () => {
    it('should start with loading true and unauthenticated', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      // Initially loading
      expect(result.current.state.isLoading).toBe(true);

      // After bootstrap, loading should complete
      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false);
      });

      expect(result.current.state.isAuthenticated).toBe(false);
      expect(result.current.state.user).toBeNull();
      expect(result.current.state.accessToken).toBeNull();
    });
  });

  describe('bootstrapAuth', () => {
    it('should restore auth state from storage', async () => {
      const storedUser = { id: 1, email: 'test@example.com', username: 'testuser' };

      (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
        ['@jarvis/access_token', 'stored-access-token'],
        ['@jarvis/refresh_token', 'stored-refresh-token'],
        ['@jarvis/user', JSON.stringify(storedUser)],
        ['@jarvis/active_household_id', 'household-1'],
      ]);

      // Mock fetchHouseholds
      (authApi.get as jest.Mock).mockResolvedValue({ data: [] });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false);
      });

      expect(result.current.state.isAuthenticated).toBe(true);
      expect(result.current.state.user).toEqual(storedUser);
      expect(result.current.state.accessToken).toBe('stored-access-token');
      expect(result.current.state.activeHouseholdId).toBe('household-1');
    });

    it('should remain unauthenticated when storage is empty', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false);
      });

      expect(result.current.state.isAuthenticated).toBe(false);
    });
  });

  describe('login', () => {
    it('should authenticate and persist tokens on successful login', async () => {
      const mockResponse = {
        data: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          token_type: 'bearer',
          user: { id: 1, email: 'user@example.com' },
        },
      };

      (authApi.post as jest.Mock).mockResolvedValue(mockResponse);
      (authApi.get as jest.Mock).mockResolvedValue({ data: [] });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.login('user@example.com', 'password123');
      });

      expect(result.current.state.isAuthenticated).toBe(true);
      expect(result.current.state.user).toEqual({ id: 1, email: 'user@example.com' });
      expect(result.current.state.accessToken).toBe('new-access-token');
      expect(AsyncStorage.multiSet).toHaveBeenCalled();
    });

    it('should propagate error on failed login', async () => {
      (authApi.post as jest.Mock).mockRejectedValue(new Error('Invalid credentials'));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false);
      });

      await expect(
        act(async () => {
          await result.current.login('bad@email.com', 'wrong');
        })
      ).rejects.toThrow('Invalid credentials');

      expect(result.current.state.isAuthenticated).toBe(false);
    });
  });

  describe('register', () => {
    it('should authenticate and set household on successful registration', async () => {
      const mockResponse = {
        data: {
          access_token: 'reg-access-token',
          refresh_token: 'reg-refresh-token',
          token_type: 'bearer',
          user: { id: 2, email: 'new@example.com' },
          household_id: 'new-household-1',
        },
      };

      (authApi.post as jest.Mock).mockResolvedValue(mockResponse);
      (authApi.get as jest.Mock).mockResolvedValue({ data: [] });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.register('new@example.com', 'Password1');
      });

      expect(result.current.state.isAuthenticated).toBe(true);
      expect(result.current.state.user).toEqual({ id: 2, email: 'new@example.com' });
      expect(result.current.state.activeHouseholdId).toBe('new-household-1');
    });
  });

  describe('logout', () => {
    it('should clear auth state and storage', async () => {
      // First, set up authenticated state
      const storedUser = { id: 1, email: 'test@example.com' };
      (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
        ['@jarvis/access_token', 'access-token'],
        ['@jarvis/refresh_token', 'refresh-token'],
        ['@jarvis/user', JSON.stringify(storedUser)],
        ['@jarvis/active_household_id', null],
      ]);
      (authApi.get as jest.Mock).mockResolvedValue({ data: [] });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.state.isAuthenticated).toBe(true);
      });

      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.state.isAuthenticated).toBe(false);
      expect(result.current.state.user).toBeNull();
      expect(result.current.state.accessToken).toBeNull();
      expect(AsyncStorage.multiRemove).toHaveBeenCalled();
    });
  });

  describe('setActiveHousehold', () => {
    it('should update active household in state and storage', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.setActiveHousehold('household-123');
      });

      expect(result.current.state.activeHouseholdId).toBe('household-123');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@jarvis/active_household_id',
        'household-123'
      );
    });

    it('should remove from storage when set to null', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.setActiveHousehold(null);
      });

      expect(result.current.state.activeHouseholdId).toBeNull();
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith(
        '@jarvis/active_household_id'
      );
    });
  });
});
