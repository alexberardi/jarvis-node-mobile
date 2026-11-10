import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import PantryGate from '../../src/components/PantryGate';
import StoreBrowseScreen from '../../src/screens/Store/StoreBrowseScreen';
import TestInstallScreen from '../../src/screens/Store/TestInstallScreen';
import { lightTheme } from '../../src/theme';
import { browsePackages, getCategories } from '../../src/api/pantryApi';
import { fetchNodeTools } from '../../src/api/chatApi';
import { getHouseholdSettings, setHouseholdSetting } from '../../src/api/householdSettingsApi';
import { listNodes } from '../../src/api/nodeApi';
import { requestTestInstall } from '../../src/api/testInstallApi';
import apiClient from '../../src/api/apiClient';

// L1 FLOW INTEGRATION — the household `pantry.enabled` gate in front of the
// Store stack (StoreStackNavigator wraps every Pantry screen in <PantryGate>):
// enabled → the store loads as before; disabled + admin → explanation +
// "Enable Pantry" → confirm → setting written → store loads; disabled +
// non-admin → explanation, no button, and the Pantry is never contacted;
// legacy server (no key) → store loads; and a 403 `pantry_disabled` from a
// Forge test install swaps in the disabled state instead of a generic error.

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const ReactLocal = require('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
    useFocusEffect: (cb: any) => ReactLocal.useEffect(() => cb(), []),
  };
});

let mockAuthState: any;
jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ state: mockAuthState }),
}));

jest.mock('../../src/api/householdSettingsApi', () => ({
  __esModule: true,
  ...jest.requireActual('../../src/api/householdSettingsApi'),
  getHouseholdSettings: jest.fn(),
  setHouseholdSetting: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/api/pantryApi', () => ({
  browsePackages: jest.fn(),
  getCategories: jest.fn(),
}));
jest.mock('../../src/api/chatApi', () => ({ fetchNodeTools: jest.fn() }));
jest.mock('../../src/api/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));
jest.mock('../../src/api/nodeApi', () => ({ listNodes: jest.fn() }));
jest.mock('../../src/api/testInstallApi', () => ({ requestTestInstall: jest.fn() }));
jest.mock('../../src/config/serviceConfig', () => ({
  getServiceConfig: () => ({ commandCenterUrl: 'https://cc.test' }),
}));
jest.mock('../../src/hooks/useFirstRun', () => ({
  useFirstRun: () => ({ visible: false, dismiss: jest.fn(), showAgain: jest.fn() }),
}));
jest.mock('../../src/components/FirstRunCard', () => ({ FirstRunCard: () => null }));
jest.mock('../../src/components/HelpIcon', () => ({ InfoHelperText: () => null }));

const getSettings = getHouseholdSettings as jest.Mock;
const setSetting = setHouseholdSetting as jest.Mock;

const PKG = {
  command_name: 'mpv-play',
  display_name: 'MPV Play',
  description: 'Play media via mpv',
  author: 'example',
  latest_version: '1.0.0',
  categories: ['media'],
  install_count: 5,
  danger_rating: 2,
  verified: true,
  icon_url: '',
  package_type: 'command' as const,
  components: [],
};

const asRole = (role: 'admin' | 'power_user' | 'member') => {
  mockAuthState = {
    activeHouseholdId: 'hh-1',
    households: [{ id: 'hh-1', name: 'Home', role, created_at: '' }],
  };
};

const renderStore = () =>
  render(
    <PaperProvider theme={lightTheme}>
      <PantryGate>
        <StoreBrowseScreen />
      </PantryGate>
    </PaperProvider>,
  );

const expectPantryUntouched = () => {
  expect(browsePackages).not.toHaveBeenCalled();
  expect(getCategories).not.toHaveBeenCalled();
  expect(apiClient.get).not.toHaveBeenCalled();
};

describe('Pantry gate — flow integration (household pantry.enabled)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asRole('admin');
    (browsePackages as jest.Mock).mockResolvedValue({ commands: [PKG], total: 1, page: 1, per_page: 20 });
    (getCategories as jest.Mock).mockResolvedValue([]);
    (apiClient.get as jest.Mock).mockResolvedValue({ data: [] });
    (fetchNodeTools as jest.Mock).mockResolvedValue({ client_tools: [] });
  });

  it('enabled → the store loads as before', async () => {
    getSettings.mockResolvedValue({ 'web_search.enabled': false, 'pantry.enabled': true });
    const utils = renderStore();

    await utils.findByText('MPV Play');
    expect(getSettings).toHaveBeenCalledWith('hh-1');
    expect(browsePackages).toHaveBeenCalled();
    expect(utils.queryByTestId('pantry-gate')).toBeNull();
  });

  it('does not contact the Pantry before the setting check resolves', async () => {
    let resolve!: (v: unknown) => void;
    getSettings.mockReturnValue(new Promise((r) => { resolve = r; }));
    const utils = renderStore();

    expect(utils.getByTestId('pantry-gate-checking')).toBeTruthy();
    expectPantryUntouched();

    await act(async () => {
      resolve({ 'pantry.enabled': true });
    });
    await utils.findByText('MPV Play');
  });

  it('legacy server (no pantry.enabled key) → the store loads', async () => {
    getSettings.mockResolvedValue({ 'web_search.enabled': true });
    const utils = renderStore();

    await utils.findByText('MPV Play');
    expect(browsePackages).toHaveBeenCalled();
  });

  it('disabled + admin → message and Enable button → confirm → setting written → store loads', async () => {
    getSettings.mockResolvedValue({ 'pantry.enabled': false });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const utils = renderStore();

    await utils.findByText('The Pantry is turned off for this household.');
    expect(utils.getByText(/sees your IP address/)).toBeTruthy();
    expectPantryUntouched();

    fireEvent.press(utils.getByTestId('pantry-enable-button'));
    expect(alertSpy).toHaveBeenCalledWith('Enable Pantry?', expect.any(String), expect.any(Array));
    expect(setSetting).not.toHaveBeenCalled(); // nothing written until confirmed

    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.text === 'Enable')!.onPress!();
    });

    expect(setSetting).toHaveBeenCalledWith('hh-1', 'pantry.enabled', true);
    await utils.findByText('MPV Play');
    expect(browsePackages).toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('disabled + admin → Cancel writes nothing and keeps the Pantry closed', async () => {
    getSettings.mockResolvedValue({ 'pantry.enabled': false });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const utils = renderStore();

    fireEvent.press(await utils.findByTestId('pantry-enable-button'));
    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    expect(buttons.find((b) => b.text === 'Cancel')?.onPress).toBeUndefined();

    expect(setSetting).not.toHaveBeenCalled();
    expectPantryUntouched();
    alertSpy.mockRestore();
  });

  it('disabled + non-admin → ask-an-admin message, no button, no catalog request', async () => {
    asRole('power_user');
    getSettings.mockResolvedValue({ 'pantry.enabled': false });
    const utils = renderStore();

    await utils.findByText('Ask a household admin to turn on the Pantry.');
    expect(utils.queryByTestId('pantry-enable-button')).toBeNull();
    expectPantryUntouched();
  });

  it('a failed setting check shows Retry and still never contacts the Pantry', async () => {
    getSettings.mockRejectedValueOnce(new Error('network down'));
    getSettings.mockResolvedValueOnce({ 'pantry.enabled': true });
    const utils = renderStore();

    await utils.findByText(/Couldn't check whether the Pantry is on/);
    expectPantryUntouched();

    await act(async () => {
      fireEvent.press(utils.getByText('Retry'));
    });
    await utils.findByText('MPV Play');
  });

  describe('403 pantry_disabled from an install', () => {
    const ONLINE_NODE = { node_id: 'node-aaaaaaaa-1111', room: 'Kitchen', online: true };

    const renderTestInstall = () =>
      render(
        <PaperProvider theme={lightTheme}>
          <PantryGate>
            <TestInstallScreen />
          </PantryGate>
        </PaperProvider>,
      );

    const submit = async (utils: ReturnType<typeof renderTestInstall>) => {
      await utils.findByText('Kitchen');
      fireEvent.changeText(utils.getByTestId('code-input'), 'ABC123');
      await waitFor(() =>
        expect(utils.getByTestId('install-button').props.accessibilityState?.disabled).toBe(false),
      );
      await act(async () => {
        fireEvent.press(utils.getByTestId('install-button'));
      });
    };

    beforeEach(() => {
      getSettings.mockResolvedValue({ 'pantry.enabled': true });
      (listNodes as jest.Mock).mockResolvedValue([ONLINE_NODE]);
    });

    it('swaps in the disabled state instead of a generic error', async () => {
      (requestTestInstall as jest.Mock).mockRejectedValue({
        response: { status: 403, data: { detail: 'Pantry is off', code: 'pantry_disabled' } },
      });
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const utils = renderTestInstall();

      await submit(utils);

      await utils.findByText('The Pantry is turned off for this household.');
      expect(utils.getByTestId('pantry-enable-button')).toBeTruthy();
      expect(alertSpy).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });

    it('any other 403 still surfaces as an error', async () => {
      (requestTestInstall as jest.Mock).mockRejectedValue({
        response: { status: 403, data: { detail: 'Not a household admin' } },
      });
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const utils = renderTestInstall();

      await submit(utils);

      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Error', 'Not a household admin'));
      expect(utils.queryByTestId('pantry-gate')).toBeNull();
      alertSpy.mockRestore();
    });
  });
});
