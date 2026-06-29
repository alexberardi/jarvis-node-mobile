import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import LoginScreen from '../../src/screens/Auth/LoginScreen';
import { lightTheme } from '../../src/theme';

const mockLogin = jest.fn();
const mockUnlock = jest.fn();
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

// Mutable so individual tests can flip biometric capability/enrollment. Names
// are mock-prefixed so the jest.mock factory may close over them.
let mockBiometricAvailable = false;
let mockBiometricEnabled = false;

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    unlockWithBiometrics: mockUnlock,
    get biometricAvailable() {
      return mockBiometricAvailable;
    },
    get state() {
      return { biometricEnabled: mockBiometricEnabled };
    },
  }),
}));

const mockNavigation = {
  navigate: mockNavigate,
  goBack: mockGoBack,
} as any;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBiometricAvailable = false;
    mockBiometricEnabled = false;
  });

  it('should render the Log In header and button', () => {
    const { getAllByText } = render(
      <LoginScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    // "Log In" appears in both the header and the button
    expect(getAllByText('Log In').length).toBeGreaterThanOrEqual(1);
  });

  it('should have link to register', () => {
    const { getByText } = render(
      <LoginScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    const registerLink = getByText('Need an account? Create one');
    expect(registerLink).toBeTruthy();

    fireEvent.press(registerLink);
    expect(mockNavigate).toHaveBeenCalledWith('Register');
  });

  it('should call login when form is submitted', async () => {
    mockLogin.mockResolvedValue(undefined);

    const { getAllByText } = render(
      <LoginScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    // React Native Paper TextInput renders label text - get all "Email" texts and use the one in the input
    const emailInputs = getAllByText('Email');
    fireEvent.changeText(emailInputs[emailInputs.length - 1], 'user@example.com');

    const passwordInputs = getAllByText('Password');
    fireEvent.changeText(passwordInputs[passwordInputs.length - 1], 'password123');

    // Press the "Log In" button (the contained button, not the header)
    const logInElements = getAllByText('Log In');
    fireEvent.press(logInElements[logInElements.length - 1]);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('user@example.com', 'password123');
    });
  });

  it('should display error on login failure', async () => {
    mockLogin.mockRejectedValue({
      response: { data: { detail: 'Invalid email or password' } },
    });

    const { getAllByText, getByText } = render(
      <LoginScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    const emailInputs = getAllByText('Email');
    fireEvent.changeText(emailInputs[emailInputs.length - 1], 'bad@email.com');

    const passwordInputs = getAllByText('Password');
    fireEvent.changeText(passwordInputs[passwordInputs.length - 1], 'wrong');

    const logInElements = getAllByText('Log In');
    fireEvent.press(logInElements[logInElements.length - 1]);

    await waitFor(() => {
      expect(getByText('Invalid email or password')).toBeTruthy();
    });
  });

  it('should navigate back when back button pressed', () => {
    const { getByLabelText } = render(
      <LoginScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    const backButton = getByLabelText('Back');
    fireEvent.press(backButton);

    expect(mockGoBack).toHaveBeenCalled();
  });

  describe('biometric login', () => {
    it('hides the enroll checkbox and unlock button when biometrics are unavailable', () => {
      const { queryByTestId } = render(
        <LoginScreen navigation={mockNavigation} route={{} as any} />,
        { wrapper }
      );
      expect(queryByTestId('biometric-enroll-checkbox')).toBeNull();
      expect(queryByTestId('biometric-unlock-button')).toBeNull();
    });

    it('shows the enroll checkbox and passes the opt-in to login when checked', async () => {
      mockBiometricAvailable = true;
      mockBiometricEnabled = false;
      mockLogin.mockResolvedValue(undefined);

      const { getByTestId, getAllByText } = render(
        <LoginScreen navigation={mockNavigation} route={{} as any} />,
        { wrapper }
      );

      // Opt in via the checkbox.
      fireEvent.press(getByTestId('biometric-enroll-checkbox'));

      const emailInputs = getAllByText('Email');
      fireEvent.changeText(emailInputs[emailInputs.length - 1], 'user@example.com');
      const passwordInputs = getAllByText('Password');
      fireEvent.changeText(passwordInputs[passwordInputs.length - 1], 'password123');

      const logInElements = getAllByText('Log In');
      fireEvent.press(logInElements[logInElements.length - 1]);

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith('user@example.com', 'password123', {
          enableBiometric: true,
        });
      });
    });

    it('shows the unlock button (not the checkbox) once enrolled, and calls unlockWithBiometrics', async () => {
      mockBiometricAvailable = true;
      mockBiometricEnabled = true;
      mockUnlock.mockResolvedValue(true);

      const { getByTestId, queryByTestId } = render(
        <LoginScreen navigation={mockNavigation} route={{} as any} />,
        { wrapper }
      );

      expect(queryByTestId('biometric-enroll-checkbox')).toBeNull();
      fireEvent.press(getByTestId('biometric-unlock-button'));

      await waitFor(() => {
        expect(mockUnlock).toHaveBeenCalled();
      });
    });
  });
});
