import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider } from 'react-native-paper';

import RoutineEditScreen from '../../src/screens/Routines/RoutineEditScreen';
import { lightTheme } from '../../src/theme';
import { getSmartHomeConfig } from '../../src/api/smartHomeApi';

// L1 FLOW — the routine editor's command catalog comes from a node's settings snapshot.
// A desktop computer that just signed in again has no encryption key, and the editor used
// to wait 30 s and say "Node did not respond in time. Is it online?". Now it says the key
// is missing and offers to set one up, which loads the catalog.

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() }),
    useRoute: () => ({ params: {} }),
  };
});
jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ state: { accessToken: 'tok', activeHouseholdId: 'hh-1' } }),
}));
jest.mock('../../src/api/smartHomeApi', () => ({ getSmartHomeConfig: jest.fn() }));
jest.mock('../../src/api/routineApi', () => ({
  createRoutine: jest.fn(),
  deleteRoutine: jest.fn(),
  getRoutine: jest.fn(),
  updateRoutine: jest.fn(),
}));
jest.mock('../../src/components/HelpIcon', () => ({ HelpIcon: () => null }));
jest.mock('../../src/hooks/useNodeKinds', () => ({ useNodeKinds: () => ({}) }));

const mockProvisionKey = jest.fn();
const mockSnapshot = jest.fn();
jest.mock('../../src/hooks/useSettingsSnapshot', () => ({
  useSettingsSnapshot: (opts: unknown) => mockSnapshot(opts),
}));

const renderScreen = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PaperProvider theme={lightTheme}>
        <RoutineEditScreen />
      </PaperProvider>
    </QueryClientProvider>,
  );
};

describe('Routine editor — a catalog node with no encryption key', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getSmartHomeConfig as jest.Mock).mockResolvedValue({
      nodes: [{ node_id: 'desk-1', room: 'desktop', online: true }],
      primary_node_id: 'desk-1',
    });
  });

  it('offers to set up the key instead of calling the node unreachable', async () => {
    mockSnapshot.mockReturnValue({
      snapshot: null,
      state: 'needs_k2',
      error: "This device doesn't have an encryption key yet, so it can't share its commands or settings.",
      resolvedNodeId: 'desk-1',
      refetch: jest.fn(),
      provisionKey: mockProvisionKey,
    });

    const screen = renderScreen();

    await waitFor(() => expect(screen.getByTestId('routine-catalog-needs-k2')).toBeTruthy());
    expect(screen.queryByText(/did not respond/i)).toBeNull();
    expect(screen.queryByText(/Pick a different node with “Commands from” above\.$/)).toBeNull();
    fireEvent.press(screen.getByText('Set up encryption key'));
    expect(mockProvisionKey).toHaveBeenCalledTimes(1);
  });

  it('keeps the plain error for a node that really did not answer', async () => {
    mockSnapshot.mockReturnValue({
      snapshot: null,
      state: 'timeout',
      error: 'Node did not respond in time. Is it online?',
      resolvedNodeId: 'desk-1',
      refetch: jest.fn(),
      provisionKey: mockProvisionKey,
    });

    const screen = renderScreen();

    await waitFor(() => expect(screen.getByText(/did not respond in time/)).toBeTruthy());
    expect(screen.queryByText('Set up encryption key')).toBeNull();
  });
});
