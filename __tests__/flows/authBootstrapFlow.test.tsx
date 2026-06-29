import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider } from 'react-native-paper';

import LoginScreen from '../../src/screens/Auth/LoginScreen';
import { AuthProvider, useAuth } from '../../src/auth/AuthContext';
import { lightTheme } from '../../src/theme';
import authApi from '../../src/api/authApi';
import * as tokenStorage from '../../src/services/tokenStorage';

// L1 FLOW INTEGRATION — the real AuthContext bootstrap (login → token persist →
// fetch households → auto-select). The existing LoginScreen test stubs
// useAuth().login, so the real auth state machine is never exercised. Here the
// real LoginScreen runs inside the REAL AuthProvider; only the api/storage
// leaves are mocked.

jest.mock('../../src/api/authApi', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn() },
}));

jest.mock('../../src/services/tokenStorage', () => ({
  getTokens: jest.fn().mockResolvedValue({ accessToken: null, refreshToken: null, biometricCancelled: false }),
  setTokens: jest.fn().mockResolvedValue(undefined),
  setAccessToken: jest.fn().mockResolvedValue(undefined),
  isBiometricLoginEnabled: jest.fn().mockResolvedValue(false),
  setBiometricLoginEnabled: jest.fn().mockResolvedValue(undefined),
  biometricCapable: jest.fn(() => false),
}));

// AuthProvider reads useConfig() (rediscover, used only on logout); stub it so
// the test doesn't need the real ConfigProvider / config discovery.
jest.mock('../../src/contexts/ConfigContext', () => ({
  useConfig: () => ({ rediscover: jest.fn() }),
}));

const HOUSEHOLDS = [
  { id: 'hh-1', name: 'Home', role: 'admin', created_at: '2026-01-01T00:00:00Z' },
  { id: 'hh-2', name: 'Cabin', role: 'member', created_at: '2026-01-02T00:00:00Z' },
];

// Observes the real AuthContext state from inside the provider.
const AuthStateProbe = () => {
  const { state } = useAuth();
  const status = state.isLoading ? 'loading' : state.isAuthenticated ? 'authed' : 'anon';
  return (
    <>
      <Text>{`status=${status}`}</Text>
      <Text>{`households=${state.households.length}`}</Text>
      <Text>{`active=${state.activeHouseholdId ?? 'none'}`}</Text>
    </>
  );
};

const mockNav = { navigate: jest.fn(), goBack: jest.fn() } as any;

const renderAuth = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PaperProvider theme={lightTheme}>
          <AuthStateProbe />
          <LoginScreen navigation={mockNav} route={{} as any} />
        </PaperProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
};

describe('Auth bootstrap — flow integration (real AuthContext: login → token persist → households)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (tokenStorage.getTokens as jest.Mock).mockResolvedValue({ accessToken: null, refreshToken: null });
    (authApi.post as jest.Mock).mockResolvedValue({
      data: {
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        token_type: 'bearer',
        user: { id: 7, email: 'user@example.com' },
      },
    });
    (authApi.get as jest.Mock).mockResolvedValue({ data: HOUSEHOLDS });
  });

  it('logs in via the real AuthContext, persists tokens, then fetches + auto-selects a household', async () => {
    const { getByText, findByText, getAllByText } = renderAuth();

    // Bootstrap finishes unauthenticated (no stored tokens in the keychain mock).
    await findByText('status=anon');

    // Drive the REAL LoginScreen against the REAL AuthProvider.
    const emails = getAllByText('Email');
    fireEvent.changeText(emails[emails.length - 1], 'user@example.com');
    const passwords = getAllByText('Password');
    fireEvent.changeText(passwords[passwords.length - 1], 'password123');
    const loginButtons = getAllByText('Log In');
    fireEvent.press(loginButtons[loginButtons.length - 1]);

    // login() → POST /auth/login → persistAuth → isAuthenticated, tokens to keychain.
    await findByText('status=authed');
    expect(authApi.post).toHaveBeenCalledWith('/auth/login', {
      email: 'user@example.com',
      password: 'password123',
    });
    expect(tokenStorage.setTokens).toHaveBeenCalledWith('access-1', 'refresh-1');

    // The authenticated effect fetches households and auto-selects the first.
    await waitFor(() => {
      expect(getByText('households=2')).toBeTruthy();
      expect(getByText('active=hh-1')).toBeTruthy();
    });
    expect(authApi.get).toHaveBeenCalledWith(
      '/households',
      expect.objectContaining({ headers: { Authorization: 'Bearer access-1' } }),
    );
  });

  it('stays unauthenticated and never fetches households when login fails', async () => {
    (authApi.post as jest.Mock).mockRejectedValue({
      response: { data: { detail: 'Invalid email or password' } },
    });
    const { getByText, findByText, getAllByText } = renderAuth();

    await findByText('status=anon');

    const emails = getAllByText('Email');
    fireEvent.changeText(emails[emails.length - 1], 'bad@example.com');
    const passwords = getAllByText('Password');
    fireEvent.changeText(passwords[passwords.length - 1], 'wrong');
    const loginButtons = getAllByText('Log In');
    fireEvent.press(loginButtons[loginButtons.length - 1]);

    // The screen surfaces the error; the REAL context never transitions to authed.
    await findByText('Invalid email or password');
    expect(getByText('status=anon')).toBeTruthy();
    expect(tokenStorage.setTokens).not.toHaveBeenCalled();
    expect(authApi.get).not.toHaveBeenCalled(); // no household fetch on a failed login
  });
});
