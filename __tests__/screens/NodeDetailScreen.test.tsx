import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import NodeDetailScreen from '../../src/screens/Nodes/NodeDetailScreen';
import { lightTheme } from '../../src/theme';
import { getNode } from '../../src/api/nodeApi';
import { hasK2 } from '../../src/services/k2Service';

// NodeDetailScreen's per-kind wiring: which icon, which tabs, and who sees the
// Danger Zone. A Pi's delete is gated on holding its K2 on this phone (today's
// rule); a desktop agent's sign-out on cc's rule (owner or household admin).

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: { nodeId: 'node-1' } }),
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
jest.mock('../../src/services/k2Service', () => ({ deleteK2: jest.fn(), hasK2: jest.fn() }));
jest.mock('../../src/components/NodeUpdateSection', () => ({ NodeUpdateSection: () => null }));
jest.mock('../../src/screens/Nodes/HardwareTab', () => {
  const { Text } = require('react-native');
  return { HardwareTab: () => <Text>hardware-tab-body</Text> };
});

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
    mockAuth = { user: { id: 7 }, households: [{ id: 'hh-1', role: 'member' }] };
    (hasK2 as jest.Mock).mockResolvedValue(false);
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

  it('keeps the Hardware tab for a desktop agent', async () => {
    (getNode as jest.Mock).mockResolvedValue(DESKTOP);
    const { findByText } = renderScreen();
    fireEvent.press(await findByText('Hardware'));
    expect(await findByText('hardware-tab-body')).toBeTruthy();
  });
});
