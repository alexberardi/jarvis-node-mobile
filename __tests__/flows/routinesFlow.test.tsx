import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider } from 'react-native-paper';

import RoutineListScreen from '../../src/screens/Routines/RoutineListScreen';
import { lightTheme } from '../../src/theme';
import { listRoutines, deleteRoutine, runRoutineNow } from '../../src/api/routineApi';
import { getSmartHomeConfig } from '../../src/api/smartHomeApi';

// L1 FLOW INTEGRATION — the Routines list (was zero coverage): React-Query load +
// card rendering (schedule/trigger/steps), run-on-node (single-node direct run →
// result Alert), swipe→Alert→deleteRoutine→refetch, FAB→create, and error+Retry.
// Real screen + real query state; mocks only the api/auth/navigation leaves.

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const ReactLocal = require('react');
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
    useFocusEffect: (cb: any) => ReactLocal.useEffect(() => cb(), []),
  };
});

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ state: { activeHouseholdId: 'hh-1', households: [{ id: 'hh-1', name: 'Home', role: 'admin' }] } }),
}));

jest.mock('../../src/api/routineApi', () => ({
  listRoutines: jest.fn(),
  deleteRoutine: jest.fn(),
  runRoutineNow: jest.fn(),
}));
jest.mock('../../src/api/smartHomeApi', () => ({ getSmartHomeConfig: jest.fn() }));

// Expose the swipe delete action without a real gesture (same pattern as memories).
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const ReactLocal = require('react');
  return {
    __esModule: true,
    default: ({ children, renderRightActions }: any) =>
      ReactLocal.createElement(
        ReactLocal.Fragment,
        null,
        children,
        renderRightActions ? renderRightActions({ value: 0 }, { value: 0 }) : null,
      ),
  };
});

const ROUTINE = {
  id: 'r1',
  name: 'Movie night',
  schedule: { type: 'interval', interval_seconds: 3600 },
  trigger_phrases: ['movie time'],
  steps: [{ command: 'a' }, { command: 'b' }],
};

const renderScreen = () => {
  // gcTime: 0 so inactive query caches don't keep a 5-min gc timer alive after
  // the test (which makes `jest` linger without --forceExit).
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PaperProvider theme={lightTheme}>
        <RoutineListScreen />
      </PaperProvider>
    </QueryClientProvider>,
  );
};

describe('Routines list — flow integration (load, run, delete, create)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listRoutines as jest.Mock).mockResolvedValue([ROUTINE]);
    (getSmartHomeConfig as jest.Mock).mockResolvedValue({ nodes: [], primary_node_id: null });
    (deleteRoutine as jest.Mock).mockResolvedValue(undefined);
    (runRoutineNow as jest.Mock).mockResolvedValue({ success: true, message: 'Lights dimmed' });
  });

  it('loads routines and renders the card (name, trigger, steps, schedule)', async () => {
    const { findByText, getByText } = renderScreen();
    await findByText('Movie night');
    expect(getByText('movie time')).toBeTruthy();
    expect(getByText('2 steps')).toBeTruthy();
    expect(getByText('Every 1h')).toBeTruthy();
    expect(listRoutines).toHaveBeenCalledWith('hh-1');
  });

  it('runs the routine on the only known node and alerts the result', async () => {
    (getSmartHomeConfig as jest.Mock).mockResolvedValue({
      nodes: [{ node_id: 'n1', room: 'Living Room' }],
      primary_node_id: 'n1',
    });
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { findByText, getByTestId } = renderScreen();
    await findByText('Movie night');

    fireEvent.press(getByTestId('routine-run-r1'));

    await waitFor(() => expect(runRoutineNow).toHaveBeenCalledWith('hh-1', 'r1', 'n1'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Movie night', 'Lights dimmed'));
    alertSpy.mockRestore();
  });

  it('swipe-delete → Alert confirm → deleteRoutine → refetch', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { findByText, getByTestId } = renderScreen();
    await findByText('Movie night');
    (listRoutines as jest.Mock).mockClear();

    fireEvent.press(getByTestId('routine-delete-r1'));

    const buttons = alertSpy.mock.calls[0][2] as any[];
    const del = buttons.find((b) => b.text === 'Delete');
    await act(async () => {
      await del.onPress();
    });

    expect(deleteRoutine).toHaveBeenCalledWith('hh-1', 'r1');
    await waitFor(() => expect(listRoutines).toHaveBeenCalled()); // refetch
    alertSpy.mockRestore();
  });

  it('FAB navigates to create a new routine', async () => {
    const { findByText, getByTestId } = renderScreen();
    await findByText('Movie night');
    fireEvent.press(getByTestId('routine-add-fab'));
    expect(mockNavigate).toHaveBeenCalledWith('RoutineEdit', {});
  });

  it('shows an error + Retry that refetches on failure', async () => {
    (listRoutines as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const { findByText, getByText } = renderScreen();
    await findByText('Could not load routines.');

    (listRoutines as jest.Mock).mockResolvedValueOnce([ROUTINE]);
    fireEvent.press(getByText('Retry'));
    await findByText('Movie night');
  });
});
