import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider, Button } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';

import LoginScreen from '../../src/screens/Auth/LoginScreen';
import { AuthProvider, useAuth } from '../../src/auth/AuthContext';
import { lightTheme } from '../../src/theme';
import authApi from '../../src/api/authApi';
import * as tokenStorage from '../../src/services/tokenStorage';

// L1 FLOW INTEGRATION — the real logout SECURITY path. logout() runs the real
// clearUserData (wipes @jarvis/* AsyncStorage + auth tokens + the react-query
// cache; PRESERVES theme/auto-play/push prefs) and drops the context to
// unauthenticated. This guards against one user's data (nodes, K2 userId, cached
// service URLs, household-scoped queries) bleeding into the next login on a
// shared device. The existing AuthContext unit test stubs the pieces; here the
// real AuthProvider + clearUserData run, with only the storage/native LEAVES
// mocked. Mirror of authBootstrapFlow.test.tsx.

jest.mock('../../src/api/authApi', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn() },
}));

jest.mock('../../src/services/tokenStorage', () => ({
  getTokens: jest.fn().mockResolvedValue({ accessToken: null, refreshToken: null, biometricCancelled: false }),
  setTokens: jest.fn().mockResolvedValue(undefined),
  setAccessToken: jest.fn().mockResolvedValue(undefined),
  clearTokens: jest.fn().mockResolvedValue(undefined),
  isBiometricLoginEnabled: jest.fn().mockResolvedValue(false),
  setBiometricLoginEnabled: jest.fn().mockResolvedValue(undefined),
  biometricCapable: jest.fn(() => false),
}));

jest.mock('../../src/contexts/ConfigContext', () => ({
  useConfig: () => ({ rediscover: jest.fn().mockResolvedValue(undefined) }),
}));

// K2 in-memory userId reset is part of the wipe; mock the leaf.
jest.mock('../../src/services/k2Service', () => ({ setK2UserId: jest.fn() }));

import { setK2UserId } from '../../src/services/k2Service';

const HOUSEHOLDS = [
  { id: 'hh-1', name: 'Home', role: 'admin', created_at: '2026-01-01T00:00:00Z' },
];

// The keys present in AsyncStorage at logout time: two per-user keys that MUST be
// wiped (a cached node list + a routine binding) and one preference that MUST be
// preserved (theme), plus an unrelated key the wipe must not touch.
const STORAGE_KEYS = [
  '@jarvis/theme', // preserved
  '@jarvis/cached_nodes', // wiped
  'routine_bindings:hh-1', // wiped
  'some_other_lib_key', // untouched
];

const mockNav = { navigate: jest.fn(), goBack: jest.fn() } as any;

// Probe + a logout trigger, both inside the REAL AuthProvider.
const Harness = () => {
  const { state, logout } = useAuth();
  const status = state.isLoading ? 'loading' : state.isAuthenticated ? 'authed' : 'anon';
  return (
    <>
      <Text>{`status=${status}`}</Text>
      <Button testID="logout-trigger" onPress={() => logout()}>
        Log Out
      </Button>
    </>
  );
};

const renderApp = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const clearSpy = jest.spyOn(queryClient, 'clear');
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PaperProvider theme={lightTheme}>
          <Harness />
          <LoginScreen navigation={mockNav} route={{} as any} />
        </PaperProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { ...utils, clearSpy };
};

const login = async (findByText: any, getAllByText: any) => {
  await findByText('status=anon');
  const emails = getAllByText('Email');
  fireEvent.changeText(emails[emails.length - 1], 'user@example.com');
  const passwords = getAllByText('Password');
  fireEvent.changeText(passwords[passwords.length - 1], 'password123');
  const loginButtons = getAllByText('Log In');
  fireEvent.press(loginButtons[loginButtons.length - 1]);
  await findByText('status=authed');
};

describe('Logout — flow integration (real AuthContext + clearUserData security wipe)', () => {
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
    (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue(STORAGE_KEYS);
    (AsyncStorage.multiRemove as jest.Mock).mockResolvedValue(undefined);
  });

  it('logout drops to unauthenticated and wipes per-user data, preserving prefs', async () => {
    const { findByText, getByTestId, getAllByText, clearSpy } = renderApp();

    await login(findByText, getAllByText);

    fireEvent.press(getByTestId('logout-trigger'));

    // Real logout() -> clearUserData() -> unauthenticated.
    await findByText('status=anon');

    // Auth tokens (OS keychain) explicitly cleared.
    expect(tokenStorage.clearTokens).toHaveBeenCalledTimes(1);

    // Per-user @jarvis/* + routine bindings wiped; theme pref + unrelated key NOT.
    // Assert on clearUserData's bulk-wipe call specifically: the AsyncStorage
    // mock implements removeItem() via multiRemove(), so single-key removals
    // elsewhere in the flow (e.g. login clearing the must-change-password
    // flag) also show up as multiRemove calls.
    const bulkWipes = (AsyncStorage.multiRemove as jest.Mock).mock.calls
      .map((call) => call[0] as string[])
      .filter((keys) => keys.includes('@jarvis/cached_nodes'));
    expect(bulkWipes).toHaveLength(1);
    const removed: string[] = bulkWipes[0];
    expect(removed).toEqual(
      expect.arrayContaining(['@jarvis/cached_nodes', 'routine_bindings:hh-1']),
    );
    expect(removed).not.toContain('@jarvis/theme');
    expect(removed).not.toContain('some_other_lib_key');

    // react-query cache cleared + K2 in-memory userId reset (no cross-user leak).
    expect(clearSpy).toHaveBeenCalled();
    expect(setK2UserId).toHaveBeenCalledWith(null);
  });

  it('forces the unauthenticated state even if the cache wipe throws', async () => {
    // A storage failure during the wipe must NOT leave the user authenticated.
    (AsyncStorage.multiRemove as jest.Mock).mockRejectedValue(new Error('disk full'));
    const { findByText, getByTestId, getAllByText } = renderApp();

    await login(findByText, getAllByText);
    fireEvent.press(getByTestId('logout-trigger'));

    await waitFor(() => expect(getByTestId('logout-trigger')).toBeTruthy());
    await findByText('status=anon');
  });
});
