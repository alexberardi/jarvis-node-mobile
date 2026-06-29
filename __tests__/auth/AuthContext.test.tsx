import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider, useAuth } from '../../src/auth/AuthContext';
import authApi from '../../src/api/authApi';
import { deleteAccount as deleteAccountApi } from '../../src/api/accountApi';

// Mock authApi
jest.mock('../../src/api/authApi', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
    defaults: { baseURL: '' },
  },
}));

// Mock accountApi — deleteAccount is exercised directly via useAuth().deleteAccount
jest.mock('../../src/api/accountApi', () => ({
  __esModule: true,
  deleteAccount: jest.fn(),
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

// Tokens live in the OS keychain (SecureStore). Make getItemAsync return the
// given access/refresh for the keychain keys tokenStorage uses.
const setSecureTokens = (
  access = 'access-token',
  refresh = 'refresh-token',
): void => {
  (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) =>
    Promise.resolve(
      key === 'jarvis_access_token'
        ? access
        : key === 'jarvis_refresh_token'
          ? refresh
          : null,
    ),
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: keychain empty (unauthenticated). User blob + active household
    // stay in AsyncStorage and bootstrap reads them via multiGet([USER, HH]).
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
      ['@jarvis/user', null],
      ['@jarvis/active_household_id', null],
    ]);
    // Biometric defaults: not capable, opt-in flag unset. clearAllMocks leaves
    // implementations in place, so reset these explicitly each test.
    (SecureStore.canUseBiometricAuthentication as jest.Mock).mockReturnValue(false);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
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

      setSecureTokens('stored-access-token', 'stored-refresh-token');
      (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
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
      // Tokens are persisted to the OS keychain (not AsyncStorage). The third
      // arg is the keychain-accessibility options object (added for biometric
      // login); default (no opt-in) writes are ungated but device-only.
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'jarvis_access_token',
        'new-access-token',
        expect.any(Object),
      );
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'jarvis_refresh_token',
        'new-refresh-token',
        expect.any(Object),
      );
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
      setSecureTokens('access-token', 'refresh-token');
      (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
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
      // Keychain tokens cleared too.
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('jarvis_access_token');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('jarvis_refresh_token');
    });
  });

  describe('deleteAccount', () => {
    const authedStorage = () => {
      const storedUser = { id: 1, email: 'test@example.com' };
      setSecureTokens('access-token', 'refresh-token');
      (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
        ['@jarvis/user', JSON.stringify(storedUser)],
        ['@jarvis/active_household_id', null],
      ]);
      (authApi.get as jest.Mock).mockResolvedValue({ data: [] });
    };

    it('calls the API with the current token, then wipes local state on success (204)', async () => {
      authedStorage();
      (deleteAccountApi as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.state.isAuthenticated).toBe(true);
      });

      await act(async () => {
        await result.current.deleteAccount('my-password');
      });

      // API called with password + the in-context access token
      expect(deleteAccountApi).toHaveBeenCalledWith('my-password', 'access-token');
      // clearUserData ran (it always enumerates storage via getAllKeys)
      expect(AsyncStorage.getAllKeys).toHaveBeenCalled();
      // ...and cleared the keychain tokens too.
      expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
      // Auth state reset to unauthenticated → RootNavigator drops to AuthNavigator
      expect(result.current.state.isAuthenticated).toBe(false);
      expect(result.current.state.user).toBeNull();
      expect(result.current.state.accessToken).toBeNull();
      expect(result.current.state.isLoading).toBe(false);
    });

    it('surfaces "Incorrect password" on 401 and does NOT wipe (still authenticated)', async () => {
      authedStorage();
      (deleteAccountApi as jest.Mock).mockRejectedValue(new Error('Incorrect password'));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.state.isAuthenticated).toBe(true);
      });

      (AsyncStorage.getAllKeys as jest.Mock).mockClear();

      await expect(
        act(async () => {
          await result.current.deleteAccount('wrong-password');
        }),
      ).rejects.toThrow('Incorrect password');

      // No local wipe — only a 204 wipes; a 401 leaves the user logged in
      expect(AsyncStorage.getAllKeys).not.toHaveBeenCalled();
      expect(result.current.state.isAuthenticated).toBe(true);
      expect(result.current.state.accessToken).toBe('access-token');
    });

    it('surfaces the server detail on 409 and does NOT wipe (still authenticated)', async () => {
      authedStorage();
      (deleteAccountApi as jest.Mock).mockRejectedValue(
        new Error('Cannot delete account with nodes registered to it'),
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.state.isAuthenticated).toBe(true);
      });

      (AsyncStorage.getAllKeys as jest.Mock).mockClear();

      await expect(
        act(async () => {
          await result.current.deleteAccount('my-password');
        }),
      ).rejects.toThrow('Cannot delete account with nodes registered to it');

      expect(AsyncStorage.getAllKeys).not.toHaveBeenCalled();
      expect(result.current.state.isAuthenticated).toBe(true);
    });

    it('forces unauthenticated state even if clearUserData throws after a successful 204', async () => {
      authedStorage();
      (deleteAccountApi as jest.Mock).mockResolvedValue(undefined);
      // Make the local wipe blow up; deleteAccount must still drop auth state.
      (AsyncStorage.getAllKeys as jest.Mock).mockRejectedValueOnce(new Error('storage offline'));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.state.isAuthenticated).toBe(true);
      });

      await act(async () => {
        // clearUserData's failure is swallowed by the finally; deleteAccount resolves
        await result.current.deleteAccount('my-password').catch(() => {});
      });

      expect(result.current.state.isAuthenticated).toBe(false);
      expect(result.current.state.accessToken).toBeNull();
    });
  });

  describe('biometric login', () => {
    const BIOMETRIC_FLAG = '@jarvis/biometric_login_enabled';

    it('login with enableBiometric:true records the opt-in and gates the refresh token', async () => {
      (SecureStore.canUseBiometricAuthentication as jest.Mock).mockReturnValue(true);
      // The opt-in write is reflected back on read (login persists it before the
      // token write, so the gate sees it).
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
        Promise.resolve(key === BIOMETRIC_FLAG ? 'true' : null),
      );
      (authApi.post as jest.Mock).mockResolvedValue({
        data: {
          access_token: 'a1',
          refresh_token: 'r1',
          token_type: 'bearer',
          user: { id: 1, email: 'u@e.com' },
        },
      });
      (authApi.get as jest.Mock).mockResolvedValue({ data: [] });

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.state.isLoading).toBe(false));

      await act(async () => {
        await result.current.login('u@e.com', 'pw', { enableBiometric: true });
      });

      // Opt-in persisted as a boolean (never the token itself).
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(BIOMETRIC_FLAG, 'true');
      expect(result.current.state.biometricEnabled).toBe(true);
      // Refresh token written with requireAuthentication; access token without.
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'jarvis_refresh_token',
        'r1',
        expect.objectContaining({ requireAuthentication: true }),
      );
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'jarvis_access_token',
        'a1',
        expect.not.objectContaining({ requireAuthentication: true }),
      );
    });

    it('bootstrap stays unauthenticated (without clearing tokens) when the biometric read is cancelled', async () => {
      (SecureStore.canUseBiometricAuthentication as jest.Mock).mockReturnValue(true);
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
        Promise.resolve(key === BIOMETRIC_FLAG ? 'true' : null),
      );
      (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
        ['@jarvis/user', JSON.stringify({ id: 1, email: 'u@e.com' })],
        ['@jarvis/active_household_id', null],
      ]);
      // Access read succeeds; the gated refresh read throws (user cancelled).
      (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) => {
        if (key === 'jarvis_access_token') return Promise.resolve('a1');
        if (key === 'jarvis_refresh_token') return Promise.reject(new Error('UserCancel'));
        return Promise.resolve(null);
      });

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.state.isLoading).toBe(false));

      // Locked out → drops to the login screen, but the opt-in survives so the
      // "Unlock" retry button shows. Tokens are NOT deleted on cancel.
      expect(result.current.state.isAuthenticated).toBe(false);
      expect(result.current.state.biometricEnabled).toBe(true);
      expect(SecureStore.deleteItemAsync).not.toHaveBeenCalledWith('jarvis_refresh_token');
    });

    it('preserves biometricEnabled when bootstrap throws unexpectedly (Unlock button survives)', async () => {
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
        Promise.resolve(key === BIOMETRIC_FLAG ? 'true' : null),
      );
      // Make the bootstrap body throw AFTER the flag read.
      (AsyncStorage.multiGet as jest.Mock).mockRejectedValue(new Error('storage offline'));

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.state.isLoading).toBe(false));

      expect(result.current.state.isAuthenticated).toBe(false);
      expect(result.current.state.biometricEnabled).toBe(true);
    });

    it('unlockWithBiometrics authenticates when the gated read succeeds', async () => {
      (SecureStore.canUseBiometricAuthentication as jest.Mock).mockReturnValue(true);
      (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
        ['@jarvis/user', JSON.stringify({ id: 7, email: 'z@e.com' })],
        ['@jarvis/active_household_id', 'hh-9'],
      ]);
      (authApi.get as jest.Mock).mockResolvedValue({ data: [] });

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.state.isLoading).toBe(false));
      expect(result.current.state.isAuthenticated).toBe(false);

      // Now the keychain releases the tokens (biometric passed).
      setSecureTokens('a7', 'r7');
      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.unlockWithBiometrics();
      });

      expect(ok).toBe(true);
      expect(result.current.state.isAuthenticated).toBe(true);
      expect(result.current.state.user).toEqual({ id: 7, email: 'z@e.com' });
      expect(result.current.state.activeHouseholdId).toBe('hh-9');
    });

    it('setBiometricEnabled(false) re-keys the refresh token ungated', async () => {
      (SecureStore.canUseBiometricAuthentication as jest.Mock).mockReturnValue(true);
      const storedUser = { id: 1, email: 'u@e.com' };
      setSecureTokens('a1', 'r1');
      (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
        ['@jarvis/user', JSON.stringify(storedUser)],
        ['@jarvis/active_household_id', null],
      ]);
      (authApi.get as jest.Mock).mockResolvedValue({ data: [] });

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.state.isAuthenticated).toBe(true));

      (SecureStore.setItemAsync as jest.Mock).mockClear();
      await act(async () => {
        await result.current.setBiometricEnabled(false);
      });

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(BIOMETRIC_FLAG, 'false');
      expect(result.current.state.biometricEnabled).toBe(false);
      // The stored refresh token is rewritten immediately, ungated.
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'jarvis_refresh_token',
        'r1',
        expect.not.objectContaining({ requireAuthentication: true }),
      );
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
