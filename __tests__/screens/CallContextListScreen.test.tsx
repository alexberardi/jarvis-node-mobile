import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import CallContextListScreen from '../../src/screens/CallContext/CallContextListScreen';
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
  // Render the right-swipe actions too, so the delete button is in the tree.
  return {
    __esModule: true,
    default: ({ children, renderRightActions }: any) => (
      <View>
        {children}
        {renderRightActions ? renderRightActions({ value: 0 }, { value: 0 }) : null}
      </View>
    ),
  };
});

jest.mock('react-native-reanimated', () => ({ __esModule: true, default: {} }));

const mockGet = jest.fn();
const mockPut = jest.fn();

jest.mock('../../src/api/callContextApi', () => {
  const actual = jest.requireActual('../../src/api/callContextApi');
  return {
    ...actual,
    getCallContext: (...a: any[]) => mockGet(...a),
    putCallContext: (...a: any[]) => mockPut(...a),
  };
});

const CATALOG = {
  well_known: [],
  categories: [
    { value: 'general', label: 'General' },
    { value: 'medical', label: 'Medical' },
  ],
  tiers: [
    { value: 'state', label: 'May say freely' },
    { value: 'if_asked', label: 'Only if asked' },
  ],
};

const FIELDS = [
  { key: 'full_name', label: 'Full name', value: 'Alex B', category: 'general', tier: 'state' },
  {
    key: 'insurance_member_id',
    label: 'Insurance member ID',
    value: 'XZ-9912345',
    category: 'medical',
    tier: 'if_asked',
  },
];

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

const renderScreen = () => render(<CallContextListScreen />, { wrapper });

describe('CallContextListScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the stored fields with their category and tier', async () => {
    mockGet.mockResolvedValueOnce({ fields: FIELDS, catalog: CATALOG });
    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText('Full name')).toBeTruthy());
    expect(getByText('Insurance member ID')).toBeTruthy();
    expect(getByText('Medical')).toBeTruthy();
    expect(getByText('Only if asked')).toBeTruthy();
  });

  it('shows the empty state when nothing is stored', async () => {
    mockGet.mockResolvedValueOnce({ fields: [], catalog: CATALOG });
    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText('No details saved yet')).toBeTruthy());
  });

  it('shows a retry when the load fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('network'));
    const { getByText } = renderScreen();

    await waitFor(() =>
      expect(getByText('Could not load your call details')).toBeTruthy(),
    );
  });

  it('opens the editor with the tapped field and the whole list', async () => {
    mockGet.mockResolvedValueOnce({ fields: FIELDS, catalog: CATALOG });
    const { getByTestId } = renderScreen();

    await waitFor(() => getByTestId('call-context-card-1'));
    fireEvent.press(getByTestId('call-context-card-1'));

    expect(mockNavigate).toHaveBeenCalledWith('CallContextEdit', {
      fields: FIELDS,
      catalog: CATALOG,
      index: 1,
    });
  });

  it('opens the editor to add with no index', async () => {
    mockGet.mockResolvedValueOnce({ fields: FIELDS, catalog: CATALOG });
    const { getByTestId } = renderScreen();

    await waitFor(() => getByTestId('call-context-add-fab'));
    fireEvent.press(getByTestId('call-context-add-fab'));

    expect(mockNavigate).toHaveBeenCalledWith('CallContextEdit', {
      fields: FIELDS,
      catalog: CATALOG,
    });
  });

  it('deletes by persisting the remaining list and rendering the server echo', async () => {
    mockGet.mockResolvedValueOnce({ fields: FIELDS, catalog: CATALOG });
    // The server echoes the canonical result; the screen trusts it over the
    // optimistic local copy.
    mockPut.mockResolvedValueOnce({ fields: [FIELDS[0]], catalog: CATALOG });
    const { getByTestId, queryByText, getByText } = renderScreen();

    // Confirm the destructive Alert automatically.
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });

    await waitFor(() => getByTestId('call-context-delete-1'));
    fireEvent.press(getByTestId('call-context-delete-1'));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith([FIELDS[0]]),
    );
    await waitFor(() => expect(queryByText('Insurance member ID')).toBeNull());
    expect(getByText('Full name')).toBeTruthy();
  });
});
