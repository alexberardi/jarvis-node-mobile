/**
 * AuthContext's side of the central forced logout (see apiClient): the
 * `onForceLogout(reason)` bridge must clear the session and leave a notice for
 * the login screen, `isPasswordChangePending` must reflect the temp-password
 * gate, and each new session (login / change-password) bumps `sessionEpoch`
 * so push registration re-runs.
 */
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider, SIGN_OUT_NOTICES, useAuth } from '../../src/auth/AuthContext';
import authApi from '../../src/api/authApi';
import { configureApiClient } from '../../src/api/apiClient';

jest.mock('../../src/api/authApi', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn(), delete: jest.fn(), defaults: { baseURL: '' } },
}));

jest.mock('../../src/api/apiClient', () => ({
  __esModule: true,
  default: {},
  configureApiClient: jest.fn(),
  refreshAuthToken: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../src/contexts/ConfigContext', () => ({
  useConfig: () => ({ rediscover: jest.fn().mockResolvedValue(undefined) }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    <AuthProvider>{children}</AuthProvider>
  </QueryClientProvider>
);

type Bridge = Parameters<typeof configureApiClient>[0];
const bridge = (): Bridge => {
  const calls = (configureApiClient as jest.Mock).mock.calls;
  return calls[calls.length - 1][0];
};

const loginResponse = (mustChange: boolean, access = 'a1') => ({
  data: {
    access_token: access,
    refresh_token: `r-${access}`,
    token_type: 'bearer',
    user: { id: 7, email: 'user@example.com' },
    must_change_password: mustChange,
  },
});

const setup = async () => {
  const hook = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(hook.result.current.state.isLoading).toBe(false));
  return hook;
};

describe('AuthContext forced logout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStore.canUseBiometricAuthentication as jest.Mock).mockReturnValue(false);
    (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
      ['@jarvis/user', null],
      ['@jarvis/active_household_id', null],
    ]);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (authApi.get as jest.Mock).mockResolvedValue({ data: [] });
    (authApi.post as jest.Mock).mockResolvedValue({ data: {} });
  });

  it.each([
    ['password_reset', SIGN_OUT_NOTICES.password_reset],
    ['session_expired', SIGN_OUT_NOTICES.session_expired],
  ] as const)('onForceLogout(%s) signs out and leaves the notice', async (reason, notice) => {
    (authApi.post as jest.Mock).mockResolvedValueOnce(loginResponse(false));
    const { result } = await setup();
    await act(async () => {
      await result.current.login('user@example.com', 'pw');
    });
    expect(result.current.state.isAuthenticated).toBe(true);

    await act(async () => {
      bridge().onForceLogout(reason);
    });

    await waitFor(() => expect(result.current.state.isAuthenticated).toBe(false));
    expect(result.current.state.accessToken).toBeNull();
    expect(result.current.state.refreshToken).toBeNull();
    expect(result.current.state.signOutNotice).toBe(notice);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('jarvis_refresh_token');
  });

  it('a manual logout leaves no notice, and the next login clears an old one', async () => {
    (authApi.post as jest.Mock).mockResolvedValueOnce(loginResponse(false));
    const { result } = await setup();
    await act(async () => {
      await result.current.login('user@example.com', 'pw');
    });
    await act(async () => {
      bridge().onForceLogout('password_reset');
    });
    await waitFor(() => expect(result.current.state.signOutNotice).not.toBeNull());

    (authApi.post as jest.Mock).mockResolvedValueOnce(loginResponse(true, 'temp'));
    await act(async () => {
      await result.current.login('user@example.com', 'temp-pw');
    });
    expect(result.current.state.signOutNotice).toBeNull();

    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.state.signOutNotice).toBeNull();

    // Wired once: re-wiring would reset the client's forced-logout dedupe
    // mid-teardown and let a straggler request sign out a second time.
    expect(configureApiClient).toHaveBeenCalledTimes(1);
  });

  it('isPasswordChangePending tracks the temp-password gate', async () => {
    (authApi.post as jest.Mock).mockImplementation((url: string) =>
      Promise.resolve(url === '/auth/change-password' ? loginResponse(false, 'fresh') : loginResponse(true, 'temp')),
    );
    const { result } = await setup();
    expect(bridge().isPasswordChangePending?.()).toBe(false);

    await act(async () => {
      await result.current.login('user@example.com', 'temp-pw');
    });
    expect(bridge().isPasswordChangePending?.()).toBe(true);

    await act(async () => {
      await result.current.changePassword('NewPassw0rd');
    });
    expect(bridge().isPasswordChangePending?.()).toBe(false);
  });

  it('a temp-password login never renders an un-gated authenticated state', async () => {
    (authApi.post as jest.Mock).mockResolvedValueOnce(loginResponse(true, 'temp'));
    const seen: Array<{ auth: boolean; gate: boolean }> = [];
    const { result } = renderHook(
      () => {
        const ctx = useAuth();
        seen.push({ auth: ctx.state.isAuthenticated, gate: ctx.state.mustChangePassword });
        return ctx;
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.state.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('user@example.com', 'temp-pw');
    });

    // The main app (and its 403-ing queries / push registration) must never
    // mount for a temp-password session, not even for one render.
    expect(seen.some((s) => s.auth && !s.gate)).toBe(false);
    expect(result.current.state.mustChangePassword).toBe(true);
  });

  it('sessionEpoch bumps on every login and on a successful password change', async () => {
    (authApi.post as jest.Mock).mockImplementation((url: string) =>
      Promise.resolve(url === '/auth/change-password' ? loginResponse(false, 'fresh') : loginResponse(true, 'temp')),
    );
    const { result } = await setup();
    const e0 = result.current.state.sessionEpoch;

    await act(async () => {
      await result.current.login('user@example.com', 'temp-pw');
    });
    const e1 = result.current.state.sessionEpoch;
    expect(e1).toBeGreaterThan(e0);

    await act(async () => {
      await result.current.changePassword('NewPassw0rd');
    });
    expect(result.current.state.sessionEpoch).toBeGreaterThan(e1);
  });
});
