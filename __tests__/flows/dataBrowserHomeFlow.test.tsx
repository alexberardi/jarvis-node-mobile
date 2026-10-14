import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import DataBrowserHomeScreen from '../../src/screens/CommandData/DataBrowserHomeScreen';
import { lightTheme } from '../../src/theme';
import { listNodes, listCommands } from '../../src/api/commandDataApi';

// L1 FLOW INTEGRATION — the Data Browser home (no prior coverage): node
// enumeration on mount, the multi-node picker → select-chip → listCommands
// fetch, single-node auto-select, command-row tap → DataBrowserRecords nav with
// { nodeId, commandName }, the BackAction → goBack, the no-nodes empty state,
// and the listNodes / listCommands (504 vs generic) error banners. Real screen +
// real load state; only the commandDataApi client + navigation hooks are mocked.

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockRouteParams: any;
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({ params: mockRouteParams }),
}));

// Kinds come from the node list (useNodeKinds): command-data's own node list
// carries no node_kind.
const mockListAllNodes = jest.fn();
jest.mock('../../src/api/nodeApi', () => ({
  listNodes: (...args: unknown[]) => mockListAllNodes(...args),
}));
jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ state: { activeHouseholdId: 'hh-1' } }),
}));

jest.mock('../../src/api/commandDataApi', () => ({
  listNodes: jest.fn(),
  listCommands: jest.fn(),
}));

const KITCHEN = { node_id: 'node-kitchen', household_id: 'hh-1', room: 'Kitchen' };
const BEDROOM = { node_id: 'node-bedroom', household_id: 'hh-1', room: 'Bedroom' };

const TIMER = { command_name: 'set_timer', mode: 'enabled', storage_name: 'timers' };
const SHOPPING = {
  command_name: 'shopping_list',
  mode: 'readonly',
  storage_name: 'shopping',
};

const renderScreen = () =>
  render(
    <PaperProvider theme={lightTheme}>
      <DataBrowserHomeScreen />
    </PaperProvider>,
  );

describe('Data Browser home — flow integration (nodes, commands, nav, errors)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = undefined; // not pinned → enumerate nodes
    mockListAllNodes.mockResolvedValue([]);
    (listNodes as jest.Mock).mockResolvedValue([KITCHEN, BEDROOM]);
    (listCommands as jest.Mock).mockResolvedValue([TIMER, SHOPPING]);
  });

  it('enumerates nodes on mount and renders a picker chip per node (no auto-select)', async () => {
    const utils = renderScreen();

    // listNodes fired with no args; both chips render.
    await utils.findByTestId('data-browser-node-node-kitchen-chip');
    expect(listNodes).toHaveBeenCalledWith();
    expect(utils.getByTestId('data-browser-node-node-bedroom-chip')).toBeTruthy();

    // >1 node → nothing selected yet → no command fetch.
    expect(listCommands).not.toHaveBeenCalled();
  });

  it('single node auto-selects and loads its commands immediately', async () => {
    (listNodes as jest.Mock).mockResolvedValue([KITCHEN]);
    const utils = renderScreen();

    await utils.findByText('set_timer');
    expect(listCommands).toHaveBeenCalledWith('node-kitchen');
    // readonly command shows its sub-label.
    expect(utils.getByText('Read-only')).toBeTruthy();
  });

  it('selecting a node chip fetches that node’s commands', async () => {
    const utils = renderScreen();
    await utils.findByTestId('data-browser-node-node-bedroom-chip');

    await act(async () => {
      fireEvent.press(utils.getByTestId('data-browser-node-node-bedroom-chip'));
    });

    expect(listCommands).toHaveBeenCalledWith('node-bedroom');
    await utils.findByText('set_timer');
  });

  it('tapping a command navigates to DataBrowserRecords with { nodeId, commandName }', async () => {
    const utils = renderScreen();
    await utils.findByTestId('data-browser-node-node-kitchen-chip');

    await act(async () => {
      fireEvent.press(utils.getByTestId('data-browser-node-node-kitchen-chip'));
    });
    await utils.findByTestId('data-browser-command-set_timer-item');

    fireEvent.press(utils.getByTestId('data-browser-command-set_timer-item'));

    expect(mockNavigate).toHaveBeenCalledWith('DataBrowserRecords', {
      nodeId: 'node-kitchen',
      commandName: 'set_timer',
    });
  });

  it('the back action calls navigation.goBack', async () => {
    const utils = renderScreen();
    await utils.findByTestId('data-browser-back');

    fireEvent.press(utils.getByTestId('data-browser-back'));

    expect(mockGoBack).toHaveBeenCalled();
  });

  it('renders the empty state when there are no nodes', async () => {
    (listNodes as jest.Mock).mockResolvedValue([]);
    const utils = renderScreen();

    await utils.findByTestId('data-browser-empty-nodes');
    expect(utils.getByText('No nodes available.')).toBeTruthy();
    expect(listCommands).not.toHaveBeenCalled();
  });

  it('shows error banners: listNodes failure, and the 504 vs generic listCommands failure', async () => {
    // 1) listNodes failure → "Could not load nodes."
    (listNodes as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const fail = renderScreen();
    const banner = await fail.findByTestId('data-browser-error-banner');
    expect(banner.props.children).toBe('Could not load nodes.');
    fail.unmount();

    // 2) listCommands 504 → offline message (single node → auto-select → fetch).
    (listNodes as jest.Mock).mockResolvedValue([KITCHEN]);
    (listCommands as jest.Mock).mockRejectedValueOnce({ response: { status: 504 } });
    const offline = renderScreen();
    await offline.findByText('Node did not respond. It may be offline.');
    offline.unmount();

    // 3) listCommands non-504 → generic message.
    (listNodes as jest.Mock).mockResolvedValue([KITCHEN]);
    (listCommands as jest.Mock).mockRejectedValueOnce({ response: { status: 500 } });
    const generic = renderScreen();
    await generic.findByText('Could not load commands.');
  });

  it('labels each node chip with its kind (robot for a computer, Raspberry Pi otherwise)', async () => {
    const AGENT = { node_id: 'agent-1', household_id: 'hh-1', room: 'Office PC' };
    (listNodes as jest.Mock).mockResolvedValue([KITCHEN, AGENT]);
    mockListAllNodes.mockResolvedValue([
      { node_id: 'node-kitchen', node_kind: null, install_mode: 'tarball' },
      { node_id: 'agent-1', node_kind: 'desktop', install_mode: 'desktop-agent' },
    ]);
    const utils = renderScreen();

    await utils.findByLabelText('Office PC, Computer');
    expect(mockListAllNodes).toHaveBeenCalledWith('hh-1');
    expect(utils.getByLabelText('Kitchen, Raspberry Pi')).toBeTruthy();
  });

  it('a desktop agent that does not answer gets computer wording, not a stall-then-generic error', async () => {
    mockRouteParams = { nodeId: 'agent-1' }; // pinned from the computer's settings
    mockListAllNodes.mockResolvedValue([
      { node_id: 'agent-1', node_kind: 'desktop', install_mode: 'desktop-agent' },
    ]);
    // The app's own 10 s timeout fired before cc's 504.
    (listCommands as jest.Mock).mockRejectedValue({ code: 'ECONNABORTED', message: 'timeout' });
    const utils = renderScreen();

    await utils.findByText(/This computer didn't answer/);
    expect(listCommands).toHaveBeenCalledWith('agent-1');
  });
});

