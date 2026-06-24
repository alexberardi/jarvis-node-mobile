import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import StoreBrowseScreen from '../../src/screens/Store/StoreBrowseScreen';
import { lightTheme } from '../../src/theme';
import { browsePackages, getCategories } from '../../src/api/pantryApi';
import { fetchNodeTools } from '../../src/api/chatApi';
import apiClient from '../../src/api/apiClient';

// L1 FLOW INTEGRATION — the Pantry browse/catalog screen (no flow coverage):
// the on-mount load (browsePackages with the default {sort, page, per_page}
// shape + getCategories on focus), the debounced search → browsePackages({q}),
// category + sort chip filtering, the installed-badge derivation (admin nodes
// fan-out via apiClient.get + fetchNodeTools intersected against command_name),
// card tap → StoreDetail nav, and the error + empty list states. Real screen +
// real useState/useEffect/useFocusEffect; only the public-pantry axios api,
// chat-tools api, the authed apiClient, auth context, serviceConfig, the
// first-run gate and its card are mocked.

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const ReactLocal = require('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate }),
    // run the focus callback once on mount, like a real focus
    useFocusEffect: (cb: any) => ReactLocal.useEffect(() => cb(), []),
  };
});

let mockAuthState: any;
jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ state: mockAuthState }),
}));

jest.mock('../../src/api/pantryApi', () => ({
  browsePackages: jest.fn(),
  getCategories: jest.fn(),
}));

jest.mock('../../src/api/chatApi', () => ({
  fetchNodeTools: jest.fn(),
}));

jest.mock('../../src/api/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

jest.mock('../../src/config/serviceConfig', () => ({
  getServiceConfig: () => ({ commandCenterUrl: 'https://cc.test' }),
}));

// First-run gate forced closed; its card is a pure leaf — stub to null.
jest.mock('../../src/hooks/useFirstRun', () => ({
  useFirstRun: () => ({ visible: false, dismiss: jest.fn(), showAgain: jest.fn() }),
}));
jest.mock('../../src/components/FirstRunCard', () => ({ FirstRunCard: () => null }));

const get = apiClient.get as jest.Mock;

const PKG_A = {
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
const PKG_B = {
  command_name: 'weather-now',
  display_name: 'Weather Now',
  description: 'Current weather',
  author: 'acme',
  latest_version: '2.1.0',
  categories: ['info'],
  install_count: 99,
  danger_rating: 1,
  verified: false,
  icon_url: '',
  package_type: 'command' as const,
  components: [],
};

const browseResult = (commands = [PKG_A, PKG_B], total = commands.length) => ({
  commands,
  total,
  page: 1,
  per_page: 20,
});

const renderScreen = () =>
  render(
    <PaperProvider theme={lightTheme}>
      <StoreBrowseScreen />
    </PaperProvider>,
  );

describe('Store browse — flow integration (load, search, filter, sort, badge, nav, errors)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState = { activeHouseholdId: 'hh-1' };
    (browsePackages as jest.Mock).mockResolvedValue(browseResult());
    (getCategories as jest.Mock).mockResolvedValue([
      { name: 'media', count: 4 },
      { name: 'info', count: 2 },
    ]);
    get.mockResolvedValue({ data: [{ node_id: 'n1', room: 'Kitchen' }] });
    (fetchNodeTools as jest.Mock).mockResolvedValue({ client_tools: [] });
  });

  it('on mount: loads packages with the default {sort,page,per_page} shape, loads categories, renders rows', async () => {
    const utils = renderScreen();
    await utils.findByText('MPV Play');

    expect(browsePackages).toHaveBeenCalledWith({
      q: undefined,
      category: undefined,
      sort: 'popular',
      page: 1,
      per_page: 20,
    });
    expect(getCategories).toHaveBeenCalled();
    expect(utils.getByText('Weather Now')).toBeTruthy();
    // category chips render from getCategories
    await utils.findByTestId('category-chip-media');
  });

  it('typing in the search box debounces into browsePackages({q}) on the next load', async () => {
    const utils = renderScreen();
    await utils.findByText('MPV Play');
    (browsePackages as jest.Mock).mockClear();

    await act(async () => {
      fireEvent.changeText(utils.getByTestId('searchbar-input'), 'weather');
    });

    await waitFor(() =>
      expect(browsePackages).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'weather', sort: 'popular', page: 1 }),
      ),
    );
  });

  it('selecting a category chip reloads with browsePackages({category})', async () => {
    const utils = renderScreen();
    await utils.findByText('MPV Play');
    (browsePackages as jest.Mock).mockClear();

    await act(async () => {
      fireEvent.press(utils.getByTestId('category-chip-media'));
    });

    await waitFor(() =>
      expect(browsePackages).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'media', page: 1 }),
      ),
    );
  });

  it('selecting a sort chip reloads with browsePackages({sort})', async () => {
    const utils = renderScreen();
    await utils.findByText('MPV Play');
    (browsePackages as jest.Mock).mockClear();

    await act(async () => {
      fireEvent.press(utils.getByTestId('sort-chip-newest'));
    });

    await waitFor(() =>
      expect(browsePackages).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'newest', page: 1 }),
      ),
    );
  });

  it('tapping a package card navigates to StoreDetail with its command name', async () => {
    const utils = renderScreen();
    await utils.findByText('MPV Play');

    fireEvent.press(utils.getByTestId('package-card-mpv-play'));

    expect(mockNavigate).toHaveBeenCalledWith('StoreDetail', { commandName: 'mpv-play' });
  });

  it('installed badge: fans out admin nodes via apiClient.get + fetchNodeTools, shows installed/total when a node has the tool', async () => {
    // one node, and it has the mpv-play tool installed → badge "1/1"
    get.mockResolvedValue({ data: [{ node_id: 'n1', room: 'Kitchen' }] });
    (fetchNodeTools as jest.Mock).mockResolvedValue({
      client_tools: [{ function: { name: 'mpv-play' } }],
    });

    const utils = renderScreen();
    await utils.findByText('MPV Play');

    expect(get).toHaveBeenCalledWith(
      'https://cc.test/api/v0/admin/nodes?household_id=hh-1',
    );
    await waitFor(() => expect(fetchNodeTools).toHaveBeenCalledWith('n1'));
    // badge text is "installed/nodeCount"
    await utils.findByText('1/1');
  });

  it('shows the error banner + Retry when the package load fails', async () => {
    (browsePackages as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const utils = renderScreen();

    await utils.findByText('Could not load packages');
    expect(utils.getByText('Retry')).toBeTruthy();
  });

  it('renders the empty state when the catalog is empty', async () => {
    (browsePackages as jest.Mock).mockResolvedValue(browseResult([], 0));
    const utils = renderScreen();

    await utils.findByText('No packages found');
  });
});
