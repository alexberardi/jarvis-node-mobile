import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import SuccessScreen from '../../src/screens/Provisioning/SuccessScreen';
import { lightTheme } from '../../src/theme';

const mockReset = jest.fn();
const mockNavigation = { reset: mockReset } as any;

const mockResetContext = jest.fn();

jest.mock('../../src/contexts/ProvisioningContext', () => ({
  useProvisioningContext: () => ({
    provisioningResult: {
      success: true,
      node_id: 'jarvis-mock-1234',
      room_name: 'kitchen',
      message: 'Node provisioned successfully',
    },
    reset: mockResetContext,
  }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

describe('SuccessScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should display success message', () => {
    const { getByText } = render(
      <SuccessScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByText(/Success/i)).toBeTruthy();
  });

  it('should display node ID', () => {
    const { getByText } = render(
      <SuccessScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByText(/jarvis-mock-1234/)).toBeTruthy();
  });

  it('should display room name', () => {
    const { getByText } = render(
      <SuccessScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByText(/Kitchen/i)).toBeTruthy();
  });

  it('should have done button', () => {
    const { getByTestId } = render(
      <SuccessScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByTestId('done-button')).toBeTruthy();
  });

  it('should reset navigation on done', () => {
    const { getByTestId } = render(
      <SuccessScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    fireEvent.press(getByTestId('done-button'));

    expect(mockResetContext).toHaveBeenCalled();
    expect(mockReset).toHaveBeenCalled();
  });
});
