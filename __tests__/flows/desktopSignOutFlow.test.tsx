import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import { OverviewTab } from '../../src/screens/Nodes/NodeDetailScreen';
import { lightTheme } from '../../src/theme';
import { removeNode, signOutNode, startFactoryReset, waitForFactoryReset } from '../../src/api/nodeApi';
import { deleteK2 } from '../../src/services/k2Service';

// L1 FLOW INTEGRATION — a desktop agent's "Delete" is a sign-out (decision
// 2026-10-14). The real OverviewTab inside a real PaperProvider; only the API
// and native leaves are mocked. A Pi keeps the tracked factory reset
// (nodeDeleteFlow.test.tsx); here we prove a computer never gets one.

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('../../src/api/nodeApi', () => ({
  startFactoryReset: jest.fn(),
  waitForFactoryReset: jest.fn(),
  removeNode: jest.fn(),
  signOutNode: jest.fn(),
  nodeErrorMessage: (e: any, fb: string) => e?.response?.data?.detail ?? e?.message ?? fb,
}));
jest.mock('../../src/services/k2Service', () => ({ deleteK2: jest.fn(), hasK2: jest.fn() }));
jest.mock('../../src/components/NodeUpdateSection', () => ({ NodeUpdateSection: () => null }));

const DESKTOP = {
  node_id: 'agent-1',
  room: 'Office PC',
  online: true,
  last_seen: '2026-10-14T00:00:00Z',
  uptime_seconds: 60,
  command_count: 0,
  routine_count: 0,
  node_kind: 'desktop',
  install_mode: 'desktop-agent',
  household_id: 'hh-1',
  owner_user_id: 7,
} as any;

const renderTab = (overrides: Record<string, unknown> = {}, canDelete = true) =>
  render(
    <PaperProvider theme={lightTheme}>
      <OverviewTab node={{ ...DESKTOP, ...overrides }} canDelete={canDelete} />
    </PaperProvider>,
  );

describe('Desktop agent sign-out — flow integration (OverviewTab)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (deleteK2 as jest.Mock).mockResolvedValue(undefined);
  });

  it('uses desktop wording, not the Pi factory-reset wording', () => {
    const { getByText, getByTestId, queryByText } = renderTab();
    expect(getByTestId('node-signout-button')).toHaveTextContent(/Sign out this computer/);
    expect(queryByText(/Factory-resets this node/)).toBeNull();
    expect(queryByText('Delete Node')).toBeNull();
    expect(getByText(/Its settings on\s+the computer are kept/)).toBeTruthy();
  });

  it('confirm → sign-out route → K2 cleanup → Done returns to NodeList; never a factory reset', async () => {
    (signOutNode as jest.Mock).mockResolvedValue(undefined);
    const { getByTestId, findByText, getByText } = renderTab();

    fireEvent.press(getByTestId('node-signout-button'));
    expect(getByText('Sign out Office PC?')).toBeTruthy();
    expect(
      getByText(/It will stop working with Jarvis Automation until someone signs in on it again/),
    ).toBeTruthy();
    fireEvent.press(getByTestId('node-signout-confirm'));

    await waitFor(() => expect(signOutNode).toHaveBeenCalledWith('agent-1'));
    await findByText('Signed out');
    expect(deleteK2).toHaveBeenCalledWith('agent-1');
    expect(startFactoryReset).not.toHaveBeenCalled();
    expect(waitForFactoryReset).not.toHaveBeenCalled();
    expect(removeNode).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('node-signout-done'));
    expect(mockNavigate).toHaveBeenCalledWith('NodeList');
  });

  it('shows progress while the sign-out is in flight', async () => {
    let finish: () => void = () => {};
    (signOutNode as jest.Mock).mockImplementation(
      () => new Promise<void>((r) => { finish = r; }),
    );
    const { getByTestId, findByTestId, findByText } = renderTab();

    fireEvent.press(getByTestId('node-signout-button'));
    fireEvent.press(getByTestId('node-signout-confirm'));
    expect(await findByTestId('node-signout-progress')).toHaveTextContent(/Signing Office PC out/);
    await act(async () => finish());
    await findByText('Signed out');
  });

  it('mentions that an offline computer finds out when it reconnects', () => {
    const { getByTestId, getByText } = renderTab({ online: false });
    fireEvent.press(getByTestId('node-signout-button'));
    expect(getByText(/finds out the next time it connects/)).toBeTruthy();
  });

  it('shows the server message on a 403 and does not navigate', async () => {
    (signOutNode as jest.Mock).mockRejectedValue({
      response: { status: 403, data: { detail: 'Only the member who added this device, or a household admin, can sign it out' } },
    });
    const { getByTestId, findByText } = renderTab();

    fireEvent.press(getByTestId('node-signout-button'));
    fireEvent.press(getByTestId('node-signout-confirm'));

    await findByText('Sign-out failed');
    await findByText('Only the member who added this device, or a household admin, can sign it out');
    expect(deleteK2).not.toHaveBeenCalled();
    fireEvent.press(getByTestId('node-delete-error-close'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('cancel closes without signing out', () => {
    const { getByTestId, queryByText } = renderTab();
    fireEvent.press(getByTestId('node-signout-button'));
    fireEvent.press(getByTestId('node-signout-cancel'));
    expect(signOutNode).not.toHaveBeenCalled();
    expect(queryByText('Sign out Office PC?')).toBeNull();
  });

  it('recognises an agent by install_mode when node_kind is missing', () => {
    const { getByTestId } = renderTab({ node_kind: null });
    expect(getByTestId('node-signout-button')).toBeTruthy();
  });

  it('hides the sign-out entirely when the user may not sign it out', () => {
    const { queryByTestId, queryByText } = renderTab({}, false);
    expect(queryByTestId('node-signout-button')).toBeNull();
    expect(queryByText('Danger Zone')).toBeNull();
  });
});
