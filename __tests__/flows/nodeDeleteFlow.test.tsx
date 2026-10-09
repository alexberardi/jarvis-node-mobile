import React from 'react';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import { OverviewTab } from '../../src/screens/Nodes/NodeDetailScreen';
import { lightTheme } from '../../src/theme';
import { startFactoryReset, waitForFactoryReset } from '../../src/api/nodeApi';
import { deleteK2 } from '../../src/services/k2Service';

// L1 FLOW INTEGRATION — the node-delete state machine (confirm → running →
// done/queued/error) wired to the tracked factory reset (jarvisd D10:
// startFactoryReset + waitForFactoryReset task polling) + best-effort deleteK2
// + navigation.
// Renders the real OverviewTab (exported for this) inside a real PaperProvider
// (Portal host for the modal); only the API/native leaves are mocked. A
// destructive, ships-to-store action whose error UX is easy to ship broken.

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('../../src/api/nodeApi', () => ({
  startFactoryReset: jest.fn(),
  waitForFactoryReset: jest.fn(),
}));
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

const renderTab = (canDelete = true, overrides: Record<string, unknown> = {}) =>
  render(
    <PaperProvider theme={lightTheme}>
      <OverviewTab node={{ ...NODE, ...overrides }} canDelete={canDelete} />
    </PaperProvider>,
  );

const task = (state: string, error_message: string | null = null) => ({
  id: 'task-1',
  node_id: 'node-abc',
  kind: 'factory_reset',
  target_version: null,
  state,
  error_message,
  created_at: '2026-10-08T00:00:00',
  updated_at: '2026-10-08T00:00:00',
  finished_at: null,
});

const confirmDelete = (getByTestId: (id: string) => any) => {
  fireEvent.press(getByTestId('node-delete-button'));
  fireEvent.press(getByTestId('node-delete-confirm'));
};

describe('Node delete — flow integration (OverviewTab tracked factory reset)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (startFactoryReset as jest.Mock).mockResolvedValue({ taskId: 'task-1', alreadyInFlight: false });
  });

  it('confirm → start reset → poll to success → K2 cleanup → Done navigates to NodeList', async () => {
    (waitForFactoryReset as jest.Mock).mockResolvedValue(task('success'));
    (deleteK2 as jest.Mock).mockResolvedValue(undefined);
    const { getByTestId, findByTestId, findByText } = renderTab();

    confirmDelete(getByTestId);

    await waitFor(() => expect(startFactoryReset).toHaveBeenCalledWith('node-abc'));
    expect(waitForFactoryReset).toHaveBeenCalledWith('task-1', expect.objectContaining({ timeoutMs: 45000 }));
    await findByText('Node reset');
    expect(deleteK2).toHaveBeenCalledWith('node-abc');
    expect(mockNavigate).not.toHaveBeenCalled();

    fireEvent.press(await findByTestId('node-delete-done'));
    expect(mockNavigate).toHaveBeenCalledWith('NodeList');
  });

  it('shows the task progress while it polls', async () => {
    let finish: (v: unknown) => void = () => {};
    (waitForFactoryReset as jest.Mock).mockImplementation((_id, opts) => {
      opts.onUpdate(task('in_progress'));
      return new Promise((r) => { finish = r; });
    });
    const { getByTestId, findByText } = renderTab();

    confirmDelete(getByTestId);

    await findByText('living_room is wiping itself…');
    expect(getByTestId('node-delete-progress')).toBeTruthy();
    await act(async () => finish(task('success')));
    await findByText('Node reset');
  });

  it('still finishes when the best-effort K2 cleanup throws', async () => {
    (waitForFactoryReset as jest.Mock).mockResolvedValue(task('success'));
    (deleteK2 as jest.Mock).mockRejectedValue(new Error('no local k2'));
    const { getByTestId, findByText } = renderTab();

    confirmDelete(getByTestId);

    await findByText('Node reset');
  });

  it('offline node: the reset is queued, K2 is kept, OK returns to NodeList', async () => {
    (waitForFactoryReset as jest.Mock).mockResolvedValue(task('dispatched'));
    const { getByTestId, findByText } = renderTab(true, { online: false });

    confirmDelete(getByTestId);

    await findByText('Reset queued');
    expect(waitForFactoryReset).toHaveBeenCalledWith('task-1', expect.objectContaining({ timeoutMs: 8000 }));
    expect(deleteK2).not.toHaveBeenCalled();
    fireEvent.press(getByTestId('node-delete-queued-close'));
    expect(mockNavigate).toHaveBeenCalledWith('NodeList');
  });

  it('shows the node-reported error when the task fails, and does NOT navigate', async () => {
    (waitForFactoryReset as jest.Mock).mockResolvedValue(task('failed', 'Disk is read-only'));
    const { getByTestId, findByText } = renderTab();

    confirmDelete(getByTestId);

    await findByText('Reset failed');
    await findByText('Disk is read-only');
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(deleteK2).not.toHaveBeenCalled();
  });

  it('shows the error state when starting the reset fails', async () => {
    (startFactoryReset as jest.Mock).mockRejectedValue(new Error('Request failed with status code 403'));
    const { getByTestId, findByText } = renderTab();

    confirmDelete(getByTestId);

    await findByText('Reset failed');
    await findByText('Request failed with status code 403');
    expect(waitForFactoryReset).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('cancel closes the dialog without resetting', () => {
    const { getByTestId, queryByTestId } = renderTab();

    fireEvent.press(getByTestId('node-delete-button'));
    fireEvent.press(getByTestId('node-delete-cancel'));

    expect(startFactoryReset).not.toHaveBeenCalled();
    expect(queryByTestId('node-delete-confirm')).toBeNull();
  });

  it('hides the Danger Zone entirely when the user cannot delete', () => {
    const { queryByTestId } = renderTab(false);
    expect(queryByTestId('node-delete-button')).toBeNull();
  });
});
