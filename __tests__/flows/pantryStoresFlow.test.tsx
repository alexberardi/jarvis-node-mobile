import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import PantryGate from '../../src/components/PantryGate';
import StoreBrowseScreen from '../../src/screens/Store/StoreBrowseScreen';
import TestInstallScreen from '../../src/screens/Store/TestInstallScreen';
import { lightTheme } from '../../src/theme';
import { browsePackages, getCategories } from '../../src/api/pantryApi';
import { activeStore, resetPantryStores } from '../../src/services/pantryStores';
import { fetchNodeTools } from '../../src/api/chatApi';
import { getHouseholdSettings, setHouseholdSetting } from '../../src/api/householdSettingsApi';
import { listNodes } from '../../src/api/nodeApi';
import { requestTestInstall } from '../../src/api/testInstallApi';
import apiClient from '../../src/api/apiClient';

// L1 FLOW INTEGRATION — several Pantry stores (jarvis-server decision
// 2026-11-11-several-pantries): an enabled household with an empty list says no
// store is configured and contacts nothing; with two stores the Store offers a
// picker, browses the picked store and names it on a Forge test install; with
// one store nothing changes.

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
  getServiceConfig: () => ({ commandCenterUrl: 'https://cc.test', pantryUrl: '' }),
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

const PUB = { id: 'a1', url: 'https://pantry-api.jarvisautomation.io', name: 'Public Pantry' };
const SHOP = { id: 'b2', url: 'http://10.0.0.5:7721', name: 'Workshop' };

describe('Pantry stores — flow integration', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    resetPantryStores();
    await AsyncStorage.clear(); // a pick is remembered per household
    asRole('member');
    (browsePackages as jest.Mock).mockResolvedValue({ commands: [PKG], total: 1, page: 1, per_page: 20 });
    (getCategories as jest.Mock).mockResolvedValue([]);
    (apiClient.get as jest.Mock).mockResolvedValue({ data: [] });
    (fetchNodeTools as jest.Mock).mockResolvedValue({ client_tools: [] });
  });

  it('an enabled household with no store says so and contacts nothing', async () => {
    getSettings.mockResolvedValue({ 'pantry.enabled': true, 'pantry.stores': [] });
    const utils = renderStore();
    await utils.findByTestId('pantry-gate-no-store');
    expect(utils.getByText(/No Pantry store is configured/)).toBeTruthy();
    expectPantryUntouched();
  });

  it('one store: no picker, the store as before', async () => {
    getSettings.mockResolvedValue({ 'pantry.enabled': true, 'pantry.stores': [PUB] });
    const utils = renderStore();
    await utils.findByText('MPV Play');
    expect(utils.queryByTestId('pantry-store-picker')).toBeNull();
    expect(activeStore()).toEqual(PUB);
  });

  it('two stores: browses the picked one', async () => {
    getSettings.mockResolvedValue({ 'pantry.enabled': true, 'pantry.stores': [PUB, SHOP] });
    const utils = renderStore();
    await utils.findByText('MPV Play');
    expect(utils.getByTestId('pantry-store-picker')).toBeTruthy();
    expect(utils.getByText('Public Pantry')).toBeTruthy();
    const before = (browsePackages as jest.Mock).mock.calls.length;

    fireEvent.press(utils.getByTestId('pantry-store-picker'));
    await act(async () => {
      fireEvent.press(await utils.findByTestId('pantry-store-option-b2'));
    });
    expect(activeStore()).toEqual(SHOP);
    await waitFor(() => expect((browsePackages as jest.Mock).mock.calls.length).toBeGreaterThan(before));
  });

  it("names the store it can't reach", async () => {
    getSettings.mockResolvedValue({ 'pantry.enabled': true, 'pantry.stores': [PUB, SHOP] });
    (browsePackages as jest.Mock).mockRejectedValue(new Error('Network Error'));
    const utils = renderStore();
    await utils.findByText('Could not reach Public Pantry');
    // The picker stays, so another store can still be tried.
    expect(utils.getByTestId('pantry-store-picker')).toBeTruthy();
  });

  it('a Forge test install names the picked store', async () => {
    getSettings.mockResolvedValue({ 'pantry.enabled': true, 'pantry.stores': [PUB, SHOP] });
    (listNodes as jest.Mock).mockResolvedValue([{ node_id: 'node-aaaaaaaa-1111', room: 'Kitchen', online: true }]);
    (requestTestInstall as jest.Mock).mockResolvedValue({ id: 'r1', status: 'pending', package_name: 'demo', created_at: '' });
    const utils = render(
      <PaperProvider theme={lightTheme}>
        <PantryGate>
          <TestInstallScreen />
        </PantryGate>
      </PaperProvider>,
    );
    await utils.findByText('Kitchen');
    expect(utils.getByText('The code is looked up in this store only.')).toBeTruthy();
    fireEvent.press(utils.getByTestId('pantry-store-picker'));
    await act(async () => {
      fireEvent.press(await utils.findByTestId('pantry-store-option-b2'));
    });
    fireEvent.changeText(utils.getByTestId('code-input'), 'ABC123');
    await waitFor(() =>
      expect(utils.getByTestId('install-button').props.accessibilityState?.disabled).toBe(false),
    );
    await act(async () => {
      fireEvent.press(utils.getByTestId('install-button'));
    });
    expect(requestTestInstall).toHaveBeenCalledWith('node-aaaaaaaa-1111', 'ABC123', 'b2');
  });
});
