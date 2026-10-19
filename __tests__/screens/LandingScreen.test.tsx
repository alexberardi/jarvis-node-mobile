import React from 'react';
import { act, render, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { PaperProvider } from 'react-native-paper';

import LandingScreen from '../../src/screens/Auth/LandingScreen';
import { lightTheme } from '../../src/theme';

const mockNavigate = jest.fn();

const mockNavigation = {
  navigate: mockNavigate,
} as any;

const mockToggleTheme = jest.fn();

jest.spyOn(Alert, 'alert');

// Set when the app signed the user out on its own (e.g. a password reset).
let mockSignOutNotice: string | null = null;

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({
    get state() {
      return { signOutNotice: mockSignOutNotice };
    },
  }),
}));

// The server URL state, set per test. Most tests run with a URL set, so the
// Log In and Create Account buttons navigate.
const SERVER = 'http://192.168.1.100:7700';
let mockManualUrl: string | null = SERVER;
let mockConfigServiceUrl: string | null = SERVER;
let mockFallbackMessage: string | null = null;
const mockSetManualUrl = jest.fn().mockResolvedValue(undefined);

jest.mock('../../src/contexts/ConfigContext', () => ({
  useConfig: () => ({
    fallbackMessage: mockFallbackMessage,
    config: { configServiceUrl: mockConfigServiceUrl },
    manualUrl: mockManualUrl,
    setManualUrl: mockSetManualUrl,
    rediscover: jest.fn(),
  }),
}));

jest.mock('../../src/theme/ThemeProvider', () => ({
  useThemePreference: () => ({
    isDark: false,
    toggleTheme: mockToggleTheme,
  }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

describe('LandingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignOutNotice = null;
    mockManualUrl = SERVER;
    mockConfigServiceUrl = SERVER;
    mockFallbackMessage = null;
  });

  it('stays on Landing after an ordinary sign-out', () => {
    render(<LandingScreen navigation={mockNavigation} route={{} as any} />, { wrapper });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('goes straight to Login (once) after an app-initiated sign-out', () => {
    mockSignOutNotice = 'Your password was reset. Sign in to set a new one.';

    const { rerender } = render(
      <LandingScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper },
    );
    rerender(<LandingScreen navigation={mockNavigation} route={{} as any} />);

    // Once per notice, so backing out of Login to Landing isn't bounced again.
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('Login');
  });

  it('gives Log In the testID the Maestro login subflow taps', () => {
    const { getByTestId } = render(
      <LandingScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    fireEvent.press(getByTestId('landing-login-button'));

    expect(mockNavigate).toHaveBeenCalledWith('Login');
  });

  it('should render app title', () => {
    const { getByText } = render(
      <LandingScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByText('Jarvis')).toBeTruthy();
  });

  it('should render subtitle', () => {
    const { getByText } = render(
      <LandingScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByText('Your home, your voice, fully private.')).toBeTruthy();
  });

  it('should render login and create account buttons', () => {
    const { getByText } = render(
      <LandingScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByText('Log In')).toBeTruthy();
    expect(getByText('Create Account')).toBeTruthy();
  });

  it('should navigate to Login on login press', () => {
    const { getByText } = render(
      <LandingScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    fireEvent.press(getByText('Log In'));

    expect(mockNavigate).toHaveBeenCalledWith('Login');
  });

  it('should navigate to Register on create account press', () => {
    const { getByText } = render(
      <LandingScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    fireEvent.press(getByText('Create Account'));

    expect(mockNavigate).toHaveBeenCalledWith('Register');
  });

  it('should render theme toggle button', () => {
    const { getByLabelText } = render(
      <LandingScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    const toggle = getByLabelText('Toggle dark mode');
    expect(toggle).toBeTruthy();

    fireEvent.press(toggle);
    expect(mockToggleTheme).toHaveBeenCalled();
  });

  describe('server URL', () => {
    const renderLanding = () =>
      render(<LandingScreen navigation={mockNavigation} route={{} as any} />, { wrapper });

    it('has a single server URL control and no network discovery', () => {
      const { getAllByTestId, queryByLabelText, queryByText, getByText } = renderLanding();

      expect(getAllByTestId('server-url-button')).toHaveLength(1);
      expect(getByText(SERVER)).toBeTruthy();
      // The old top-bar icon and the LAN scan button are gone.
      expect(queryByLabelText('Set server URL')).toBeNull();
      expect(queryByText('Find Local Server')).toBeNull();
    });

    it('shows a "Set Server URL" button when no URL is set', () => {
      mockManualUrl = null;
      mockConfigServiceUrl = null;
      const { getAllByTestId, getByText, queryByText } = renderLanding();

      expect(getAllByTestId('server-url-button')).toHaveLength(1);
      expect(getByText('Set Server URL')).toBeTruthy();
      expect(queryByText('Find Local Server')).toBeNull();
    });

    it.each(['Log In', 'Create Account'])(
      'blocks %s with a warning when no URL is set',
      (label) => {
        mockManualUrl = null;
        mockConfigServiceUrl = null;
        const { getByText, queryByText } = renderLanding();

        expect(queryByText('Enter your server URL first.')).toBeNull();
        fireEvent.press(getByText(label));

        expect(mockNavigate).not.toHaveBeenCalled();
        expect(getByText('Enter your server URL first.')).toBeTruthy();
      },
    );

    it('opens the dialog pre-filled with the shown URL and saves the trimmed value', async () => {
      // A URL shown without being pinned (the DEV_MODE baked URL) still seeds the dialog.
      mockManualUrl = null;
      const { getByTestId, getByDisplayValue, getByText, queryByText } = renderLanding();

      fireEvent.press(getByTestId('server-url-button'));

      expect(queryByText(/auto-discover/i)).toBeNull();
      const input = getByDisplayValue(SERVER);
      fireEvent.changeText(input, '  https://jarvis.example.com/  ');
      await act(async () => {
        fireEvent.press(getByText('Save'));
      });

      expect(mockSetManualUrl).toHaveBeenCalledWith('https://jarvis.example.com');
    });

    it('rejects a URL without http:// or https://', async () => {
      const { getByTestId, getByDisplayValue, getByText } = renderLanding();

      fireEvent.press(getByTestId('server-url-button'));
      fireEvent.changeText(getByDisplayValue(SERVER), '192.168.1.5:7700');
      await act(async () => {
        fireEvent.press(getByText('Save'));
      });

      expect(mockSetManualUrl).not.toHaveBeenCalled();
      expect(Alert.alert).toHaveBeenCalledWith(
        'Invalid URL',
        'URL must start with http:// or https://',
      );
    });

    it('shows the unreachable warning', () => {
      mockFallbackMessage = `Can't reach the server at ${SERVER}. Check the URL or your connection.`;
      const { getByText } = renderLanding();

      expect(getByText(/Can't reach the server/)).toBeTruthy();
    });
  });
});
