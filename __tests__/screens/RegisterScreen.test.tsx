import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import RegisterScreen from '../../src/screens/Auth/RegisterScreen';
import { lightTheme } from '../../src/theme';

const mockRegister = jest.fn();
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({
    register: mockRegister,
  }),
}));

const mockNavigation = {
  navigate: mockNavigate,
  goBack: mockGoBack,
} as any;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

describe('RegisterScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render the Create Account header and button', () => {
    const { getAllByText } = render(
      <RegisterScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    // "Create Account" appears in both the header and the button
    expect(getAllByText('Create Account').length).toBeGreaterThanOrEqual(1);
  });

  it('should have link to login', () => {
    const { getByText } = render(
      <RegisterScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    const loginLink = getByText('Back to Log In');
    expect(loginLink).toBeTruthy();

    fireEvent.press(loginLink);
    expect(mockNavigate).toHaveBeenCalledWith('Login');
  });

  it('should call register on valid form submission', async () => {
    mockRegister.mockResolvedValue(undefined);

    const { getAllByText } = render(
      <RegisterScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    const emailInputs = getAllByText('Email');
    fireEvent.changeText(emailInputs[emailInputs.length - 1], 'new@example.com');

    const passwordInputs = getAllByText('Password');
    fireEvent.changeText(passwordInputs[passwordInputs.length - 1], 'Password1');

    const confirmInputs = getAllByText('Confirm Password');
    fireEvent.changeText(confirmInputs[confirmInputs.length - 1], 'Password1');

    const createButtons = getAllByText('Create Account');
    fireEvent.press(createButtons[createButtons.length - 1]);

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith('new@example.com', 'Password1');
    });
  });

  it('should display error on registration failure', async () => {
    mockRegister.mockRejectedValue({
      response: { data: { detail: 'Email already exists' } },
    });

    const { getAllByText, getByText } = render(
      <RegisterScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    const emailInputs = getAllByText('Email');
    fireEvent.changeText(emailInputs[emailInputs.length - 1], 'existing@example.com');

    const passwordInputs = getAllByText('Password');
    fireEvent.changeText(passwordInputs[passwordInputs.length - 1], 'Password1');

    const confirmInputs = getAllByText('Confirm Password');
    fireEvent.changeText(confirmInputs[confirmInputs.length - 1], 'Password1');

    const createButtons = getAllByText('Create Account');
    fireEvent.press(createButtons[createButtons.length - 1]);

    await waitFor(() => {
      expect(getByText('Email already exists')).toBeTruthy();
    });
  });

  it('should show password validation errors', () => {
    const { getAllByText, getByText } = render(
      <RegisterScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    const emailInputs = getAllByText('Email');
    fireEvent.changeText(emailInputs[emailInputs.length - 1], 'test@example.com');

    const passwordInputs = getAllByText('Password');
    fireEvent.changeText(passwordInputs[passwordInputs.length - 1], 'short');

    expect(getByText('Password must be at least 8 characters.')).toBeTruthy();
  });

  it('should show uppercase requirement error', () => {
    const { getAllByText, getByText } = render(
      <RegisterScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    const emailInputs = getAllByText('Email');
    fireEvent.changeText(emailInputs[emailInputs.length - 1], 'test@example.com');

    const passwordInputs = getAllByText('Password');
    fireEvent.changeText(passwordInputs[passwordInputs.length - 1], 'lowercase1');

    expect(getByText('Add at least one uppercase letter.')).toBeTruthy();
  });
});
