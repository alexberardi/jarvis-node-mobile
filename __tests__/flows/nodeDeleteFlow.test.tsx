import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import { OverviewTab } from '../../src/screens/Nodes/NodeDetailScreen';
import { lightTheme } from '../../src/theme';
import { deleteNode } from '../../src/api/nodeApi';
import { deleteK2 } from '../../src/services/k2Service';

// L1 FLOW INTEGRATION — the node-delete state machine (confirm → running →
// closed/error) wired to the real deleteNode + best-effort deleteK2 + navigation.
// Renders the real OverviewTab (exported for this) inside a real PaperProvider
// (Portal host for the modal); only the API/native leaves are mocked. A
// destructive, ships-to-store action whose error UX is easy to ship broken.

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('../../src/api/nodeApi', () => ({ deleteNode: jest.fn() }));
jest.mock('../../src/services/k2Service', () => ({ deleteK2: jest.fn(), hasK2: jest.fn() }));
// NodeUpdateSection does its own data fetching; not under test here.
jest.mock('../../src/components/NodeUpdateSection', () => ({ NodeUpdateSection: () => null }));

const NODE = {
  node_id: 'node-abc',
  room: 'living_room',
  online: true,
  last_seen: '2026-06-23T00:00:00Z',
  uptime_seconds: 3600,
  command_count: 5,
  routine_count: 2,
} as any;

const renderTab = (canDelete = true) =>
  render(
    <PaperProvider theme={lightTheme}>
      <OverviewTab node={NODE} canDelete={canDelete} />
    </PaperProvider>,
  );

describe('Node delete — flow integration (OverviewTab delete state machine)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('confirm → deleteNode + best-effort deleteK2 → navigate back to NodeList', async () => {
    (deleteNode as jest.Mock).mockResolvedValue(undefined);
    (deleteK2 as jest.Mock).mockResolvedValue(undefined);
    const { getByTestId } = renderTab();

    fireEvent.press(getByTestId('node-delete-button'));
    fireEvent.press(getByTestId('node-delete-confirm'));

    await waitFor(() => expect(deleteNode).toHaveBeenCalledWith('node-abc'));
    expect(deleteK2).toHaveBeenCalledWith('node-abc');
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('NodeList'));
  });

  it('navigates even when the best-effort K2 cleanup throws (must not block delete)', async () => {
    (deleteNode as jest.Mock).mockResolvedValue(undefined);
    (deleteK2 as jest.Mock).mockRejectedValue(new Error('no local k2'));
    const { getByTestId } = renderTab();

    fireEvent.press(getByTestId('node-delete-button'));
    fireEvent.press(getByTestId('node-delete-confirm'));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('NodeList'));
  });

  it('shows the error state and does NOT navigate when deleteNode fails', async () => {
    (deleteNode as jest.Mock).mockRejectedValue(new Error('node offline'));
    const { getByTestId, findByText } = renderTab();

    fireEvent.press(getByTestId('node-delete-button'));
    fireEvent.press(getByTestId('node-delete-confirm'));

    await findByText('Delete failed');
    await findByText('node offline');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('cancel closes the dialog without deleting', () => {
    const { getByTestId, queryByTestId } = renderTab();

    fireEvent.press(getByTestId('node-delete-button'));
    fireEvent.press(getByTestId('node-delete-cancel'));

    expect(deleteNode).not.toHaveBeenCalled();
    expect(queryByTestId('node-delete-confirm')).toBeNull();
  });

  it('hides the Danger Zone entirely when the user cannot delete', () => {
    const { queryByTestId } = renderTab(false);
    expect(queryByTestId('node-delete-button')).toBeNull();
  });
});
