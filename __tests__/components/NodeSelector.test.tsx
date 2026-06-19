import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';

import NodeSelector from '../../src/components/NodeSelector';
import {
  PendingNodeProvider,
  usePendingNode,
} from '../../src/contexts/PendingNodeContext';
import { lightTheme } from '../../src/theme';
import { getSmartHomeConfig } from '../../src/api/smartHomeApi';

jest.mock('../../src/api/smartHomeApi', () => ({
  getSmartHomeConfig: jest.fn(),
}));

// useFocusEffect needs a navigation context; emulate it as a one-shot effect
// and expose the latest callback so a test can simulate a *re*-focus.
let mockFocusCb: (() => void) | null = null;
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = require('react');
    mockFocusCb = cb;
    useEffect(() => {
      cb();
    }, [cb]);
  },
}));

const mockedGetConfig = getSmartHomeConfig as jest.MockedFunction<typeof getSmartHomeConfig>;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

const config = (nodes: any[], primary = 'node-1') => ({
  device_manager: 'home_assistant',
  primary_node_id: primary,
  use_external_devices: false,
  nodes,
});

// Renders NodeSelector inside the real PendingNodeProvider and hands the test a
// way to drive markPending — so clearPending actually nulls the marker (the real
// stop-polling path), not a no-op.
let pendingCtx: ReturnType<typeof usePendingNode> | null = null;
const Capture = () => {
  pendingCtx = usePendingNode();
  return null;
};
const renderWithPending = (props: any) =>
  render(
    <PendingNodeProvider>
      <Capture />
      <NodeSelector {...props} />
    </PendingNodeProvider>,
    { wrapper },
  );

describe('NodeSelector', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockFocusCb = null;
    pendingCtx = null;
    await AsyncStorage.clear();
  });

  it('returns null when no nodes are available', async () => {
    mockedGetConfig.mockResolvedValue(config([]));

    const onSelectNode = jest.fn();
    const { toJSON } = render(
      <NodeSelector householdId="hh-1" selectedNodeId={null} onSelectNode={onSelectNode} />,
      { wrapper },
    );

    await waitFor(() => {
      expect(mockedGetConfig).toHaveBeenCalledWith('hh-1');
    });

    // With 0 nodes (and nothing pending), the component returns null.
    const tree = JSON.stringify(toJSON());
    expect(tree).not.toContain('Select node');
    expect(tree).not.toContain('online');
  });

  it('renders selected node label (room name)', async () => {
    mockedGetConfig.mockResolvedValue(
      config([{ node_id: 'node-1', room: 'Living Room', online: true, last_seen: null }]),
    );

    const { findByText } = render(
      <NodeSelector householdId="hh-1" selectedNodeId="node-1" onSelectNode={jest.fn()} />,
      { wrapper },
    );

    expect(await findByText('Living Room')).toBeTruthy();
  });

  it('shows online count when multiple nodes', async () => {
    mockedGetConfig.mockResolvedValue(
      config([
        { node_id: 'node-1', room: 'Office', online: true, last_seen: null },
        { node_id: 'node-2', room: 'Kitchen', online: true, last_seen: null },
        { node_id: 'node-3', room: 'Bedroom', online: false, last_seen: null },
      ]),
    );

    const { findByText } = render(
      <NodeSelector householdId="hh-1" selectedNodeId="node-1" onSelectNode={jest.fn()} />,
      { wrapper },
    );

    expect(await findByText('2/3 online')).toBeTruthy();
  });

  it('calls onSelectNode with primary node on mount when no node selected', async () => {
    const onSelectNode = jest.fn();
    mockedGetConfig.mockResolvedValue(
      config([
        { node_id: 'node-1', room: 'Office', online: true, last_seen: null },
        { node_id: 'node-2', room: 'Kitchen', online: true, last_seen: null },
      ]),
    );

    render(
      <NodeSelector householdId="hh-1" selectedNodeId={null} onSelectNode={onSelectNode} />,
      { wrapper },
    );

    await waitFor(() => {
      expect(onSelectNode).toHaveBeenCalledWith('node-1');
    });
  });

  it('falls back to first online node if primary is offline', async () => {
    const onSelectNode = jest.fn();
    mockedGetConfig.mockResolvedValue(
      config([
        { node_id: 'node-1', room: 'Office', online: false, last_seen: null },
        { node_id: 'node-2', room: 'Kitchen', online: true, last_seen: null },
      ]),
    );

    render(
      <NodeSelector householdId="hh-1" selectedNodeId={null} onSelectNode={onSelectNode} />,
      { wrapper },
    );

    await waitFor(() => {
      expect(onSelectNode).toHaveBeenCalledWith('node-2');
    });
  });

  it('never selects an empty id when no node is online and primary is unset', async () => {
    const onSelectNode = jest.fn();
    // Fresh household: backend returns primary_node_id='' and the only node is offline.
    mockedGetConfig.mockResolvedValue(
      config([{ node_id: 'node-7', room: 'Garage', online: false, last_seen: null }], ''),
    );

    render(
      <NodeSelector householdId="hh-1" selectedNodeId={null} onSelectNode={onSelectNode} />,
      { wrapper },
    );

    await waitFor(() => {
      expect(onSelectNode).toHaveBeenCalledWith('node-7');
    });
    expect(onSelectNode).not.toHaveBeenCalledWith('');
  });

  it('shows a "setting up" indicator while a pending node has not appeared', async () => {
    mockedGetConfig.mockResolvedValue(config([])); // node-new not registered yet

    const { findByText } = renderWithPending({
      householdId: 'hh-1',
      selectedNodeId: null,
      onSelectNode: jest.fn(),
    });

    await act(async () => {});
    await act(async () => {
      pendingCtx!.markPending('node-new', 'hh-1');
    });

    expect(await findByText('Setting up new node…')).toBeTruthy();
  });

  it('ignores a pending node that belongs to a different household', async () => {
    mockedGetConfig.mockResolvedValue(config([])); // current household has no nodes

    const { queryByText } = renderWithPending({
      householdId: 'hh-1',
      selectedNodeId: null,
      onSelectNode: jest.fn(),
    });

    await act(async () => {});
    await act(async () => {
      pendingCtx!.markPending('node-elsewhere', 'hh-OTHER');
    });
    await act(async () => {});

    // Marker is for another household → no "setting up" indicator, no polling.
    expect(queryByText('Setting up new node…')).toBeNull();
  });

  it('polls and auto-selects a pending node once it comes online, then stops', async () => {
    jest.useFakeTimers();
    try {
      const onSelectNode = jest.fn();
      const onPendingNodeReady = jest.fn();

      mockedGetConfig.mockResolvedValue(
        config([{ node_id: 'node-1', room: 'Office', online: true, last_seen: null }]),
      );

      const { queryByText } = renderWithPending({
        householdId: 'hh-1',
        selectedNodeId: null,
        onSelectNode,
        onPendingNodeReady,
      });

      await act(async () => {}); // initial load (no pending yet)
      await act(async () => {
        pendingCtx!.markPending('node-new', 'hh-1');
      });
      await act(async () => {}); // poll active, node still absent
      expect(onPendingNodeReady).not.toHaveBeenCalled();

      // The Pi boots and registers — now it shows up online.
      mockedGetConfig.mockResolvedValue(
        config([
          { node_id: 'node-1', room: 'Office', online: true, last_seen: null },
          { node_id: 'node-new', room: 'Kitchen', online: true, last_seen: null },
        ]),
      );

      // Next poll tick picks it up, selects it, announces it, clears pending.
      await act(async () => {
        jest.advanceTimersByTime(4000);
      });
      await act(async () => {}); // flush the loadConfig promise chain + re-render

      expect(onSelectNode).toHaveBeenCalledWith('node-new');
      expect(onPendingNodeReady).toHaveBeenCalledTimes(1);
      expect(queryByText('Setting up new node…')).toBeNull();

      // Polling has stopped — further ticks fire no more requests/announcements.
      const callsAfter = mockedGetConfig.mock.calls.length;
      await act(async () => {
        jest.advanceTimersByTime(12000);
      });
      await act(async () => {});
      expect(onPendingNodeReady).toHaveBeenCalledTimes(1);
      expect(mockedGetConfig.mock.calls.length).toBe(callsAfter);
    } finally {
      jest.useRealTimers();
    }
  });

  it('re-fetches on a subsequent screen focus (first focus is skipped)', async () => {
    const onSelectNode = jest.fn();
    mockedGetConfig.mockResolvedValue(
      config([{ node_id: 'node-1', room: 'Office', online: true, last_seen: null }]),
    );

    render(
      <NodeSelector householdId="hh-1" selectedNodeId="node-1" onSelectNode={onSelectNode} />,
      { wrapper },
    );

    await waitFor(() => expect(mockedGetConfig).toHaveBeenCalled());
    const callsAfterMount = mockedGetConfig.mock.calls.length; // initial load; first focus skipped

    // A node was added elsewhere; returning to the chat tab should pick it up.
    mockedGetConfig.mockResolvedValue(
      config([
        { node_id: 'node-1', room: 'Office', online: true, last_seen: null },
        { node_id: 'node-2', room: 'Den', online: true, last_seen: null },
      ]),
    );
    await act(async () => {
      mockFocusCb?.();
    });

    await waitFor(() => {
      expect(mockedGetConfig.mock.calls.length).toBeGreaterThan(callsAfterMount);
    });
  });
});
