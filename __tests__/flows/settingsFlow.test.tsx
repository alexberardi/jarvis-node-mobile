import React from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import SettingsScreen from '../../src/screens/Settings/SettingsScreen';
import { lightTheme } from '../../src/theme';
import authApi from '../../src/api/authApi';
import { getSmartHomeConfig, updateSmartHomeConfig } from '../../src/api/smartHomeApi';
import { getVoiceProfileStatus } from '../../src/api/voiceProfileApi';
import {
  arePushNotificationsEnabled,
  setPushNotificationsEnabled,
} from '../../src/services/pushNotificationService';

// L1 FLOW INTEGRATION — the Settings surface (the existing screen test is
// shallow / render-only). Asserts the real behaviors the brain hangs off of:
//   - invite-code validate-on-blur (authApi.get → /invites/:code/validate with
//     bearer header) and the Join button (authApi.post /households/join +
//     fetchHouseholds + "Joined!" Alert);
//   - create-household (authApi.post /households + "Created!" Alert), incl. the
//     error path surfacing the server detail;
//   - the destructive delete-account confirm (deleteAccount(password) from
//     useAuth, gated on password + the literal "DELETE" text) and its error
//     surface;
//   - the smart-home optimistic toggles (use-external-devices Switch +
//     primary-node radio → updateSmartHomeConfig(hh, {...}), with revert + Alert
//     on failure);
//   - load fan-out (voice-profile status, push pref, smart-home config) keyed on
//     the active household.
// Real screen + real useState; only leaf apis/services + the contexts are mocked.

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));

const mockLogout = jest.fn();
const mockDeleteAccount = jest.fn();
const mockSwitchHousehold = jest.fn();
const mockFetchHouseholds = jest.fn();
let mockAuthState: any;
jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({
    state: mockAuthState,
    logout: mockLogout,
    deleteAccount: mockDeleteAccount,
    switchHousehold: mockSwitchHousehold,
    fetchHouseholds: mockFetchHouseholds,
  }),
}));

const mockRediscover = jest.fn();
const mockSetManualUrl = jest.fn();
jest.mock('../../src/contexts/ConfigContext', () => ({
  useConfig: () => ({
    config: {
      configServiceUrl: 'http://192.168.1.100:7700',
      authBaseUrl: 'http://192.168.1.100:7701',
      commandCenterUrl: 'http://192.168.1.100:7703',
    },
    isUsingCloud: false,
    manualUrl: null,
    rediscover: mockRediscover,
    setManualUrl: mockSetManualUrl,
  }),
}));

const mockSetThemePreference = jest.fn();
jest.mock('../../src/theme/ThemeProvider', () => ({
  useThemePreference: () => ({
    isDark: false,
    toggleTheme: jest.fn(),
    paperTheme: require('../../src/theme').lightTheme,
    themePreference: 'light',
    setThemePreference: mockSetThemePreference,
  }),
}));

jest.mock('../../src/api/authApi', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({ data: { valid: false, household_name: null } }),
    post: jest.fn().mockResolvedValue({ data: {} }),
    patch: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
  },
}));

jest.mock('../../src/api/smartHomeApi', () => ({
  getSmartHomeConfig: jest.fn(),
  updateSmartHomeConfig: jest.fn(),
}));

jest.mock('../../src/api/voiceProfileApi', () => ({
  getVoiceProfileStatus: jest.fn(),
}));

jest.mock('../../src/services/pushNotificationService', () => ({
  arePushNotificationsEnabled: jest.fn(),
  setPushNotificationsEnabled: jest.fn(),
}));

jest.mock('../../src/services/clearUserData', () => ({
  clearUserData: jest.fn().mockResolvedValue(undefined),
}));

const get = authApi.get as jest.Mock;
const post = authApi.post as jest.Mock;
const getSH = getSmartHomeConfig as jest.Mock;
const updateSH = updateSmartHomeConfig as jest.Mock;
const getVP = getVoiceProfileStatus as jest.Mock;

const SMART_HOME = {
  device_manager: 'jarvis_direct',
  primary_node_id: 'node-1',
  use_external_devices: false,
  nodes: [
    { node_id: 'node-1', room: 'Kitchen', online: true, last_seen: null },
    { node_id: 'node-2', room: 'Office', online: true, last_seen: null },
  ],
};

const AUTH_HEADERS = { headers: { Authorization: 'Bearer mock-token' } };

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <PaperProvider theme={lightTheme}>{children}</PaperProvider>
    </QueryClientProvider>
  );
};

const renderScreen = () => render(<SettingsScreen />, { wrapper });

describe('Settings — flow integration (households, delete-account, smart-home toggles)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState = {
      user: { id: 1, email: 'alex@example.com', username: 'alex' },
      accessToken: 'mock-token',
      isAuthenticated: true,
      isLoading: false,
      households: [
        { id: 'hh-1', name: 'Home', role: 'admin', created_at: '2026-01-01' },
        { id: 'hh-2', name: 'Office', role: 'member', created_at: '2026-01-01' },
      ],
      activeHouseholdId: 'hh-1',
      refreshToken: null,
    };
    getSH.mockResolvedValue(SMART_HOME);
    updateSH.mockResolvedValue(SMART_HOME);
    getVP.mockResolvedValue({ has_profile: true, sample_count: 3 });
    (arePushNotificationsEnabled as jest.Mock).mockResolvedValue(true);
    (setPushNotificationsEnabled as jest.Mock).mockResolvedValue(undefined);
  });

  it('on mount fans out the household-keyed loads (voice-profile, push pref, smart-home)', async () => {
    const utils = renderScreen();

    await waitFor(() => {
      expect(getVP).toHaveBeenCalledWith('hh-1');
      expect(getSH).toHaveBeenCalledWith('hh-1');
    });
    expect(arePushNotificationsEnabled).toHaveBeenCalled();
    // auto-play pref is read from AsyncStorage on mount
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('@jarvis/auto_play_tts');
    // voice-profile enrolled → "Enrolled" hint shown
    await utils.findByText('Enrolled — Jarvis recognizes your voice');
  });

  it('invite code blur → validate via authApi.get with bearer; valid code enables Join', async () => {
    get.mockResolvedValueOnce({ data: { valid: true, household_name: 'Beach House' } });
    const utils = renderScreen();

    const input = utils.getByTestId('join-invite-code');
    // Join is gated until a valid code resolves
    expect(utils.getByTestId('join-household-button').props.accessibilityState?.disabled).toBe(true);

    fireEvent.changeText(input, 'ABCD1234');
    await act(async () => {
      fireEvent(input, 'blur');
    });

    expect(get).toHaveBeenCalledWith(
      '/invites/ABCD1234/validate',
      AUTH_HEADERS,
    );
    await utils.findByText("You'll join: Beach House");
    await waitFor(() =>
      expect(utils.getByTestId('join-household-button').props.accessibilityState?.disabled).toBe(false),
    );
  });

  it('invalid invite code (404) shows the error helper and keeps Join disabled', async () => {
    get.mockRejectedValueOnce({ response: { status: 404 } });
    const utils = renderScreen();

    const input = utils.getByTestId('join-invite-code');
    fireEvent.changeText(input, 'BADCODE1');
    await act(async () => {
      fireEvent(input, 'blur');
    });

    await utils.findByText('Invalid or expired invite code');
    expect(utils.getByTestId('join-household-button').props.accessibilityState?.disabled).toBe(true);
  });

  it('Join button → POST /households/join + fetchHouseholds + "Joined!" Alert', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    get.mockResolvedValueOnce({ data: { valid: true, household_name: 'Beach House' } });
    post.mockResolvedValueOnce({ data: {} });
    const utils = renderScreen();

    const input = utils.getByTestId('join-invite-code');
    fireEvent.changeText(input, 'ABCD1234');
    await act(async () => {
      fireEvent(input, 'blur');
    });
    await utils.findByText("You'll join: Beach House");

    await act(async () => {
      fireEvent.press(utils.getByTestId('join-household-button'));
    });

    expect(post).toHaveBeenCalledWith(
      '/households/join',
      { invite_code: 'ABCD1234' },
      AUTH_HEADERS,
    );
    expect(mockFetchHouseholds).toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Joined!', 'You have joined the household.');
    alertSpy.mockRestore();
  });

  it('create household → POST /households + fetchHouseholds + "Created!" Alert', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    post.mockResolvedValueOnce({ data: {} });
    const utils = renderScreen();

    fireEvent.changeText(utils.getByTestId('create-household-name'), 'Lake House');
    await act(async () => {
      fireEvent.press(utils.getByText('Create'));
    });

    expect(post).toHaveBeenCalledWith(
      '/households',
      { name: 'Lake House' },
      AUTH_HEADERS,
    );
    expect(mockFetchHouseholds).toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Created!', 'Household "Lake House" has been created.');
    alertSpy.mockRestore();
  });

  it('create household failure surfaces the server detail via Alert', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    post.mockRejectedValueOnce({ response: { data: { detail: 'Name already taken' } } });
    const utils = renderScreen();

    fireEvent.changeText(utils.getByTestId('create-household-name'), 'Home');
    await act(async () => {
      fireEvent.press(utils.getByText('Create'));
    });

    expect(post).toHaveBeenCalledWith('/households', { name: 'Home' }, AUTH_HEADERS);
    expect(mockFetchHouseholds).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Error', 'Name already taken');
    alertSpy.mockRestore();
  });

  it('delete account: gated until password + "DELETE", then calls deleteAccount(password)', async () => {
    mockDeleteAccount.mockResolvedValueOnce(undefined);
    const utils = renderScreen();

    // open the dialog
    fireEvent.press(utils.getByTestId('delete-account-button'));
    const confirmBtn = await utils.findByTestId('delete-account-confirm-button');

    // gate: disabled with no password / wrong confirm text
    expect(confirmBtn.props.accessibilityState?.disabled).toBe(true);

    fireEvent.changeText(utils.getByTestId('delete-account-password'), 'hunter2');
    fireEvent.changeText(utils.getByTestId('delete-account-confirm'), 'WRONG');
    await waitFor(() =>
      expect(confirmBtn.props.accessibilityState?.disabled).toBe(true),
    );

    fireEvent.changeText(utils.getByTestId('delete-account-confirm'), 'DELETE');
    await waitFor(() =>
      expect(confirmBtn.props.accessibilityState?.disabled).toBe(false),
    );

    await act(async () => {
      fireEvent.press(confirmBtn);
    });

    expect(mockDeleteAccount).toHaveBeenCalledWith('hunter2');
  });

  it('delete account error surfaces the message and re-enables the form', async () => {
    mockDeleteAccount.mockRejectedValueOnce(new Error('Incorrect password'));
    const utils = renderScreen();

    fireEvent.press(utils.getByTestId('delete-account-button'));
    await utils.findByTestId('delete-account-confirm-button');

    fireEvent.changeText(utils.getByTestId('delete-account-password'), 'wrongpass');
    fireEvent.changeText(utils.getByTestId('delete-account-confirm'), 'DELETE');
    await act(async () => {
      fireEvent.press(utils.getByTestId('delete-account-confirm-button'));
    });

    expect(mockDeleteAccount).toHaveBeenCalledWith('wrongpass');
    await utils.findByText('Incorrect password');
  });

  it('external-devices Switch → updateSmartHomeConfig(hh, {use_external_devices}); reverts + Alerts on failure', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    updateSH.mockRejectedValueOnce(new Error('network'));
    const utils = renderScreen();

    const toggle = await utils.findByTestId('use-external-devices-toggle');
    expect(toggle.props.value).toBe(false);

    await act(async () => {
      fireEvent(toggle, 'valueChange', true);
    });

    expect(updateSH).toHaveBeenCalledWith('hh-1', { use_external_devices: true });
    expect(alertSpy).toHaveBeenCalledWith('Error', 'Could not update device management setting.');
    // optimistic flip reverted back to false
    await waitFor(() => expect(toggle.props.value).toBe(false));
    alertSpy.mockRestore();
  });

  it('primary-node radio → updateSmartHomeConfig(hh, {primary_node_id}) for the tapped node', async () => {
    updateSH.mockResolvedValueOnce({ ...SMART_HOME, primary_node_id: 'node-2' });
    const utils = renderScreen();

    // node-2 is rendered with its room label once smart-home config loads
    const node2 = await utils.findByText('Office (node-2…)');

    await act(async () => {
      fireEvent.press(node2);
    });

    expect(updateSH).toHaveBeenCalledWith('hh-1', { primary_node_id: 'node-2' });
  });
});
