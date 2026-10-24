import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider } from 'react-native-paper';

import RoutineEditScreen from '../../src/screens/Routines/RoutineEditScreen';
import { lightTheme } from '../../src/theme';
import { getSmartHomeConfig } from '../../src/api/smartHomeApi';
import { createRoutine } from '../../src/api/routineApi';

// The controls .maestro/routines.yaml drives by testID: name, trigger phrase, a free-text
// step command (no catalog without a key), save.

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: jest.fn(), goBack: mockGoBack, setOptions: jest.fn() }),
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
jest.mock('../../src/hooks/useSettingsSnapshot', () => ({
  useSettingsSnapshot: () => ({
    snapshot: null,
    state: 'needs_k2',
    error: 'No key.',
    resolvedNodeId: 'desk-1',
    refetch: jest.fn(),
    provisionKey: jest.fn(),
  }),
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

describe('RoutineEditScreen — new routine by testID', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getSmartHomeConfig as jest.Mock).mockResolvedValue({
      nodes: [{ node_id: 'desk-1', room: 'desktop', online: true }],
      primary_node_id: 'desk-1',
    });
    (createRoutine as jest.Mock).mockResolvedValue({ id: 'r-1' });
  });

  it('creates a routine from the name, trigger, step and save controls', async () => {
    const screen = renderScreen();

    fireEvent.changeText(screen.getByTestId('routine-name-input'), 'E2E routine');
    fireEvent.changeText(screen.getByTestId('routine-trigger-input'), 'e2e phrase');
    fireEvent.press(screen.getByTestId('routine-trigger-add'));
    expect(screen.getByTestId('routine-trigger-e2e phrase')).toBeTruthy();
    fireEvent.press(screen.getByTestId('routine-add-step'));
    fireEvent.changeText(screen.getByTestId('routine-step-command-0'), 'get_weather');
    fireEvent.press(screen.getByTestId('routine-save-button'));

    await waitFor(() => expect(createRoutine).toHaveBeenCalledTimes(1));
    expect(createRoutine).toHaveBeenCalledWith(
      'hh-1',
      expect.objectContaining({
        name: 'E2E routine',
        trigger_phrases: ['e2e phrase'],
        steps: [expect.objectContaining({ command: 'get_weather', label: 'get_weather' })],
      }),
    );
    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());
  });

  it('has no delete button on a new routine', () => {
    const screen = renderScreen();
    expect(screen.queryByTestId('routine-delete-button')).toBeNull();
  });

  it('keeps taps while the keyboard is up, so a button fires on the first tap', () => {
    // With the ScrollView default ('never'), the first tap on a button while the keyboard
    // is up only dismisses the keyboard — the Add tap right after typing a phrase did
    // nothing (e2e run 20261022-231530).
    const screen = renderScreen();
    expect(screen.getByTestId('routine-edit-scroll').props.keyboardShouldPersistTaps).toBe('handled');
  });
});
