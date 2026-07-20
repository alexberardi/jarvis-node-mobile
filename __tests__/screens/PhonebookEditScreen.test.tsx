import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import PhonebookEditScreen from '../../src/screens/Phonebook/PhonebookEditScreen';
import { lightTheme } from '../../src/theme';

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

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockList = jest.fn();
const mockDelete = jest.fn();

jest.mock('../../src/api/phoneContactsApi', () => {
  const actual = jest.requireActual('../../src/api/phoneContactsApi');
  return {
    ...actual,
    createPhoneContact: (...a: any[]) => mockCreate(...a),
    updatePhoneContact: (...a: any[]) => mockUpdate(...a),
    listPhoneContacts: (...a: any[]) => mockList(...a),
    deletePhoneContact: (...a: any[]) => mockDelete(...a),
  };
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

const navigation = { goBack: jest.fn(), navigate: jest.fn() } as any;

const renderNew = () =>
  render(<PhonebookEditScreen navigation={navigation} route={{ params: {} } as any} />, {
    wrapper,
  });

const contact = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  name: "Tony's Pizzeria",
  number: '+15551234567',
  address: '12 Main St',
  source: 'call',
  line_type: 'landline',
  do_not_call: false,
  notes: 'ask for Maria',
  verified_at: null,
  created_at: '2026-07-20T00:00:00Z',
  ...over,
});

describe('PhonebookEditScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('adding', () => {
    it('creates a contact from the form', async () => {
      mockCreate.mockResolvedValueOnce(contact());
      const { getByTestId } = renderNew();

      fireEvent.changeText(getByTestId('phone-contact-name-input'), "Tony's Pizzeria");
      fireEvent.changeText(getByTestId('phone-contact-number-input'), '+15551234567');
      fireEvent.changeText(getByTestId('phone-contact-address-input'), '12 Main St');
      fireEvent.press(getByTestId('phone-contact-save-button'));

      await waitFor(() => {
        expect(mockCreate).toHaveBeenCalledWith('household-1', {
          name: "Tony's Pizzeria",
          number: '+15551234567',
          address: '12 Main St',
          notes: undefined,
        });
      });
      expect(navigation.goBack).toHaveBeenCalled();
    });

    it('shows the server 400 message inline on the number field', async () => {
      mockCreate.mockRejectedValueOnce({
        response: { status: 400, data: { detail: 'Emergency numbers cannot be called' } },
      });
      const { getByTestId } = renderNew();

      fireEvent.changeText(getByTestId('phone-contact-name-input'), 'Fire Dept');
      fireEvent.changeText(getByTestId('phone-contact-number-input'), '911');
      fireEvent.press(getByTestId('phone-contact-save-button'));

      await waitFor(() => {
        expect(getByTestId('phone-contact-number-error')).toBeTruthy();
      });
      expect(getByTestId('phone-contact-number-error').props.children).toBe(
        'Emergency numbers cannot be called',
      );
      // The form stays open so the user can correct the number.
      expect(navigation.goBack).not.toHaveBeenCalled();
    });

    it('clears the number error once the user edits the field', async () => {
      mockCreate.mockRejectedValueOnce({
        response: { status: 400, data: { detail: 'invalid number' } },
      });
      const { getByTestId, queryByTestId } = renderNew();

      fireEvent.changeText(getByTestId('phone-contact-name-input'), 'X');
      fireEvent.changeText(getByTestId('phone-contact-number-input'), '911');
      fireEvent.press(getByTestId('phone-contact-save-button'));
      await waitFor(() => expect(getByTestId('phone-contact-number-error')).toBeTruthy());

      fireEvent.changeText(getByTestId('phone-contact-number-input'), '+15551234567');
      expect(queryByTestId('phone-contact-number-error')).toBeNull();
    });

    it('uses a phone keypad for the number field', () => {
      const { getByTestId } = renderNew();
      expect(getByTestId('phone-contact-number-input').props.keyboardType).toBe(
        'phone-pad',
      );
    });

    it('hides the do-not-call toggle until the contact exists', () => {
      const { queryByTestId } = renderNew();
      expect(queryByTestId('phone-contact-dnc-switch')).toBeNull();
    });
  });

  describe('editing', () => {
    const renderExisting = () =>
      render(
        <PhonebookEditScreen
          navigation={navigation}
          route={{ params: { contactId: 'c1' } } as any}
        />,
        { wrapper },
      );

    it('loads the existing contact into the form', async () => {
      mockList.mockResolvedValueOnce([contact()]);
      const { getByTestId } = renderExisting();
      await waitFor(() => {
        expect(getByTestId('phone-contact-name-input').props.value).toBe(
          "Tony's Pizzeria",
        );
      });
      expect(getByTestId('phone-contact-notes-input').props.value).toBe('ask for Maria');
    });

    it('sends the do-not-call flag on update', async () => {
      mockList.mockResolvedValueOnce([contact()]);
      mockUpdate.mockResolvedValueOnce(contact({ do_not_call: true }));
      const { getByTestId } = renderExisting();

      await waitFor(() => expect(getByTestId('phone-contact-dnc-switch')).toBeTruthy());
      fireEvent(getByTestId('phone-contact-dnc-switch'), 'valueChange', true);
      fireEvent.press(getByTestId('phone-contact-save-button'));

      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledWith(
          'household-1',
          'c1',
          expect.objectContaining({ do_not_call: true }),
        );
      });
    });

    it('reflects an already-blocked contact', async () => {
      mockList.mockResolvedValueOnce([contact({ do_not_call: true })]);
      const { getByTestId } = renderExisting();
      await waitFor(() => {
        expect(getByTestId('phone-contact-dnc-switch').props.value).toBe(true);
      });
    });
  });
});
