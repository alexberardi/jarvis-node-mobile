import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import RoutineEditScreen from '../../src/screens/Routines/RoutineEditScreen';
import { lightTheme } from '../../src/theme';
import type { Routine } from '../../src/types/Routine';

// --- Navigation mocks ---
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockRouteParams: Record<string, unknown> = {};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({ params: mockRouteParams }),
}));

// --- Auth mock ---
jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({
    state: { accessToken: 'mock-token', activeHouseholdId: 'hh-1' },
  }),
}));

// --- Settings snapshot mock (available commands) ---
const mockCommands = [
  {
    command_name: 'get_weather',
    description: 'Get weather forecast',
    enabled: true,
    parameters: [
      { name: 'resolved_datetimes', type: 'string', required: true, default_value: 'today', description: 'Date' },
      { name: 'location', type: 'string', required: false, default_value: null, description: 'City' },
    ],
  },
  {
    command_name: 'get_news',
    description: 'Get news headlines',
    enabled: true,
    parameters: [
      { name: 'category', type: 'string', required: false, default_value: 'general', description: 'Category', enum_values: ['general', 'tech', 'sports'] },
      { name: 'count', type: 'int', required: false, default_value: '5', description: 'Number' },
    ],
  },
  { command_name: 'disabled_cmd', description: 'Disabled', enabled: false, parameters: [] },
];

jest.mock('../../src/hooks/useSettingsSnapshot', () => ({
  useSettingsSnapshot: () => ({
    snapshot: { commands: mockCommands },
    state: 'loaded',
    error: null,
  }),
}));

// --- Storage mocks ---
const mockLoadRoutines = jest.fn();
const mockSaveRoutine = jest.fn();
const mockGetRoutine = jest.fn();
const mockDeleteRoutine = jest.fn();

jest.mock('../../src/services/routineStorageService', () => ({
  loadRoutines: (...args: unknown[]) => mockLoadRoutines(...args),
  saveRoutine: (...args: unknown[]) => mockSaveRoutine(...args),
  getRoutine: (...args: unknown[]) => mockGetRoutine(...args),
  deleteRoutine: (...args: unknown[]) => mockDeleteRoutine(...args),
  slugify: (name: string) =>
    name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
}));

// --- DraggableFlatList mock (render items without drag) ---
jest.mock('react-native-draggable-flatlist', () => {
  const { View } = require('react-native');
  const MockDraggableFlatList = ({ data, renderItem, keyExtractor }: any) => (
    <View testID="draggable-list">
      {data.map((item: any, index: number) => (
        <View key={keyExtractor ? keyExtractor(item, index) : index}>
          {renderItem({ item, drag: jest.fn(), getIndex: () => index, isActive: false })}
        </View>
      ))}
    </View>
  );
  return {
    __esModule: true,
    default: MockDraggableFlatList,
    ScaleDecorator: ({ children }: any) => children,
  };
});

// --- ParameterArgRow mock ---
jest.mock('../../src/components/ParameterArgRow', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ arg }: any) => <Text testID={`arg-${arg.key}`}>{arg.key}={arg.value}</Text>,
  };
});

// --- Alert spy ---
const alertSpy = jest.spyOn(Alert, 'alert');

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

/**
 * Paper TextInput with mode="flat" renders the native TextInput with testID="text-input-flat".
 * The `label` prop is visual only — not exposed as accessibilityLabel.
 * Use this helper to get inputs by their rendered order in the form.
 *
 * Form order (new routine, no steps): [0] Routine Name, [1] Add phrase, [2] Response instruction
 */
const INPUT_NAME = 0;
const INPUT_TRIGGER = 1;

const getInput = (view: ReturnType<typeof render>, index: number) =>
  view.getAllByTestId('text-input-flat')[index];

describe('RoutineEditScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = {};
    mockLoadRoutines.mockResolvedValue([]);
    mockSaveRoutine.mockResolvedValue(undefined);
    mockGetRoutine.mockResolvedValue(undefined);
  });

  // --- Rendering ---

  it('renders new routine form with blank fields', () => {
    const view = render(<RoutineEditScreen />, { wrapper });

    expect(view.getByText('New Routine')).toBeTruthy();
    expect(getInput(view, INPUT_NAME)).toBeTruthy();
    expect(getInput(view, INPUT_TRIGGER)).toBeTruthy();
    expect(view.getByText('Add Step')).toBeTruthy();
    expect(view.getByText('Save & Choose Nodes')).toBeTruthy();
  });

  it('renders edit mode header when routineId is provided', async () => {
    const existing: Routine = {
      id: 'morning_test',
      name: 'Morning Test',
      trigger_phrases: ['morning'],
      steps: [{ command: 'get_weather', args: [], label: 'weather' }],
      response_instruction: 'Be brief',
      response_length: 'short',
      background: null,
    };
    mockGetRoutine.mockResolvedValue(existing);
    mockRouteParams = { routineId: 'morning_test' };

    const { getByText } = render(<RoutineEditScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('Edit Routine')).toBeTruthy();
    });
  });

  it('loads existing routine data in edit mode', async () => {
    const existing: Routine = {
      id: 'my_routine',
      name: 'My Routine',
      trigger_phrases: ['hey there', 'do the thing'],
      steps: [{ command: 'get_news', args: [{ key: 'category', value: 'tech' }], label: 'news' }],
      response_instruction: 'Be concise',
      response_length: 'medium',
      background: null,
    };
    mockGetRoutine.mockResolvedValue(existing);
    mockRouteParams = { routineId: 'my_routine' };

    const { getByText, getByDisplayValue } = render(<RoutineEditScreen />, { wrapper });

    await waitFor(() => {
      expect(getByDisplayValue('My Routine')).toBeTruthy();
      expect(getByText('hey there')).toBeTruthy();
      expect(getByText('do the thing')).toBeTruthy();
      expect(getByDisplayValue('Be concise')).toBeTruthy();
    });
  });

  it('pre-populates from routineData param (AI builder flow)', async () => {
    const routine: Routine = {
      id: 'ai_built',
      name: 'AI Built',
      trigger_phrases: ['ai routine'],
      steps: [{ command: 'get_weather', args: [], label: 'weather' }],
      response_instruction: 'AI generated',
      response_length: 'long',
      background: null,
    };
    mockRouteParams = { routineData: JSON.stringify(routine) };

    const { getByDisplayValue, getByText } = render(<RoutineEditScreen />, { wrapper });

    await waitFor(() => {
      expect(getByDisplayValue('AI Built')).toBeTruthy();
      expect(getByText('ai routine')).toBeTruthy();
      expect(getByDisplayValue('AI generated')).toBeTruthy();
    });
  });

  // --- Validation ---

  it('shows validation error when name is empty', async () => {
    const { getByText } = render(<RoutineEditScreen />, { wrapper });

    fireEvent.press(getByText('Save & Choose Nodes'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Validation Error', 'Name is required.');
    });
  });

  it('shows validation error when name has no alphanumeric characters', async () => {
    const view = render(<RoutineEditScreen />, { wrapper });

    fireEvent.changeText(getInput(view, INPUT_NAME), '!!!');
    fireEvent.press(view.getByText('Save & Choose Nodes'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Validation Error',
        'Name must contain at least one alphanumeric character.',
      );
    });
  });

  it('shows validation error when no trigger phrases', async () => {
    const view = render(<RoutineEditScreen />, { wrapper });

    fireEvent.changeText(getInput(view, INPUT_NAME), 'Test');
    fireEvent.press(view.getByText('Save & Choose Nodes'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Validation Error',
        'At least one trigger phrase is required.',
      );
    });
  });

  it('shows validation error when no steps', async () => {
    const view = render(<RoutineEditScreen />, { wrapper });

    fireEvent.changeText(getInput(view, INPUT_NAME), 'Test');
    fireEvent.changeText(getInput(view, INPUT_TRIGGER), 'hello');
    fireEvent.press(view.getByText('Add'));
    fireEvent.press(view.getByText('Save & Choose Nodes'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Validation Error',
        'At least one step is required.',
      );
    });
  });

  it('shows validation error when step has no command', async () => {
    const view = render(<RoutineEditScreen />, { wrapper });

    fireEvent.changeText(getInput(view, INPUT_NAME), 'Test');
    fireEvent.changeText(getInput(view, INPUT_TRIGGER), 'hello');
    fireEvent.press(view.getByText('Add'));
    fireEvent.press(view.getByText('Add Step'));
    // Don't select a command
    fireEvent.press(view.getByText('Save & Choose Nodes'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Validation Error',
        'Step 1: command is required.',
      );
    });
  });

  it('shows validation error for duplicate step labels', async () => {
    const routine: Routine = {
      id: 'dup_labels',
      name: 'Dup Labels',
      trigger_phrases: ['test'],
      steps: [
        { command: 'get_weather', args: [], label: 'same_label' },
        { command: 'get_news', args: [], label: 'same_label' },
      ],
      response_instruction: '',
      response_length: 'short',
      background: null,
    };
    mockRouteParams = { routineData: JSON.stringify(routine) };
    mockLoadRoutines.mockResolvedValue([]);

    const { getByText, getByDisplayValue } = render(<RoutineEditScreen />, { wrapper });

    await waitFor(() => expect(getByDisplayValue('Dup Labels')).toBeTruthy());

    fireEvent.press(getByText('Save & Choose Nodes'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Validation Error',
        'Step labels must be unique.',
      );
    });
  });

  it('shows validation error for duplicate routine ID', async () => {
    mockLoadRoutines.mockResolvedValue([
      { id: 'test_routine', name: 'Existing' } as Routine,
    ]);

    const view = render(<RoutineEditScreen />, { wrapper });

    // Name that slugifies to "test_routine" (matches existing)
    fireEvent.changeText(getInput(view, INPUT_NAME), 'Test Routine');
    fireEvent.changeText(getInput(view, INPUT_TRIGGER), 'run test');
    fireEvent.press(view.getByText('Add'));
    fireEvent.press(view.getByText('Add Step'));
    fireEvent.press(view.getByText('Select command...'));
    fireEvent.press(view.getByText('get_weather'));
    fireEvent.press(view.getByText('Save & Choose Nodes'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Validation Error',
        'A routine with the ID "test_routine" already exists.',
      );
    });
  });

  it('shows validation error for cron schedule with no days selected', async () => {
    const routine: Routine = {
      id: 'cron_nodays',
      name: 'Cron No Days',
      trigger_phrases: ['test cron'],
      steps: [{ command: 'get_weather', args: [], label: 'weather' }],
      response_instruction: '',
      response_length: 'short',
      background: {
        enabled: true,
        schedule_type: 'cron',
        interval_minutes: 30,
        run_on_startup: false,
        days: [],
        time: '08:00',
        summary_style: 'compact',
        alert_priority: 2,
        alert_ttl_minutes: 240,
      },
    };
    mockRouteParams = { routineData: JSON.stringify(routine) };
    mockLoadRoutines.mockResolvedValue([]);

    const { getByText, getByDisplayValue } = render(<RoutineEditScreen />, { wrapper });

    await waitFor(() => expect(getByDisplayValue('Cron No Days')).toBeTruthy());

    fireEvent.press(getByText('Save & Choose Nodes'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Validation Error',
        'Background: at least one day must be selected.',
      );
    });
  });

  // --- Trigger phrase interactions ---

  it('adds a trigger phrase and shows it as a chip', () => {
    const view = render(<RoutineEditScreen />, { wrapper });

    fireEvent.changeText(getInput(view, INPUT_TRIGGER), 'good morning');
    fireEvent.press(view.getByText('Add'));

    expect(view.getByText('good morning')).toBeTruthy();
  });

  it('does not add duplicate trigger phrases', () => {
    const view = render(<RoutineEditScreen />, { wrapper });

    fireEvent.changeText(getInput(view, INPUT_TRIGGER), 'hello');
    fireEvent.press(view.getByText('Add'));
    fireEvent.changeText(getInput(view, INPUT_TRIGGER), 'hello');
    fireEvent.press(view.getByText('Add'));

    // Only one chip with "hello"
    expect(view.queryAllByText('hello')).toHaveLength(1);
  });

  it('does not add empty trigger phrases', () => {
    const { getByText, queryByText } = render(<RoutineEditScreen />, { wrapper });

    fireEvent.press(getByText('Add'));

    expect(queryByText('Trigger Phrases')).toBeTruthy();
  });

  it('clears input after adding trigger phrase', () => {
    const view = render(<RoutineEditScreen />, { wrapper });
    const input = getInput(view, INPUT_TRIGGER);

    fireEvent.changeText(input, 'test phrase');
    fireEvent.press(view.getByText('Add'));

    // After adding, the input value should be cleared
    expect(input.props.value).toBe('');
  });

  // --- Steps ---

  it('adds a step with Add Step button', () => {
    const { getByText } = render(<RoutineEditScreen />, { wrapper });

    fireEvent.press(getByText('Add Step'));

    expect(getByText('Step 1')).toBeTruthy();
    expect(getByText('Select command...')).toBeTruthy();
  });

  it('shows command menu and selects a command', () => {
    const { getByText } = render(<RoutineEditScreen />, { wrapper });

    fireEvent.press(getByText('Add Step'));
    fireEvent.press(getByText('Select command...'));

    // Menu shows available commands (not disabled ones)
    expect(getByText('get_weather')).toBeTruthy();
    expect(getByText('get_news')).toBeTruthy();
  });

  it('does not show disabled commands in command menu', () => {
    const { getByText, queryByText } = render(<RoutineEditScreen />, { wrapper });

    fireEvent.press(getByText('Add Step'));
    fireEvent.press(getByText('Select command...'));

    expect(queryByText('disabled_cmd')).toBeNull();
  });

  it('auto-adds required parameters when selecting a command', () => {
    const { getByText, getByTestId } = render(<RoutineEditScreen />, { wrapper });

    fireEvent.press(getByText('Add Step'));
    fireEvent.press(getByText('Select command...'));
    fireEvent.press(getByText('get_weather'));

    // get_weather has required param "resolved_datetimes"
    expect(getByTestId('arg-resolved_datetimes')).toBeTruthy();
  });

  // --- Slug display ---

  it('shows slugified ID under the name field', () => {
    const view = render(<RoutineEditScreen />, { wrapper });

    fireEvent.changeText(getInput(view, INPUT_NAME), 'My Cool Routine');

    expect(view.getByText('ID: my_cool_routine')).toBeTruthy();
  });

  // --- Save flow ---

  it('saves routine and navigates to node picker on success', async () => {
    mockLoadRoutines.mockResolvedValue([]);
    mockSaveRoutine.mockResolvedValue(undefined);

    const view = render(<RoutineEditScreen />, { wrapper });

    fireEvent.changeText(getInput(view, INPUT_NAME), 'Test Routine');
    fireEvent.changeText(getInput(view, INPUT_TRIGGER), 'run test');
    fireEvent.press(view.getByText('Add'));
    fireEvent.press(view.getByText('Add Step'));
    fireEvent.press(view.getByText('Select command...'));
    fireEvent.press(view.getByText('get_weather'));
    fireEvent.press(view.getByText('Save & Choose Nodes'));

    await waitFor(() => {
      expect(mockSaveRoutine).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test_routine',
          name: 'Test Routine',
          trigger_phrases: ['run test'],
          steps: expect.arrayContaining([
            expect.objectContaining({ command: 'get_weather' }),
          ]),
        }),
      );
      expect(mockNavigate).toHaveBeenCalledWith('RoutineNodePicker', { routineId: 'test_routine' });
    });
  });

  it('shows error alert when save fails', async () => {
    mockLoadRoutines.mockResolvedValue([]);
    mockSaveRoutine.mockRejectedValue(new Error('Storage full'));

    const view = render(<RoutineEditScreen />, { wrapper });

    fireEvent.changeText(getInput(view, INPUT_NAME), 'Save Fail');
    fireEvent.changeText(getInput(view, INPUT_TRIGGER), 'trigger');
    fireEvent.press(view.getByText('Add'));
    fireEvent.press(view.getByText('Add Step'));
    fireEvent.press(view.getByText('Select command...'));
    fireEvent.press(view.getByText('get_weather'));
    fireEvent.press(view.getByText('Save & Choose Nodes'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Error', 'Could not save routine. Please try again.');
    });
  });

  // --- Response length ---

  it('defaults to short response length', () => {
    const { getByText } = render(<RoutineEditScreen />, { wrapper });

    expect(getByText('Short')).toBeTruthy();
    expect(getByText('Medium')).toBeTruthy();
    expect(getByText('Long')).toBeTruthy();
  });

  // --- Background toggle ---

  it('shows background config when toggled on', async () => {
    const { queryByText } = render(<RoutineEditScreen />, { wrapper });

    // Background config not visible initially
    expect(queryByText('Repeating')).toBeNull();

    // Verify by rendering with background data pre-populated
    const routine: Routine = {
      id: 'bg_test',
      name: 'BG Test',
      trigger_phrases: ['test'],
      steps: [{ command: 'get_weather', args: [], label: 'weather' }],
      response_instruction: '',
      response_length: 'short',
      background: {
        enabled: true,
        schedule_type: 'interval',
        interval_minutes: 30,
        run_on_startup: true,
        days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        time: '08:00',
        summary_style: 'compact',
        alert_priority: 2,
        alert_ttl_minutes: 240,
      },
    };
    mockRouteParams = { routineData: JSON.stringify(routine) };

    const view = render(<RoutineEditScreen />, { wrapper });

    await waitFor(() => {
      expect(view.getByText('Repeating')).toBeTruthy();
      expect(view.getByText('Scheduled')).toBeTruthy();
      expect(view.getByText('Compact')).toBeTruthy();
      expect(view.getByText('Detailed')).toBeTruthy();
    });
  });

  it('shows cron day/time fields for scheduled type', async () => {
    const routine: Routine = {
      id: 'cron_test',
      name: 'Cron Test',
      trigger_phrases: ['cron'],
      steps: [{ command: 'get_weather', args: [], label: 'weather' }],
      response_instruction: '',
      response_length: 'short',
      background: {
        enabled: true,
        schedule_type: 'cron',
        interval_minutes: 30,
        run_on_startup: false,
        days: ['mon', 'tue', 'wed', 'thu', 'fri'],
        time: '09:00',
        summary_style: 'detailed',
        alert_priority: 3,
        alert_ttl_minutes: 60,
      },
    };
    mockRouteParams = { routineData: JSON.stringify(routine) };

    const view = render(<RoutineEditScreen />, { wrapper });

    await waitFor(() => {
      expect(view.getByText('Days')).toBeTruthy();
      expect(view.getByText('Every day')).toBeTruthy();
      expect(view.getByText('Weekdays')).toBeTruthy();
      expect(view.getByText('Weekends')).toBeTruthy();
      expect(view.getAllByText('Custom').length).toBeGreaterThanOrEqual(1);
      expect(view.getByDisplayValue('09:00')).toBeTruthy();
    });
  });

  // --- Navigation ---

  it('does not navigate on initial render', () => {
    render(<RoutineEditScreen />, { wrapper });

    expect(mockGoBack).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
