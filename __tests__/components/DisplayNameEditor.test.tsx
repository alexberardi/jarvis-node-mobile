import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import DisplayNameEditor from '../../src/components/DisplayNameEditor';
import { lightTheme } from '../../src/theme';

const mockUpdateUser = jest.fn();
const mockUpdateMyDisplayName = jest.fn();
let mockUser: Record<string, unknown> = {};

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({
    state: { user: mockUser, accessToken: 'tok' },
    updateUser: mockUpdateUser,
  }),
}));

jest.mock('../../src/api/accountApi', () => ({
  updateMyDisplayName: (...args: unknown[]) => mockUpdateMyDisplayName(...args),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

describe('DisplayNameEditor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 1, email: 'jordan@example.com', username: 'jordan' };
  });

  it('falls back to the username when no display name is set', () => {
    const { getByTestId, getByText } = render(<DisplayNameEditor />, { wrapper });
    expect(getByTestId('account-display-name')).toHaveTextContent('jordan');
    expect(getByText('jordan@example.com')).toBeTruthy();
  });

  it('shows the display name with the username as secondary text', () => {
    mockUser = { ...mockUser, display_name: 'Jordan Avery' };
    const { getByTestId, getByText } = render(<DisplayNameEditor />, { wrapper });
    expect(getByTestId('account-display-name')).toHaveTextContent('Jordan Avery');
    expect(getByText('jordan · jordan@example.com')).toBeTruthy();
    expect(getByTestId('display-name-input').props.value).toBe('Jordan Avery');
  });

  it('saves a new name and stores the server-confirmed value', async () => {
    mockUpdateMyDisplayName.mockResolvedValue({ id: 1, email: 'x', display_name: 'Jordan A' });
    const { getByTestId } = render(<DisplayNameEditor />, { wrapper });

    fireEvent.changeText(getByTestId('display-name-input'), 'Jordan A');
    fireEvent.press(getByTestId('display-name-save'));

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith({ display_name: 'Jordan A' }));
    expect(mockUpdateMyDisplayName).toHaveBeenCalledWith('Jordan A', 'tok');
  });

  it('shows the error and keeps the old name when saving fails', async () => {
    mockUpdateMyDisplayName.mockRejectedValue(new Error('bad name'));
    const { getByTestId, findByText } = render(<DisplayNameEditor />, { wrapper });

    fireEvent.changeText(getByTestId('display-name-input'), 'x');
    fireEvent.press(getByTestId('display-name-save'));

    expect(await findByText('bad name')).toBeTruthy();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});
