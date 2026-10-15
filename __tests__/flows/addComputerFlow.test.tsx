import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import * as Clipboard from 'expo-clipboard';

import AddComputerScreen, { PAIRING_POLL_MS } from '../../src/screens/Nodes/AddComputerScreen';
import { lightTheme } from '../../src/theme';
import { approvePairing, denyPairing, listPairings } from '../../src/api/pairingApi';

// L1 FLOW INTEGRATION — "Add a computer" (install plan item 3.4). The real screen inside a
// real PaperProvider; only the pairing API, navigation and the clipboard are mocked. Any
// household member approves a computer's code into one of THEIR households (the list's
// `households`, which cc scopes to the caller) and a room, or denies it. The list polls while
// the screen is focused and stops when it isn't.

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
const PAIRING = {
  code: 'ABCD-EFGH',
  name: 'Office-PC',
  platform: 'linux',
  requested_from: '10.0.0.5',
  created_at: '2026-10-14T10:00:00Z',
  expires_in: 540,
};

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
    (listPairings as jest.Mock).mockResolvedValue({ pairings: [PAIRING], households: HOUSEHOLDS });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows where to get the agent and copies the link', async () => {
    const { getByTestId, getByText, findByText } = renderScreen();
    expect(getByText('https://github.com/alexberardi/jarvis-server/releases')).toBeTruthy();
    expect(getByText(/Jarvis Automation agent/)).toBeTruthy();
    fireEvent.press(getByTestId('add-computer-copy-link'));
    await waitFor(() =>
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith('https://github.com/alexberardi/jarvis-server/releases'),
    );
    await findByText('Office-PC');
  });

  it('lists a waiting computer with its code, and approves it into the chosen household and room', async () => {
    (approvePairing as jest.Mock).mockResolvedValue({ status: 'approved', name: 'Office-PC' });
    const { findByText, getByTestId, getByText } = renderScreen();

    expect(await findByText('ABCD-EFGH')).toBeTruthy();
    expect(getByText('Office-PC')).toBeTruthy();
    expect(getByText(/Approve only if the computer shows this same code/)).toBeTruthy();
    expect(getByText(/9 min/)).toBeTruthy();

    // Defaults to the active household; the member picks another of their own.
    expect(getByTestId('pairing-household-ABCD-EFGH-hh-2').props.accessibilityState.selected).toBe(true);
    fireEvent.press(getByTestId('pairing-household-ABCD-EFGH-hh-1'));
    fireEvent.changeText(getByTestId('pairing-room-ABCD-EFGH'), 'office');

    (listPairings as jest.Mock).mockResolvedValue({ pairings: [], households: HOUSEHOLDS });
    fireEvent.press(getByTestId('pairing-approve-ABCD-EFGH'));

    await waitFor(() =>
      expect(approvePairing).toHaveBeenCalledWith({ code: 'ABCD-EFGH', householdId: 'hh-1', room: 'office' }),
    );
    expect(await findByText(/Office-PC approved\. It finishes pairing in a few seconds/)).toBeTruthy();
    expect(denyPairing).not.toHaveBeenCalled();
  });

  it('offers only the households the server listed for the caller', async () => {
    (listPairings as jest.Mock).mockResolvedValue({ pairings: [PAIRING], households: [HOUSEHOLDS[0]] });
    const { findByText, queryByTestId, getByTestId } = renderScreen();
    await findByText('ABCD-EFGH');
    expect(queryByTestId('pairing-household-ABCD-EFGH-hh-2')).toBeNull();
    // The active household isn't one of them → the first listed one.
    expect(getByTestId('pairing-household-ABCD-EFGH-hh-1').props.accessibilityState.selected).toBe(true);
  });

  it('denies a code', async () => {
    (denyPairing as jest.Mock).mockResolvedValue(undefined);
    const { findByText, getByTestId } = renderScreen();
    await findByText('ABCD-EFGH');
    fireEvent.press(getByTestId('pairing-deny-ABCD-EFGH'));
    await waitFor(() => expect(denyPairing).toHaveBeenCalledWith('ABCD-EFGH'));
    expect(await findByText('Office-PC denied.')).toBeTruthy();
    expect(approvePairing).not.toHaveBeenCalled();
  });

  it("shows the server's refusal and keeps the request", async () => {
    (approvePairing as jest.Mock).mockRejectedValue(axiosError(404, 'Pairing code not found or expired'));
    const { findByText, getByTestId } = renderScreen();
    await findByText('ABCD-EFGH');
    fireEvent.press(getByTestId('pairing-approve-ABCD-EFGH'));
    expect(await findByText('Pairing code not found or expired')).toBeTruthy();
  });

  it('says how to start when nothing is waiting', async () => {
    (listPairings as jest.Mock).mockResolvedValue({ pairings: [], households: HOUSEHOLDS });
    const { findByTestId } = renderScreen();
    expect(await findByTestId('pairings-empty')).toHaveTextContent(/its code appears here/);
  });

  it('explains when the user belongs to no household', async () => {
    (listPairings as jest.Mock).mockRejectedValue(axiosError(403, 'User is not a member of any household'));
    const { findByText } = renderScreen();
    expect(await findByText('User is not a member of any household')).toBeTruthy();
  });

  it('polls while open and stops when closed', async () => {
    jest.useFakeTimers();
    const { findByText, unmount } = renderScreen();
    await findByText('ABCD-EFGH');
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
