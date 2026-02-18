import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import LandingScreen from '../../src/screens/Auth/LandingScreen';
import { lightTheme } from '../../src/theme';

const mockNavigate = jest.fn();

const mockNavigation = {
  navigate: mockNavigate,
} as any;

const mockToggleTheme = jest.fn();

jest.mock('../../src/contexts/ConfigContext', () => ({
  useConfig: () => ({
    fallbackMessage: null,
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
  });

  it('should render app title', () => {
    const { getByText } = render(
      <LandingScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByText('Jarvis Node')).toBeTruthy();
  });

  it('should render subtitle', () => {
    const { getByText } = render(
      <LandingScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByText('Provision and manage your Jarvis voice nodes')).toBeTruthy();
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
});

