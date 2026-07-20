import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import PhonebookListScreen from '../../src/screens/Phonebook/PhonebookListScreen';
import { lightTheme } from '../../src/theme';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = require('react');
    useEffect(() => {
      cb();
    }, []);
  },
}));

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: any) => <View>{children}</View>,
  };
});

jest.mock('react-native-reanimated', () => ({ __esModule: true, default: {} }));

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({
    state: {
      isAuthenticated: true,
      accessToken: 'mock-token',
      activeHouseholdId: 'household-1',
      households: [{ id: 'household-1', name: 'Home', role: 'admin' }],
      user: { id: 1, email: 'test@test.com' },
    },
    logout: jest.fn(),
  }),
}));

const mockList = jest.fn();
const mockDelete = jest.fn();

jest.mock('../../src/api/phoneContactsApi', () => ({
  listPhoneContacts: (...args: any[]) => mockList(...args),
  deletePhoneContact: (...args: any[]) => mockDelete(...args),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

const contact = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  name: "Tony's Pizzeria",
  number: '+15551234567',
  address: '12 Main St',
  source: 'call',
  line_type: 'landline',
  do_not_call: false,
  notes: null,
  verified_at: null,
  created_at: '2026-07-20T00:00:00Z',
  ...over,
});

describe('PhonebookListScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads the active household phonebook', async () => {
    mockList.mockResolvedValueOnce([contact()]);
    const { getByText } = render(<PhonebookListScreen />, { wrapper });
    await waitFor(() => {
      expect(getByText("Tony's Pizzeria")).toBeTruthy();
    });
    expect(mockList).toHaveBeenCalledWith('household-1');
  });

  it('shows the number formatted for reading, not raw E.164', async () => {
    mockList.mockResolvedValueOnce([contact()]);
    const { getByText } = render(<PhonebookListScreen />, { wrapper });
    await waitFor(() => {
      expect(getByText('(555) 123-4567')).toBeTruthy();
    });
  });

  it('badges how the contact was added', async () => {
    mockList.mockResolvedValueOnce([
      contact({ id: 'c1', source: 'call' }),
      contact({ id: 'c2', name: 'Web Salon', source: 'web' }),
      contact({ id: 'c3', name: 'Manual Deli', source: 'manual' }),
    ]);
    const { getByText } = render(<PhonebookListScreen />, { wrapper });
    await waitFor(() => {
      expect(getByText('saved from a call')).toBeTruthy();
    });
    expect(getByText('found by search')).toBeTruthy();
    expect(getByText('added by you')).toBeTruthy();
  });

  it('makes do-not-call visible in the list, not just the detail view', async () => {
    mockList.mockResolvedValueOnce([contact({ do_not_call: true })]);
    const { getByTestId } = render(<PhonebookListScreen />, { wrapper });
    await waitFor(() => {
      expect(getByTestId('phone-contact-dnc-c1')).toBeTruthy();
    });
  });

  it('explains the empty state, including auto-save after calls', async () => {
    mockList.mockResolvedValueOnce([]);
    const { getByText } = render(<PhonebookListScreen />, { wrapper });
    await waitFor(() => {
      expect(getByText('No businesses saved yet')).toBeTruthy();
    });
    expect(
      getByText(/saved here automatically after Jarvis calls them/i),
    ).toBeTruthy();
  });

  it('surfaces a load failure with a retry', async () => {
    mockList.mockRejectedValueOnce(new Error('boom'));
    const { getByText } = render(<PhonebookListScreen />, { wrapper });
    await waitFor(() => {
      expect(getByText('Could not load the phonebook')).toBeTruthy();
    });
    expect(getByText('Retry')).toBeTruthy();
  });

  it('navigates to the add form from the FAB', async () => {
    mockList.mockResolvedValueOnce([]);
    const { getByTestId } = render(<PhonebookListScreen />, { wrapper });
    await waitFor(() => expect(getByTestId('phone-contact-add-fab')).toBeTruthy());
    const { fireEvent } = require('@testing-library/react-native');
    fireEvent.press(getByTestId('phone-contact-add-fab'));
    expect(mockNavigate).toHaveBeenCalledWith('PhonebookEdit', {});
  });

  it('opens a contact for editing when its card is tapped', async () => {
    mockList.mockResolvedValueOnce([contact()]);
    const { getByTestId } = render(<PhonebookListScreen />, { wrapper });
    await waitFor(() => expect(getByTestId('phone-contact-card-c1')).toBeTruthy());
    const { fireEvent } = require('@testing-library/react-native');
    fireEvent.press(getByTestId('phone-contact-card-c1'));
    expect(mockNavigate).toHaveBeenCalledWith('PhonebookEdit', { contactId: 'c1' });
  });
});
