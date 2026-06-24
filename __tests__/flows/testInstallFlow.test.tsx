import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import TestInstallScreen from '../../src/screens/Store/TestInstallScreen';
import { lightTheme } from '../../src/theme';
import { listNodes } from '../../src/api/nodeApi';
import { requestTestInstall } from '../../src/api/testInstallApi';

// L1 FLOW INTEGRATION — the Forge "Test Install" screen (no prior coverage):
// node load + auto-select-first-online on mount, the 6-char share-code input
// transform (uppercase + strip), the install-button validation gates
// (code length + node selection), the happy path (requestTestInstall →
// navigate('InstallProgress', ...) with the exact install payload), the
// api-error → Alert('Error', detail) branch, and the empty + loading states.
// Real screen + real form state; only api/auth/nav/help leaves are mocked.

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ state: { activeHouseholdId: 'hh-1' } }),
}));

// InfoHelperText is a context-backed help leaf — stub it.
jest.mock('../../src/components/HelpIcon', () => ({ InfoHelperText: () => null }));

jest.mock('../../src/api/nodeApi', () => ({
  listNodes: jest.fn(),
}));

jest.mock('../../src/api/testInstallApi', () => ({
  requestTestInstall: jest.fn(),
}));

const makeNode = (over: Partial<any> = {}) => ({
  node_id: 'node-aaaaaaaa-1111',
  room: 'Kitchen',
  user: null,
  voice_mode: 'wake',
  adapter_hash: null,
  household_id: 'hh-1',
  online: true,
  last_seen: null,
  uptime_seconds: null,
  command_count: null,
  routine_count: null,
  python_version: null,
  platform: null,
  last_seen_version: null,
  install_mode: null,
  git_sha: null,
  is_busy: false,
  needs_k2: false,
  ...over,
});

const ONLINE_NODE = makeNode();
const OFFLINE_NODE = makeNode({ node_id: 'node-bbbbbbbb-2222', room: 'Bedroom', online: false });

const renderScreen = () =>
  render(
    <PaperProvider theme={lightTheme}>
      <TestInstallScreen />
    </PaperProvider>,
  );

describe('Test Install — flow integration (load/auto-select, validation gates, install nav, error, empty)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listNodes as jest.Mock).mockResolvedValue([ONLINE_NODE, OFFLINE_NODE]);
    (requestTestInstall as jest.Mock).mockResolvedValue({
      id: 'req-99',
      status: 'pending',
      package_name: 'cool-package',
      created_at: '2026-06-23T00:00:00Z',
    });
  });

  it('loads nodes on mount with the active household and renders the node cards', async () => {
    const utils = renderScreen();

    await utils.findByText('Kitchen');
    expect(listNodes).toHaveBeenCalledWith('hh-1');
    expect(utils.getByText('Bedroom')).toBeTruthy();
    expect(utils.getByTestId('node-card-node-aaaaaaaa-1111')).toBeTruthy();
    expect(utils.getByTestId('node-card-node-bbbbbbbb-2222')).toBeTruthy();
  });

  it('auto-selects the first online node, so the install button enables once a 6-char code is entered', async () => {
    const utils = renderScreen();
    await utils.findByText('Kitchen');

    // No code yet → gated by codeValid even though a node is auto-selected.
    expect(utils.getByTestId('install-button').props.accessibilityState?.disabled).toBe(true);

    // Lowercase input is uppercased + stripped to 6 chars by onChangeText.
    fireEvent.changeText(utils.getByTestId('code-input'), 'ab3km7');

    await waitFor(() =>
      expect(utils.getByTestId('install-button').props.accessibilityState?.disabled).toBe(false),
    );
  });

  it('install button stays disabled (no api call) when no node can be auto-selected, even with a valid code', async () => {
    // Both nodes offline → no auto-select → selectedNodeId stays null.
    (listNodes as jest.Mock).mockResolvedValue([
      makeNode({ online: false }),
      OFFLINE_NODE,
    ]);
    const utils = renderScreen();
    await utils.findByText('Kitchen');

    fireEvent.changeText(utils.getByTestId('code-input'), 'AB3KM7');

    // codeValid is true but selectedNodeId is null → button remains disabled.
    expect(utils.getByTestId('install-button').props.accessibilityState?.disabled).toBe(true);

    fireEvent.press(utils.getByTestId('install-button'));
    expect(requestTestInstall).not.toHaveBeenCalled();
  });

  it('happy path: install calls requestTestInstall(nodeId, code) and navigates to InstallProgress with the payload', async () => {
    const utils = renderScreen();
    await utils.findByText('Kitchen');

    fireEvent.changeText(utils.getByTestId('code-input'), 'ab3km7');
    await waitFor(() =>
      expect(utils.getByTestId('install-button').props.accessibilityState?.disabled).toBe(false),
    );

    await act(async () => {
      fireEvent.press(utils.getByTestId('install-button'));
    });

    expect(requestTestInstall).toHaveBeenCalledWith('node-aaaaaaaa-1111', 'AB3KM7');
    expect(mockNavigate).toHaveBeenCalledWith('InstallProgress', {
      installs: JSON.stringify([
        {
          requestId: 'req-99',
          nodeId: 'node-aaaaaaaa-1111',
          nodeName: 'Kitchen',
        },
      ]),
      packageName: 'cool-package',
      commandName: 'cool-package',
      githubRepoUrl: '',
      gitTag: null,
      mode: 'test',
    });
  });

  it('selecting a different node card routes the install to that node id', async () => {
    const utils = renderScreen();
    await utils.findByText('Bedroom');

    // Pick the offline node card explicitly (overrides the online auto-select).
    fireEvent.press(utils.getByTestId('node-card-node-bbbbbbbb-2222'));
    fireEvent.changeText(utils.getByTestId('code-input'), 'XY9ZQ1');

    await act(async () => {
      fireEvent.press(utils.getByTestId('install-button'));
    });

    expect(requestTestInstall).toHaveBeenCalledWith('node-bbbbbbbb-2222', 'XY9ZQ1');
    expect(mockNavigate).toHaveBeenCalledWith(
      'InstallProgress',
      expect.objectContaining({
        installs: JSON.stringify([
          { requestId: 'req-99', nodeId: 'node-bbbbbbbb-2222', nodeName: 'Bedroom' },
        ]),
      }),
    );
  });

  it('api error surfaces the backend detail via Alert("Error", detail) and does not navigate', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    (requestTestInstall as jest.Mock).mockRejectedValueOnce({
      response: { data: { detail: 'Share code expired' } },
    });
    const utils = renderScreen();
    await utils.findByText('Kitchen');

    fireEvent.changeText(utils.getByTestId('code-input'), 'AB3KM7');
    await waitFor(() =>
      expect(utils.getByTestId('install-button').props.accessibilityState?.disabled).toBe(false),
    );

    await act(async () => {
      fireEvent.press(utils.getByTestId('install-button'));
    });

    expect(alertSpy).toHaveBeenCalledWith('Error', 'Share code expired');
    expect(mockNavigate).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('renders the empty state when no nodes are returned', async () => {
    (listNodes as jest.Mock).mockResolvedValue([]);
    const utils = renderScreen();

    await utils.findByTestId('no-nodes-text');
    expect(utils.getByText('No nodes found.')).toBeTruthy();
    // With no node selectable, install stays gated.
    expect(utils.getByTestId('install-button').props.accessibilityState?.disabled).toBe(true);
  });

  it('back button invokes navigation.goBack', async () => {
    const utils = renderScreen();
    await utils.findByText('Kitchen');

    fireEvent.press(utils.getByTestId('back-button'));
    expect(mockGoBack).toHaveBeenCalled();
  });
});
