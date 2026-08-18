import React from 'react';
import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import SignalAutomationsScreen from '../../src/screens/Settings/SignalAutomationsScreen';
import { lightTheme } from '../../src/theme';

const mockGet = jest.fn();
const mockSet = jest.fn();

jest.mock('../../src/api/signalAutomationsApi', () => ({
  getSignalAutomations: (...a: any[]) => mockGet(...a),
  setSignalAutomation: (...a: any[]) => mockSet(...a),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

const navigation = { goBack: jest.fn(), navigate: jest.fn() } as any;

const renderScreen = () =>
  render(
    <SignalAutomationsScreen
      navigation={navigation}
      route={{ params: { householdId: 'hh-1' } } as any}
    />,
    { wrapper },
  );

const CATALOG = [
  {
    kind: 'presence.left',
    label: 'I leave home',
    description: 'You left.',
    facts: {},
    example: 'Lock the front door',
    source: 'mobile',
    observed: true,
    instruction: '',
    enabled: false,
  },
  {
    kind: 'appt.upcoming',
    label: 'An appointment is coming up',
    description: 'Soon.',
    facts: {},
    example: 'Remind me',
    source: 'calendar_alerts',
    observed: false,
    instruction: 'Old text',
    enabled: true,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockResolvedValue(JSON.parse(JSON.stringify(CATALOG)));
});

it('renders each catalog signal with an active/possible chip', async () => {
  const { getByText, getByTestId } = renderScreen();
  await waitFor(() => getByTestId('automation-presence.left'));
  expect(getByText('I leave home')).toBeTruthy();
  expect(getByText('An appointment is coming up')).toBeTruthy();
  expect(getByText('Active')).toBeTruthy(); // presence.left is observed
  expect(getByText('Possible')).toBeTruthy(); // appt.upcoming is not
});

it('loads the current instruction into the input', async () => {
  const { getByTestId } = renderScreen();
  await waitFor(() => getByTestId('automation-appt.upcoming'));
  expect(getByTestId('instruction-appt.upcoming').props.value).toBe('Old text');
});

it('the save button reads "Clear" for an empty rule and "Save" once text is typed', async () => {
  const { getByTestId } = renderScreen();
  await waitFor(() => getByTestId('automation-presence.left'));
  const card = within(getByTestId('automation-presence.left'));
  // Empty instruction → the action clears; label is "Clear".
  expect(card.getByText('Clear')).toBeTruthy();
  fireEvent.changeText(getByTestId('instruction-presence.left'), 'Lock the door');
  // Now dirty with text → label flips to "Save".
  await waitFor(() => expect(card.getByText('Save')).toBeTruthy());
});

it('saves a typed instruction (with the enable toggle) via the API', async () => {
  mockSet.mockResolvedValue({ instruction: 'Lock the door', enabled: true, cleared: false });
  const { getByTestId } = renderScreen();
  await waitFor(() => getByTestId('automation-presence.left'));

  fireEvent.changeText(getByTestId('instruction-presence.left'), 'Lock the door');
  fireEvent(getByTestId('enabled-presence.left'), 'valueChange', true);
  fireEvent.press(getByTestId('save-presence.left'));

  await waitFor(() =>
    expect(mockSet).toHaveBeenCalledWith('hh-1', 'presence.left', 'Lock the door', true),
  );
});

it('shows an error + retry when loading fails', async () => {
  mockGet.mockRejectedValueOnce(new Error('boom'));
  const { getByText } = renderScreen();
  await waitFor(() => expect(getByText('Could not load automations.')).toBeTruthy());
});
