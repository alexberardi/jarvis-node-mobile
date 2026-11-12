import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import NodeForgeTestScreen, { normalizeShareCode } from '../../src/screens/Nodes/NodeForgeTestScreen';
import { lightTheme } from '../../src/theme';
import { getNode } from '../../src/api/nodeApi';
import { fetchTestRuns, pollTestInstallStatus, requestTestInstall, runTestAgents } from '../../src/api/testInstallApi';
import { useChat } from '../../src/hooks/useChat';

// The node's Forge test: share code → install → a chat pinned to that node, with Send to Forge
// (the runs and a note) behind the header button.

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useRoute: () => ({ params: { nodeId: 'node-1' } }),
}));
jest.mock('../../src/api/nodeApi', () => ({ getNode: jest.fn() }));
jest.mock('../../src/api/testInstallApi', () => ({
  requestTestInstall: jest.fn(),
  pollTestInstallStatus: jest.fn(),
  fetchTestRuns: jest.fn(),
  runTestAgents: jest.fn(),
}));
jest.mock('../../src/api/commandCenterApi', () => ({ sendNodeAction: jest.fn() }));
jest.mock('../../src/hooks/useChat', () => ({ useChat: jest.fn() }));
jest.mock('../../src/auth/AuthContext', () => ({ useAuth: () => ({ state: { accessToken: 'tok' } }) }));
jest.mock('../../src/screens/Store/SendToForgeCard', () => {
  const { Text } = require('react-native');
  return ({ requestId }: { requestId: string }) => <Text>send-card {requestId}</Text>;
});

const NODE = { node_id: 'node-1', room: 'Office PC', household_id: 'hh-1', online: true, node_kind: 'desktop', install_mode: 'desktop-agent' };
const DONE = { status: 'completed', request_id: 'req-1', command_name: 'get_crypto_price', error_message: null, details: { commands: ['get_crypto_price'] } };
const sendMessage = jest.fn();

const renderScreen = () =>
  render(
    <PaperProvider theme={lightTheme}>
      <NodeForgeTestScreen />
    </PaperProvider>,
  );

async function install(screen: ReturnType<typeof renderScreen>) {
  fireEvent.changeText(await screen.findByTestId('forge-test-code'), 'ab3-km7');
  await act(async () => {
    fireEvent.press(screen.getByTestId('forge-test-install'));
  });
}

describe('NodeForgeTestScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getNode as jest.Mock).mockResolvedValue(NODE);
    (requestTestInstall as jest.Mock).mockResolvedValue({ id: 'req-1', status: 'pending', package_name: 'get_crypto_price' });
    (pollTestInstallStatus as jest.Mock).mockResolvedValue(DONE);
    (fetchTestRuns as jest.Mock).mockResolvedValue([{ command: 'get_crypto_price', arguments: {}, output: {}, at: 't' }]);
    (useChat as jest.Mock).mockReturnValue({ messages: [], isLoading: false, sendMessage });
  });

  it('cleans up the share code', () => {
    expect(normalizeShareCode('ab3-km7x')).toBe('AB3KM7');
  });

  it('installs the code on this node, then chats through it with the new command', async () => {
    const screen = renderScreen();
    expect(await screen.findByText('Install on Office PC')).toBeTruthy();
    await install(screen);
    expect(requestTestInstall).toHaveBeenCalledWith('node-1', 'AB3KM7');
    expect(await screen.findByText("Type what you'd say to Jarvis to use get_crypto_price.")).toBeTruthy();
    // The chat only starts after the install, pinned to this node, so its tools include the draft.
    expect(useChat).toHaveBeenLastCalledWith({ nodeId: 'node-1', householdId: 'hh-1', accessToken: 'tok' });

    fireEvent.changeText(screen.getByTestId('forge-test-chat-input'), 'price of bitcoin');
    fireEvent.press(screen.getByTestId('forge-test-chat-send'));
    expect(sendMessage).toHaveBeenCalledWith('price of bitcoin');
  });

  it('counts the runs on the header button and opens Send to Forge from it', async () => {
    const screen = renderScreen();
    await install(screen);
    expect((await screen.findByTestId('forge-test-run-count')).props.children).toBe(1);
    fireEvent.press(screen.getByTestId('forge-test-send-open'));
    expect(await screen.findByText('send-card req-1')).toBeTruthy();
  });

  it('reinstalls the same code after a fix, with a fresh chat', async () => {
    const screen = renderScreen();
    await install(screen);
    await screen.findByTestId('forge-test-chat');
    const chatsBefore = (useChat as jest.Mock).mock.calls.length;
    (requestTestInstall as jest.Mock).mockResolvedValue({ id: 'req-2', status: 'pending', package_name: 'get_crypto_price' });
    fireEvent.press(screen.getByTestId('forge-test-send-open'));
    await act(async () => {
      fireEvent.press(await screen.findByTestId('forge-test-reinstall-sheet'));
    });
    expect(requestTestInstall).toHaveBeenLastCalledWith('node-1', 'AB3KM7');
    await waitFor(() => expect(pollTestInstallStatus).toHaveBeenCalledWith('node-1', 'req-2'));
    expect(await screen.findByTestId('forge-test-chat')).toBeTruthy();
    expect((useChat as jest.Mock).mock.calls.length).toBeGreaterThan(chatsBefore);
  });

  it('points a device protocol at its settings and a device scan', async () => {
    (pollTestInstallStatus as jest.Mock).mockResolvedValue({ ...DONE, command_name: 'zigbee2mqtt', details: { commands: [], protocols: ['zigbee2mqtt'] } });
    const screen = renderScreen();
    await install(screen);
    expect(await screen.findByText('Device protocol zigbee2mqtt loaded. Set its settings, then scan for its devices.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('forge-test-settings'));
    expect(mockNavigate).toHaveBeenCalledWith('NodeSettings', { nodeId: 'node-1', room: 'Office PC' });
    fireEvent.press(screen.getByTestId('forge-test-scan'));
    expect(mockNavigate).toHaveBeenCalledWith('SmartHomeSetup', { screen: 'DeviceDiscovery', params: { nodeId: 'node-1' } });
  });

  it('says a background agent loaded and that Send to Forge carries its runs', async () => {
    (pollTestInstallStatus as jest.Mock).mockResolvedValue({ ...DONE, command_name: 'zigbee-watch', details: { commands: [], agents: ['zigbee_watch'] } });
    const screen = renderScreen();
    await install(screen);
    expect(await screen.findByTestId('forge-test-agents')).toBeTruthy();
    expect(screen.getByText(/Background agent zigbee_watch loaded\. It ran once now/)).toBeTruthy();
    // Settings and a device scan are there for any draft.
    expect(screen.getByTestId('forge-test-settings')).toBeTruthy();
    expect(screen.getByTestId('forge-test-scan')).toBeTruthy();

    // Run agents now: the node runs them at once.
    (runTestAgents as jest.Mock).mockResolvedValue(undefined);
    fireEvent.press(screen.getByTestId('forge-test-run-agents'));
    expect(await screen.findByText('Sent. Send to Forge includes how the run went.')).toBeTruthy();
    expect(runTestAgents).toHaveBeenCalledWith('node-1', expect.any(String));
  });

  it("shows the node's error for a failed install and starts over", async () => {
    (pollTestInstallStatus as jest.Mock).mockResolvedValue({ ...DONE, status: 'failed', error_message: 'No module named requests' });
    const screen = renderScreen();
    await install(screen);
    expect(await screen.findByText('No module named requests')).toBeTruthy();
    expect(screen.getByTestId('forge-test-reinstall-failed')).toBeTruthy();
    fireEvent.press(screen.getByText('Try another code'));
    expect(await screen.findByTestId('forge-test-code')).toBeTruthy();
  });

  it("shows jarvisd's reason when it refuses the install", async () => {
    (requestTestInstall as jest.Mock).mockRejectedValue({ response: { data: { detail: 'The Pantry package store is turned off for this household.' } } });
    const screen = renderScreen();
    await install(screen);
    expect(await screen.findByText('The Pantry package store is turned off for this household.')).toBeTruthy();
  });

  it("doesn't offer the install while the node is offline", async () => {
    (getNode as jest.Mock).mockResolvedValue({ ...NODE, online: false });
    const screen = renderScreen();
    expect(await screen.findByText('Office PC is offline. Test installs need it online.')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('forge-test-code'), 'AB3KM7');
    await waitFor(() => expect(screen.getByTestId('forge-test-install')).toBeDisabled());
  });
});
