import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import AdapterDeployedScreen from '../../src/screens/Inbox/AdapterDeployedScreen';
import { lightTheme } from '../../src/theme';
import { getInboxItem } from '../../src/api/inboxApi';
import { revertDeployment } from '../../src/api/adaptersApi';

// L1 FLOW INTEGRATION — the adapter-deployed confirmation screen (no prior
// coverage): load of the inbox item, the deployment metadata rows, Revert
// (confirm -> revertDeployment(adapterHash, householdId) -> "Reverted" -> goBack),
// the guard when the item carries no adapter_hash, and the load-error + Retry
// path. Real screen + real load/reverting state; only api/auth/nav are mocked.

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: mockGoBack }),
  useRoute: () => ({ params: { itemId: 'inbox-7' } }),
}));

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ state: { accessToken: 'tok' } }),
}));

jest.mock('../../src/api/inboxApi', () => ({ getInboxItem: jest.fn() }));
jest.mock('../../src/api/adaptersApi', () => ({ revertDeployment: jest.fn() }));

const ITEM = {
  id: 'inbox-7',
  title: 'Voice assistant updated',
  household_id: 'hh-1',
  created_at: '2026-06-01T10:00:00Z',
  metadata: {
    adapter_hash: 'abcdef0123456789aaaa',
    previous_adapter_hash: 'prev0123456789bbbb',
    pass_rate: 93.5,
    latency_s: 0.84,
    provider_name: 'qwen-live',
  },
} as any;

const renderScreen = () =>
  render(
    <PaperProvider theme={lightTheme}>
      <AdapterDeployedScreen />
    </PaperProvider>,
  );

describe('Adapter deployed — flow integration (load, revert, guard, retry)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getInboxItem as jest.Mock).mockResolvedValue(ITEM);
    (revertDeployment as jest.Mock).mockResolvedValue(undefined);
  });

  it('loads the item and renders the deployment metadata rows', async () => {
    const utils = renderScreen();
    await utils.findByText('Voice assistant updated');

    expect(getInboxItem).toHaveBeenCalledWith('inbox-7');
    expect(utils.getByText('qwen-live')).toBeTruthy();
    expect(utils.getByText('93.5%')).toBeTruthy();
    expect(utils.getByText('0.84s')).toBeTruthy();
    expect(utils.getByTestId('adapter-revert')).toBeTruthy();
  });

  it('Revert → Alert confirm → revertDeployment(hash, household) → "Reverted" → goBack', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const utils = renderScreen();
    await utils.findByTestId('adapter-revert');

    fireEvent.press(utils.getByTestId('adapter-revert'));
    const confirm = (alertSpy.mock.calls[0][2] as any[]).find((b) => b.text === 'Revert');
    await act(async () => {
      await confirm.onPress();
    });

    expect(revertDeployment).toHaveBeenCalledWith('abcdef0123456789aaaa', 'hh-1');
    expect(alertSpy).toHaveBeenCalledWith('Reverted', expect.stringContaining('previous'));
    expect(mockGoBack).toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('guards against an item with no adapter_hash (errors, never calls revert)', async () => {
    (getInboxItem as jest.Mock).mockResolvedValue({ ...ITEM, metadata: { provider_name: 'x' } });
    const alertSpy = jest.spyOn(Alert, 'alert');
    const utils = renderScreen();
    await utils.findByTestId('adapter-revert');

    fireEvent.press(utils.getByTestId('adapter-revert'));

    expect(alertSpy).toHaveBeenCalledWith('Error', 'No adapter hash on this item');
    expect(revertDeployment).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('load error → error text + Retry that re-loads successfully', async () => {
    (getInboxItem as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const utils = renderScreen();
    await utils.findByText('Could not load item');

    fireEvent.press(utils.getByTestId('adapter-deployed-retry'));
    await utils.findByText('Voice assistant updated');
    expect(utils.getByTestId('adapter-revert')).toBeTruthy();
  });
});
