/**
 * FLOW: an admin resets the user's password while they're signed in.
 *
 * jarvisd then answers every user route with 403 {"code":
 * "password_change_required"} — for the old token too. Real AuthProvider +
 * real apiClient interceptor + real LoginScreen; only storage/native leaves
 * and the auth-service transport are mocked. Expected:
 *  - a burst of 403s signs the user out ONCE and wipes the session;
 *  - the login screen says why;
 *  - signing in with the temp password lands on the must-change gate, where
 *    the same 403 no longer signs anyone out.
 */
import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';

import LoginScreen from '../../src/screens/Auth/LoginScreen';
import { AuthProvider, SIGN_OUT_NOTICES, useAuth } from '../../src/auth/AuthContext';
import apiClient from '../../src/api/apiClient';
import authApi from '../../src/api/authApi';
import * as tokenStorage from '../../src/services/tokenStorage';
import { lightTheme } from '../../src/theme';

jest.mock('../../src/api/authApi', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn() },
}));

jest.mock('../../src/services/tokenStorage', () => ({
  getTokens: jest.fn().mockResolvedValue({ accessToken: null, refreshToken: null }),
  setTokens: jest.fn().mockResolvedValue(undefined),
  setAccessToken: jest.fn().mockResolvedValue(undefined),
  clearTokens: jest.fn().mockResolvedValue(undefined),
  readDurableRefreshToken: jest.fn().mockResolvedValue(null),
  readTokenForBg: jest.fn().mockResolvedValue({ access: null, refresh: null }),
  isBiometricLoginEnabled: jest.fn().mockResolvedValue(false),
  setBiometricLoginEnabled: jest.fn().mockResolvedValue(undefined),
  biometricCapable: jest.fn(() => false),
}));

jest.mock('../../src/contexts/ConfigContext', () => ({
  useConfig: () => ({ rediscover: jest.fn().mockResolvedValue(undefined) }),
}));

jest.mock('../../src/services/k2Service', () => ({ setK2UserId: jest.fn() }));

const PW_REQUIRED = { detail: 'password change required', code: 'password_change_required' };

const Harness = () => {
  const { state } = useAuth();
  const status = state.isLoading
    ? 'loading'
    : !state.isAuthenticated
      ? 'anon'
      : state.mustChangePassword
        ? 'gated'
        : 'authed';
  return <Text>{`status=${status}`}</Text>;
};

const renderApp = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthProvider>
        <PaperProvider theme={lightTheme}>
          <Harness />
          <LoginScreen navigation={{ navigate: jest.fn(), goBack: jest.fn() } as any} route={{} as any} />
        </PaperProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );

const loginAs = (response: object) => {
  (authApi.post as jest.Mock).mockImplementation((url: string) =>
    url === '/auth/login' ? Promise.resolve({ data: response }) : Promise.resolve({ data: {} }),
  );
};

const submitLogin = (getAllByText: any, password: string) => {
  const emails = getAllByText('Email');
  fireEvent.changeText(emails[emails.length - 1], 'user@example.com');
  const passwords = getAllByText('Password');
  fireEvent.changeText(passwords[passwords.length - 1], password);
  const buttons = getAllByText('Log In');
  fireEvent.press(buttons[buttons.length - 1]);
};

const fireApiBurst = async () => {
  await act(async () => {
    await Promise.allSettled([
      apiClient.get('http://cc/api/v0/mobile/nodes'),
      apiClient.get('http://cc/api/v0/inbox'),
      apiClient.get('http://cc/api/v0/routines'),
    ]);
  });
};

describe('Password reset → sign out → temp-password login (flow)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authApi.get as jest.Mock).mockResolvedValue({ data: [] });
    (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([]);
    (apiClient.defaults as any).adapter = (config: any) =>
      Promise.reject(
        Object.assign(new Error('403'), {
          config,
          response: { status: 403, data: PW_REQUIRED, config },
        }),
      );
  });

  it('signs out once with a notice, then the temp-password login is gated and stays signed in', async () => {
    const { findByText, getAllByText, getByTestId } = renderApp();
    await findByText('status=anon');

    loginAs({
      access_token: 'old-access',
      refresh_token: 'old-refresh',
      token_type: 'bearer',
      user: { id: 7, email: 'user@example.com' },
    });
    submitLogin(getAllByText, 'old-password');
    await findByText('status=authed');

    // Admin resets the password; the screens' next requests all 403.
    await fireApiBurst();

    await findByText('status=anon');
    expect(tokenStorage.clearTokens).toHaveBeenCalledTimes(1); // one logout, not three
    expect(getByTestId('sign-out-notice')).toHaveTextContent(SIGN_OUT_NOTICES.password_reset);

    // Sign in with the temp password → must-change gate.
    loginAs({
      access_token: 'temp-access',
      refresh_token: 'temp-refresh',
      token_type: 'bearer',
      user: { id: 7, email: 'user@example.com' },
      must_change_password: true,
    });
    submitLogin(getAllByText, 'temp-password');
    await findByText('status=gated');

    // Background requests during the forced-change flow still 403 — expected.
    await fireApiBurst();

    expect(await findByText('status=gated')).toBeTruthy();
    expect(tokenStorage.clearTokens).toHaveBeenCalledTimes(1);
  });
});
