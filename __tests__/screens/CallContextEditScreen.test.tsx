import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import CallContextEditScreen from '../../src/screens/CallContext/CallContextEditScreen';
import { lightTheme } from '../../src/theme';

const mockPut = jest.fn();

jest.mock('../../src/api/callContextApi', () => {
  const actual = jest.requireActual('../../src/api/callContextApi');
  return {
    ...actual,
    putCallContext: (...a: any[]) => mockPut(...a),
  };
});

const CATALOG = {
  well_known: [
    { key: 'full_name', label: 'Full name', category: 'general', tier: 'state' },
    {
      key: 'insurance_member_id',
      label: 'Insurance member ID',
      category: 'medical',
      tier: 'if_asked',
    },
  ],
  categories: [
    { value: 'general', label: 'General' },
    { value: 'medical', label: 'Medical' },
  ],
  tiers: [
    { value: 'state', label: 'May say freely' },
    { value: 'if_asked', label: 'Only if asked' },
  ],
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

const navigation = { goBack: jest.fn(), navigate: jest.fn() } as any;

const renderScreen = (params: any) =>
  render(
    <CallContextEditScreen navigation={navigation} route={{ params } as any} />,
    { wrapper },
  );

describe('CallContextEditScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('adding', () => {
    it('appends a custom field and saves the whole list', async () => {
      mockPut.mockResolvedValueOnce({ fields: [], catalog: CATALOG });
      const existing = {
        key: 'full_name',
        label: 'Full name',
        value: 'Alex B',
        category: 'general',
        tier: 'state',
      };
      const { getByTestId } = renderScreen({ fields: [existing], catalog: CATALOG });

      fireEvent.changeText(getByTestId('call-context-label-input'), 'Gate code');
      fireEvent.changeText(getByTestId('call-context-value-input'), '4417');
      fireEvent.press(getByTestId('call-context-save-button'));

      await waitFor(() => {
        expect(mockPut).toHaveBeenCalledWith([
          existing,
          // No key — the server derives it. Defaults to the private tier.
          { label: 'Gate code', value: '4417', category: 'general', tier: 'if_asked' },
        ]);
      });
      expect(navigation.goBack).toHaveBeenCalled();
    });

    it('cannot save with a blank value', async () => {
      const { getByTestId } = renderScreen({ fields: [], catalog: CATALOG });
      fireEvent.changeText(getByTestId('call-context-label-input'), 'Gate code');
      // Value left blank — the save button stays disabled, so a press is inert.
      fireEvent.press(getByTestId('call-context-save-button'));

      expect(mockPut).not.toHaveBeenCalled();
    });

    it('rejects a name that duplicates an existing field', async () => {
      const existing = {
        key: 'full_name',
        label: 'Full name',
        value: 'Alex B',
        category: 'general',
        tier: 'state',
      };
      const { getByTestId } = renderScreen({ fields: [existing], catalog: CATALOG });

      fireEvent.changeText(getByTestId('call-context-label-input'), 'full name');
      fireEvent.changeText(getByTestId('call-context-value-input'), 'x');
      fireEvent.press(getByTestId('call-context-save-button'));

      await waitFor(() => {
        expect(getByTestId('call-context-label-error')).toBeTruthy();
      });
      expect(mockPut).not.toHaveBeenCalled();
    });

    it('carries the key when a well-known preset is chosen', async () => {
      mockPut.mockResolvedValueOnce({ fields: [], catalog: CATALOG });
      const { getByTestId, getByText } = renderScreen({
        fields: [],
        catalog: CATALOG,
      });

      fireEvent.press(getByTestId('call-context-preset-button'));
      fireEvent.press(getByText('Insurance member ID'));
      fireEvent.changeText(getByTestId('call-context-value-input'), 'XZ-1');
      fireEvent.press(getByTestId('call-context-save-button'));

      await waitFor(() => {
        expect(mockPut).toHaveBeenCalledWith([
          {
            key: 'insurance_member_id',
            label: 'Insurance member ID',
            value: 'XZ-1',
            category: 'medical',
            tier: 'if_asked',
          },
        ]);
      });
    });
  });

  describe('editing', () => {
    it('replaces the field at its index, keeping the others', async () => {
      mockPut.mockResolvedValueOnce({ fields: [], catalog: CATALOG });
      const fields = [
        { key: 'full_name', label: 'Full name', value: 'Alex B', category: 'general', tier: 'state' },
        { key: 'gate_code', label: 'Gate code', value: '4417', category: 'general', tier: 'if_asked' },
      ];
      const { getByTestId } = renderScreen({ fields, catalog: CATALOG, index: 1 });

      fireEvent.changeText(getByTestId('call-context-value-input'), '9999');
      fireEvent.press(getByTestId('call-context-save-button'));

      await waitFor(() => {
        expect(mockPut).toHaveBeenCalledWith([
          fields[0],
          { key: 'gate_code', label: 'Gate code', value: '9999', category: 'general', tier: 'if_asked' },
        ]);
      });
    });
  });
});
