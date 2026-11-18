import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import NodeDetailScreen, { PackagesTab } from '../../src/screens/Nodes/NodeDetailScreen';
import { lightTheme } from '../../src/theme';
import { getNode } from '../../src/api/nodeApi';
import { hasK2 } from '../../src/services/k2Service';
import { listHouseholdMembers } from '../../src/api/householdApi';
import { fetchNodeTools } from '../../src/api/chatApi';
import { getHouseholdSettings } from '../../src/api/householdSettingsApi';

// NodeDetailScreen's per-kind wiring: which icon, which tabs, and who sees the
// Danger Zone. A Pi's delete is gated on holding its K2 on this phone (today's
// rule); a desktop agent's sign-out on cc's rule (owner or household admin).

const mockNavigate = jest.fn();
const mockRootNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn(), getParent: () => ({ navigate: mockRootNavigate }) }),
  useRoute: () => ({ params: { nodeId: 'node-1' } }),
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(cb, [cb]);
  },
}));
jest.mock('../../src/api/nodeApi', () => ({
  getNode: jest.fn(),
  startFactoryReset: jest.fn(),
  waitForFactoryReset: jest.fn(),
  removeNode: jest.fn(),
  signOutNode: jest.fn(),
  nodeErrorMessage: (_e: unknown, fb: string) => fb,
}));
jest.mock('../../src/api/chatApi', () => ({ fetchNodeTools: jest.fn().mockResolvedValue({ client_tools: [] }) }));
jest.mock('../../src/services/k2Service', () => ({ deleteK2: jest.fn(), hasK2: jest.fn(), getK2: jest.fn() }));
jest.mock('../../src/components/NodeUpdateSection', () => ({ NodeUpdateSection: () => null }));
jest.mock('../../src/screens/Nodes/HardwareTab', () => {
  const { Text } = require('react-native');
  return { HardwareTab: () => <Text>hardware-tab-body</Text> };
});

jest.mock('../../src/api/householdApi', () => ({ listHouseholdMembers: jest.fn() }));
jest.mock('../../src/api/householdSettingsApi', () => ({
  ...jest.requireActual('../../src/api/householdSettingsApi'),
  getHouseholdSettings: jest.fn().mockRejectedValue(new Error('offline')),
}));

let mockAuth: any;
jest.mock('../../src/auth/AuthContext', () => ({ useAuth: () => ({ state: mockAuth }) }));

const base = {
  node_id: 'node-1',
  room: 'Kitchen',
  online: true,
  last_seen: null,
  uptime_seconds: 10,
  command_count: 1,
  routine_count: 0,
  household_id: 'hh-1',
  voice_mode: 'brief',
  needs_k2: false,
};
const PI = { ...base, install_mode: 'tarball', node_kind: null };
const DESKTOP = { ...base, room: 'Office PC', install_mode: 'desktop-agent', node_kind: 'desktop', owner_user_id: 7 };

const renderScreen = () =>
  render(
    <PaperProvider theme={lightTheme}>
      <NodeDetailScreen />
    </PaperProvider>,
  );

describe('NodeDetailScreen — node kinds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = { user: { id: 7 }, accessToken: 'tok', households: [{ id: 'hh-1', role: 'member' }] };
    (hasK2 as jest.Mock).mockResolvedValue(false);
    (listHouseholdMembers as jest.Mock).mockResolvedValue([
      { user_id: 7, username: 'alex', display_name: 'Alex B', email: 'a@x', role: 'member' },
      { user_id: 8, username: 'sam', display_name: null, email: 's@x', role: 'member' },
    ]);
  });

  it("opens the node's Forge test and device scan from their cards", async () => {
    (getNode as jest.Mock).mockResolvedValue(DESKTOP);
    const { findByTestId, getByTestId } = renderScreen();
    fireEvent.press(await findByTestId('node-card-forge-test'));
    expect(mockNavigate).toHaveBeenCalledWith('NodeForgeTest', { nodeId: 'node-1' });
    fireEvent.press(getByTestId('node-card-scan-devices'));
    expect(mockRootNavigate).toHaveBeenCalledWith('SmartHomeSetup', { screen: 'DeviceDiscovery', params: { nodeId: 'node-1' } });
  });

  it('opens a Pi’s settings cards only with its key on this phone', async () => {
    (getNode as jest.Mock).mockResolvedValue(PI);
    const first = renderScreen();
    await first.findByTestId('node-card-credentials');
    await waitFor(() => expect(hasK2).toHaveBeenCalled());
    fireEvent.press(first.getByTestId('node-card-credentials'));
    expect(mockNavigate).not.toHaveBeenCalledWith('NodeSettings', expect.anything());
    expect(first.queryByTestId('node-card-export-key')).toBeNull();
    first.unmount();

    (hasK2 as jest.Mock).mockResolvedValue(true);
    const second = renderScreen();
    await second.findByTestId('node-card-export-key');
    fireEvent.press(second.getByTestId('node-card-credentials'));
    expect(mockNavigate).toHaveBeenCalledWith('Credentials', { nodeId: 'node-1' });
    fireEvent.press(second.getByTestId('node-card-tasks'));
    expect(mockNavigate).toHaveBeenCalledWith('NodeSettings', { nodeId: 'node-1', room: 'Kitchen', tab: 'agents' });
    // Stored data is gated on the key like the other settings-backed cards.
    fireEvent.press(second.getByTestId('node-card-data'));
    expect(mockNavigate).toHaveBeenCalledWith('NodeSettings', { nodeId: 'node-1', room: 'Kitchen', tab: 'stored_data' });
  });

  it('gives a Pi its device cards, a voice profile card, and no stats row', async () => {
    (getNode as jest.Mock).mockResolvedValue(PI);
    const { findByTestId, getByTestId, queryByText } = renderScreen();
    fireEvent.press(await findByTestId('node-card-speaker'));
    expect(mockNavigate).toHaveBeenCalledWith('NodeHardware', { nodeId: 'node-1', part: 'speaker' });
    fireEvent.press(getByTestId('node-card-voice-profile'));
    expect(mockRootNavigate).toHaveBeenCalledWith('VoiceProfile');
    // The server never sent uptime or counts, so the row is gone.
    expect(queryByText('Uptime')).toBeNull();
  });

  it('shows the Raspberry Pi icon and keeps the K2 gate for a Pi', async () => {
    (getNode as jest.Mock).mockResolvedValue(PI);
    const { findByTestId, queryByTestId } = renderScreen();
    const icon = await findByTestId('node-kind-icon');
    expect(icon.props.accessibilityLabel).toBe('Raspberry Pi');
    // No K2 on this phone → no Delete for a Pi, as before.
    expect(queryByTestId('node-delete-button')).toBeNull();
    expect(queryByTestId('node-signout-button')).toBeNull();
  });

  it('offers Delete Node for a Pi whose K2 is on this phone', async () => {
    (hasK2 as jest.Mock).mockResolvedValue(true);
    (getNode as jest.Mock).mockResolvedValue(PI);
    const { findByTestId } = renderScreen();
    expect(await findByTestId('node-delete-button')).toBeTruthy();
  });

  it('shows the robot icon and offers sign-out to the member who paired the computer', async () => {
    (getNode as jest.Mock).mockResolvedValue(DESKTOP);
    const { findByTestId, queryByTestId } = renderScreen();
    const icon = await findByTestId('node-kind-icon');
    expect(icon.props.accessibilityLabel).toBe('Computer');
    expect(await findByTestId('node-signout-button')).toBeTruthy();
    expect(queryByTestId('node-delete-button')).toBeNull();
  });

  it('offers sign-out to a household admin who did not pair it', async () => {
    mockAuth = { user: { id: 99 }, households: [{ id: 'hh-1', role: 'admin' }] };
    (getNode as jest.Mock).mockResolvedValue(DESKTOP);
    const { findByTestId } = renderScreen();
    expect(await findByTestId('node-signout-button')).toBeTruthy();
  });

  it('hides sign-out from another member, even one holding the K2', async () => {
    mockAuth = { user: { id: 99 }, households: [{ id: 'hh-1', role: 'power_user' }] };
    (hasK2 as jest.Mock).mockResolvedValue(true);
    (getNode as jest.Mock).mockResolvedValue(DESKTOP);
    const { findByTestId, queryByTestId } = renderScreen();
    await findByTestId('node-kind-icon');
    await waitFor(() => expect(hasK2).toHaveBeenCalled());
    expect(queryByTestId('node-signout-button')).toBeNull();
    expect(queryByTestId('node-delete-button')).toBeNull();
  });

  it('gives a desktop agent one Hardware card and no Pi device cards', async () => {
    (getNode as jest.Mock).mockResolvedValue(DESKTOP);
    const { findByTestId, queryByTestId } = renderScreen();
    fireEvent.press(await findByTestId('node-card-hardware'));
    expect(mockNavigate).toHaveBeenCalledWith('NodeHardware', { nodeId: 'node-1', part: 'hardware' });
    expect(queryByTestId('node-card-voice')).toBeNull();
    expect(queryByTestId('node-card-voice-profile')).toBeNull();
  });

  it('has no device cards for a docker install', async () => {
    (getNode as jest.Mock).mockResolvedValue({ ...PI, install_mode: 'docker' });
    const { findByTestId, queryByTestId } = renderScreen();
    await findByTestId('node-card-packages');
    expect(queryByTestId('node-card-hardware')).toBeNull();
  });

  describe('Speaks as (a desktop agent\'s signed-in member)', () => {
    it("shows the owner's display name, from the node's household members", async () => {
      mockAuth = { ...mockAuth, user: { id: 99 } };
      (getNode as jest.Mock).mockResolvedValue(DESKTOP);
      const { findByTestId } = renderScreen();
      expect(await findByTestId('node-speaks-as')).toHaveTextContent('Speaks as Alex B');
      expect(listHouseholdMembers).toHaveBeenCalledWith('hh-1', 'tok');
    });

    it('falls back to the username', async () => {
      (getNode as jest.Mock).mockResolvedValue({ ...DESKTOP, owner_user_id: 8 });
      const { findByText } = renderScreen();
      expect(await findByText('Speaks as sam')).toBeTruthy();
    });

    it('says nobody is signed in without an owner', async () => {
      (getNode as jest.Mock).mockResolvedValue({ ...DESKTOP, owner_user_id: null });
      const { findByTestId } = renderScreen();
      expect(await findByTestId('node-speaks-as')).toHaveTextContent('Not signed in: sign in on the computer');
    });

    it('says nobody is signed in when the owner left the household', async () => {
      (getNode as jest.Mock).mockResolvedValue({ ...DESKTOP, owner_user_id: 42 });
      const { findByText } = renderScreen();
      expect(await findByText('Not signed in: sign in on the computer')).toBeTruthy();
    });

    it('leaves the line out when the members cannot be loaded for someone else', async () => {
      mockAuth = { ...mockAuth, user: { id: 99 } };
      (listHouseholdMembers as jest.Mock).mockRejectedValue(new Error('403'));
      (getNode as jest.Mock).mockResolvedValue(DESKTOP);
      const { findByTestId, queryByTestId } = renderScreen();
      await findByTestId('node-kind-icon');
      await waitFor(() => expect(listHouseholdMembers).toHaveBeenCalled());
      expect(queryByTestId('node-speaks-as')).toBeNull();
    });

    it('never shows it for a Pi', async () => {
      (getNode as jest.Mock).mockResolvedValue(PI);
      const { findByTestId, queryByTestId } = renderScreen();
      await findByTestId('node-kind-icon');
      expect(queryByTestId('node-speaks-as')).toBeNull();
      expect(listHouseholdMembers).not.toHaveBeenCalled();
    });
  });
});

describe('Node packages list, the store each package came from', () => {
  const renderPackages = () =>
    render(
      <PaperProvider theme={lightTheme}>
        <PackagesTab nodeId="node-1" householdId="hh-1" />
      </PaperProvider>,
    );
  const STORES = [
    { id: 'a1', url: 'https://pantry-api.jarvisautomation.io', name: 'Public Pantry' },
    { id: 'b2', url: 'http://10.0.0.5:7721', name: 'Workshop' },
  ];
  const tools = {
    client_tools: [
      { function: { name: 'get_sports', description: 'Scores' } },
      { function: { name: 'calculate', description: 'Arithmetic' } },
    ],
    installed_packages: [{ name: 'get_sports', version: '1.1.0', pantry_store_id: 'b2', pantry_store_name: 'Workshop' }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = { user: { id: 7 }, accessToken: 'tok', activeHouseholdId: 'hh-1', households: [{ id: 'hh-1', role: 'member' }] };
    (hasK2 as jest.Mock).mockResolvedValue(true);
    (getNode as jest.Mock).mockResolvedValue(PI);
    (fetchNodeTools as jest.Mock).mockResolvedValue(tools);
  });

  it("names a package's store when the household has several", async () => {
    (getHouseholdSettings as jest.Mock).mockResolvedValue({ 'pantry.stores': STORES });
    const { findByText, queryByText } = renderPackages();
    expect(await findByText('From Workshop\nScores')).toBeTruthy();
    expect(getHouseholdSettings).toHaveBeenCalledWith('hh-1');
    expect(queryByText(/From .*\nArithmetic/)).toBeNull();
  });

  it('names none with a single store', async () => {
    (getHouseholdSettings as jest.Mock).mockResolvedValue({ 'pantry.stores': STORES.slice(0, 1) });
    const { findByText, queryByText } = renderPackages();
    expect(await findByText('Scores')).toBeTruthy();
    expect(queryByText(/From /)).toBeNull();
  });
});
