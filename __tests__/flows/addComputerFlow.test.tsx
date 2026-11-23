import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import * as Clipboard from 'expo-clipboard';

import AddComputerScreen, { PAIRING_POLL_MS } from '../../src/screens/Nodes/AddComputerScreen';
import { lightTheme } from '../../src/theme';
import { approvePairing, denyPairing, listPairings } from '../../src/api/pairingApi';

// L1 FLOW INTEGRATION — "Add a computer". The real screen inside a real PaperProvider; only
// the pairing API, navigation and the clipboard are mocked. The server never lists codes, so a
// household member TYPES the code the computer shows and approves it into one of THEIR
// households (the list's `households`, which cc scopes to the caller) and a room, or denies it.
// The waiting count polls while the screen is focused and stops when it isn't.

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => {
  const ReactActual = jest.requireActual('react');
  return {
    useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
    // Focus = mounted, for this screen in isolation.
    useFocusEffect: (cb: () => void | (() => void)) => ReactActual.useEffect(cb, [cb]),
  };
});
jest.mock('../../src/api/pairingApi', () => ({
  ...jest.requireActual('../../src/api/pairingApi'),
  listPairings: jest.fn(),
  approvePairing: jest.fn(),
  denyPairing: jest.fn(),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));

let mockAuth: any;
jest.mock('../../src/auth/AuthContext', () => ({ useAuth: () => ({ state: mockAuth }) }));

const HOUSEHOLDS = [
  { id: 'hh-1', name: 'Home', role: 'member' },
  { id: 'hh-2', name: 'Cabin', role: 'admin' },
];

const renderScreen = () =>
  render(
    <PaperProvider theme={lightTheme}>
      <AddComputerScreen />
    </PaperProvider>,
  );

const axiosError = (status: number, detail: string) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: { detail } },
  });

describe('Add a computer — flow integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = { user: { id: 7 }, activeHouseholdId: 'hh-2', households: HOUSEHOLDS };
    (listPairings as jest.Mock).mockResolvedValue({ waiting: 1, households: HOUSEHOLDS });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows where to get the agent and copies the link', async () => {
    const { getByTestId, getByText, findByTestId } = renderScreen();
    expect(getByText('https://github.com/alexberardi/jarvis-server/releases')).toBeTruthy();
    expect(getByText(/Jarvis Automation agent/)).toBeTruthy();
    fireEvent.press(getByTestId('add-computer-copy-link'));
    await waitFor(() =>
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith('https://github.com/alexberardi/jarvis-server/releases'),
    );
    await findByTestId('pairing-code-input');
  });

  it('approves a typed code into the chosen household and room', async () => {
    (approvePairing as jest.Mock).mockResolvedValue({ status: 'approved', name: 'Office-PC' });
    const { findByTestId, getByTestId, findByText } = renderScreen();

    expect(await findByTestId('pairings-waiting')).toHaveTextContent(/1 computer is waiting/);
    // Nothing typed yet → nothing to approve or deny.
    expect(getByTestId('pairing-approve').props.accessibilityState.disabled).toBe(true);
    expect(getByTestId('pairing-deny').props.accessibilityState.disabled).toBe(true);

    // Defaults to the active household; the member picks another of their own.
    expect(getByTestId('pairing-household-hh-2').props.accessibilityState.selected).toBe(true);
    fireEvent.press(getByTestId('pairing-household-hh-1'));
    fireEvent.changeText(getByTestId('pairing-code-input'), 'abcd-efgh ');
    fireEvent.changeText(getByTestId('pairing-room'), 'office');
    fireEvent.press(getByTestId('pairing-approve'));

    await waitFor(() =>
      expect(approvePairing).toHaveBeenCalledWith({ code: 'ABCD-EFGH', householdId: 'hh-1', room: 'office' }),
    );
    expect(await findByText(/Approved\. The computer asks to confirm Home before it joins/)).toBeTruthy();
    expect(getByTestId('pairing-code-input').props.value).toBe('');
    expect(denyPairing).not.toHaveBeenCalled();
  });

  it('offers only the households the server listed for the caller', async () => {
    (listPairings as jest.Mock).mockResolvedValue({ waiting: 1, households: [HOUSEHOLDS[0]] });
    const { findByTestId, queryByTestId } = renderScreen();
    // The active household isn't one of them → the first listed one.
    expect((await findByTestId('pairing-household-hh-1')).props.accessibilityState.selected).toBe(true);
    expect(queryByTestId('pairing-household-hh-2')).toBeNull();
  });

  it('denies a typed code', async () => {
    (denyPairing as jest.Mock).mockResolvedValue(undefined);
    const { findByTestId, getByTestId, findByText } = renderScreen();
    fireEvent.changeText(await findByTestId('pairing-code-input'), 'ABCD-EFGH');
    fireEvent.press(getByTestId('pairing-deny'));
    await waitFor(() => expect(denyPairing).toHaveBeenCalledWith('ABCD-EFGH'));
    expect(await findByText('Pairing denied.')).toBeTruthy();
    expect(approvePairing).not.toHaveBeenCalled();
  });

  it("shows the server's refusal and keeps the code", async () => {
    (approvePairing as jest.Mock).mockRejectedValue(axiosError(404, 'Pairing code not found or expired'));
    const { findByTestId, getByTestId, findByText } = renderScreen();
    fireEvent.changeText(await findByTestId('pairing-code-input'), 'WRONG-CODE');
    fireEvent.press(getByTestId('pairing-approve'));
    expect(await findByText('Pairing code not found or expired')).toBeTruthy();
    expect(getByTestId('pairing-code-input').props.value).toBe('WRONG-CODE');
  });

  it('says how to start when nothing is waiting', async () => {
    (listPairings as jest.Mock).mockResolvedValue({ waiting: 0, households: HOUSEHOLDS });
    const { findByTestId } = renderScreen();
    expect(await findByTestId('pairings-waiting')).toHaveTextContent(/type the code below/);
  });

  it('explains when the user belongs to no household', async () => {
    (listPairings as jest.Mock).mockRejectedValue(axiosError(403, 'User is not a member of any household'));
    const { findByText } = renderScreen();
    expect(await findByText('User is not a member of any household')).toBeTruthy();
  });

  it('polls while open and stops when closed', async () => {
    jest.useFakeTimers();
    const { findByTestId, unmount } = renderScreen();
    await findByTestId('pairings-waiting');
    expect(listPairings).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(PAIRING_POLL_MS);
    });
    expect(listPairings).toHaveBeenCalledTimes(2);

    unmount();
    await act(async () => {
      jest.advanceTimersByTime(PAIRING_POLL_MS * 3);
    });
    expect(listPairings).toHaveBeenCalledTimes(2);
  });

  it('polls modestly: no faster than every 5 seconds', () => {
    expect(PAIRING_POLL_MS).toBeGreaterThanOrEqual(5000);
  });
});
