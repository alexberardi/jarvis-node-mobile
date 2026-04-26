import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import SettingsScreen from '../../src/screens/Settings/SettingsScreen';
import { lightTheme } from '../../src/theme';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
}));

const mockLogout = jest.fn();
const mockSwitchHousehold = jest.fn();
const mockFetchHouseholds = jest.fn();

let mockAuthState = {
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

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({
    state: mockAuthState,
    logout: mockLogout,
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
    get: jest.fn().mockResolvedValue({ data: [] }),
    post: jest.fn().mockResolvedValue({ data: {} }),
    patch: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
  },
}));

jest.mock('../../src/api/smartHomeApi', () => ({
  getSmartHomeConfig: jest.fn().mockResolvedValue({
    device_manager: 'jarvis_direct',
    primary_node_id: 'node-1',
    nodes: [],
  }),
  updateSmartHomeConfig: jest.fn().mockResolvedValue({
    device_manager: 'jarvis_direct',
    primary_node_id: 'node-1',
  }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <PaperProvider theme={lightTheme}>{children}</PaperProvider>
    </QueryClientProvider>
  );
};

describe('SettingsScreen', () => {
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
  });

  it('should render user email/username', () => {
    const { getByText } = render(<SettingsScreen />, { wrapper });

    // Username takes priority over email in the display
    expect(getByText('alex')).toBeTruthy();
  });

  it('should render user email when no username', () => {
    mockAuthState = {
      ...mockAuthState,
      user: { id: 1, email: 'alex@example.com', username: '' },
    };

    const { getByText } = render(<SettingsScreen />, { wrapper });

    expect(getByText('alex@example.com')).toBeTruthy();
  });

  it('should render Account section', () => {
    const { getByText } = render(<SettingsScreen />, { wrapper });

    expect(getByText('Account')).toBeTruthy();
  });

  it('should render Log Out button', () => {
    const { getByText } = render(<SettingsScreen />, { wrapper });

    const logoutButton = getByText('Log Out');
    expect(logoutButton).toBeTruthy();

    fireEvent.press(logoutButton);
    expect(mockLogout).toHaveBeenCalled();
  });

  it('should render Household section', () => {
    const { getByText } = render(<SettingsScreen />, { wrapper });

    expect(getByText('Household')).toBeTruthy();
  });

  it('should render household names', () => {
    const { getByTestId } = render(<SettingsScreen />, { wrapper });

    expect(getByTestId('household-name-hh-1')).toBeTruthy();
    expect(getByTestId('household-name-hh-2')).toBeTruthy();
  });

  it('should show theme buttons (Light/Dark/System)', () => {
    const { getByText } = render(<SettingsScreen />, { wrapper });

    expect(getByText('Appearance')).toBeTruthy();
    expect(getByText('Light')).toBeTruthy();
    expect(getByText('Dark')).toBeTruthy();
    expect(getByText('System')).toBeTruthy();
  });

  it('should show auto-play TTS switch', () => {
    const { getByText } = render(<SettingsScreen />, { wrapper });

    expect(getByText('Chat')).toBeTruthy();
    expect(getByText('Auto-play responses')).toBeTruthy();
    expect(
      getByText('Automatically speak Jarvis responses aloud'),
    ).toBeTruthy();
  });

  it('should show Connection section with status', () => {
    const { getByText } = render(<SettingsScreen />, { wrapper });

    expect(getByText('Connection')).toBeTruthy();
    expect(getByText('Status:')).toBeTruthy();
    expect(getByText('Local')).toBeTruthy();
  });

  it('should show Cloud when isUsingCloud', () => {
    // Override the mock for this test
    const useConfigModule = require('../../src/contexts/ConfigContext');
    const originalUseConfig = useConfigModule.useConfig;
    useConfigModule.useConfig = () => ({
      config: {
        configServiceUrl: 'https://cloud.jarvis.io',
        authBaseUrl: null,
        commandCenterUrl: null,
      },
      isUsingCloud: true,
      manualUrl: null,
      rediscover: mockRediscover,
      setManualUrl: mockSetManualUrl,
    });

    const { getByText } = render(<SettingsScreen />, { wrapper });

    expect(getByText('Cloud')).toBeTruthy();

    // Restore
    useConfigModule.useConfig = originalUseConfig;
  });

  it('should show service URLs in connection section', () => {
    const { getByText } = render(<SettingsScreen />, { wrapper });

    expect(getByText(/Config:.*192\.168\.1\.100:7700/)).toBeTruthy();
    expect(getByText(/Auth:.*192\.168\.1\.100:7701/)).toBeTruthy();
    expect(getByText(/Command Center:.*192\.168\.1\.100:7703/)).toBeTruthy();
  });

  it('should show Re-discover Services button', () => {
    const { getByText } = render(<SettingsScreen />, { wrapper });

    const rediscoverBtn = getByText('Re-discover Services');
    expect(rediscoverBtn).toBeTruthy();
  });

  it('should render Settings header', () => {
    const { getByText } = render(<SettingsScreen />, { wrapper });

    expect(getByText('Settings')).toBeTruthy();
  });

  it('should show close button', () => {
    const { getByTestId } = render(<SettingsScreen />, { wrapper });

    const closeButton = getByTestId('settings-close');
    expect(closeButton).toBeTruthy();

    fireEvent.press(closeButton);
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('should show version text', () => {
    const { getByText } = render(<SettingsScreen />, { wrapper });

    expect(getByText(/Jarvis Mobile v/)).toBeTruthy();
  });

  it('should show Join Another Household section', () => {
    const { getByText, getByTestId } = render(<SettingsScreen />, { wrapper });

    expect(getByText('Join Another Household')).toBeTruthy();
    expect(getByTestId('join-invite-code')).toBeTruthy();
  });
});
