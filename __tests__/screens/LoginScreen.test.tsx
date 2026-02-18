import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import LoginScreen from '../../src/screens/Auth/LoginScreen';
import { lightTheme } from '../../src/theme';

const mockLogin = jest.fn();
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
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

    const { getAllByText, getByDisplayValue } = render(
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
});
