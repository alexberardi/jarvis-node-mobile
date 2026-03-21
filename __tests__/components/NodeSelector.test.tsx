import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import NodeSelector from '../../src/components/NodeSelector';
import { lightTheme } from '../../src/theme';
import { getSmartHomeConfig } from '../../src/api/smartHomeApi';

jest.mock('../../src/api/smartHomeApi', () => ({
  getSmartHomeConfig: jest.fn(),
}));

const mockedGetConfig = getSmartHomeConfig as jest.MockedFunction<typeof getSmartHomeConfig>;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

describe('NodeSelector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when no nodes are available', async () => {
    mockedGetConfig.mockResolvedValue({
      device_manager: 'home_assistant',
      primary_node_id: 'node-1',
      use_external_devices: false,
      nodes: [],
    });

    const onSelectNode = jest.fn();
    const { toJSON } = render(
      <NodeSelector
        householdId="hh-1"
        selectedNodeId={null}
        onSelectNode={onSelectNode}
      />,
      { wrapper },
    );

    await waitFor(() => {
      expect(mockedGetConfig).toHaveBeenCalledWith('hh-1');
    });

    // With 0 nodes, the component returns null inside the wrapper.
    // Verify no node-related content is rendered (no button, no online count).
    const tree = JSON.stringify(toJSON());
    expect(tree).not.toContain('Select node');
    expect(tree).not.toContain('online');
  });

  it('renders selected node label (room name)', async () => {
    mockedGetConfig.mockResolvedValue({
      device_manager: 'home_assistant',
      primary_node_id: 'node-1',
      use_external_devices: false,
      nodes: [
        { node_id: 'node-1', room: 'Living Room', online: true, last_seen: null },
      ],
    });

    const { findByText } = render(
      <NodeSelector
        householdId="hh-1"
        selectedNodeId="node-1"
        onSelectNode={jest.fn()}
      />,
      { wrapper },
    );

    expect(await findByText('Living Room')).toBeTruthy();
  });

  it('shows online count when multiple nodes', async () => {
    mockedGetConfig.mockResolvedValue({
      device_manager: 'home_assistant',
      primary_node_id: 'node-1',
      use_external_devices: false,
      nodes: [
        { node_id: 'node-1', room: 'Office', online: true, last_seen: null },
        { node_id: 'node-2', room: 'Kitchen', online: true, last_seen: null },
        { node_id: 'node-3', room: 'Bedroom', online: false, last_seen: null },
      ],
    });

    const { findByText } = render(
      <NodeSelector
        householdId="hh-1"
        selectedNodeId="node-1"
        onSelectNode={jest.fn()}
      />,
      { wrapper },
    );

    expect(await findByText('2/3 online')).toBeTruthy();
  });

  it('calls onSelectNode with primary node on mount when no node selected', async () => {
    const onSelectNode = jest.fn();
    mockedGetConfig.mockResolvedValue({
      device_manager: 'home_assistant',
      primary_node_id: 'node-1',
      use_external_devices: false,
      nodes: [
        { node_id: 'node-1', room: 'Office', online: true, last_seen: null },
        { node_id: 'node-2', room: 'Kitchen', online: true, last_seen: null },
      ],
    });

    render(
      <NodeSelector
        householdId="hh-1"
        selectedNodeId={null}
        onSelectNode={onSelectNode}
      />,
      { wrapper },
    );

    await waitFor(() => {
      expect(onSelectNode).toHaveBeenCalledWith('node-1');
    });
  });

  it('falls back to first online node if primary is offline', async () => {
    const onSelectNode = jest.fn();
    mockedGetConfig.mockResolvedValue({
      device_manager: 'home_assistant',
      primary_node_id: 'node-1',
      use_external_devices: false,
      nodes: [
        { node_id: 'node-1', room: 'Office', online: false, last_seen: null },
        { node_id: 'node-2', room: 'Kitchen', online: true, last_seen: null },
      ],
    });

    render(
      <NodeSelector
        householdId="hh-1"
        selectedNodeId={null}
        onSelectNode={onSelectNode}
      />,
      { wrapper },
    );

    await waitFor(() => {
      expect(onSelectNode).toHaveBeenCalledWith('node-2');
    });
  });
});
