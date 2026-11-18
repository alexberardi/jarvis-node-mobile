import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import HouseholdHomeScreen from '../../src/screens/Household/HouseholdHomeScreen';
import { lightTheme } from '../../src/theme';
import authApi from '../../src/api/authApi';
import { listNodes } from '../../src/api/nodeApi';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(cb, [cb]);
  },
}));
jest.mock('../../src/api/authApi', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../../src/api/nodeApi', () => ({ listNodes: jest.fn() }));

const mockSwitchHousehold = jest.fn();
let mockAuthState: any;
jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ state: mockAuthState, switchHousehold: mockSwitchHousehold }),
}));

const renderScreen = () =>
  render(
    <PaperProvider theme={lightTheme}>
      <HouseholdHomeScreen />
    </PaperProvider>,
  );

describe('HouseholdHomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState = {
      accessToken: 'tok',
      user: { id: 1, username: 'alex' },
      households: [
        { id: 'hh-1', name: 'Avery Household', role: 'admin' },
        { id: 'hh-2', name: 'Cabin', role: 'member' },
      ],
      activeHouseholdId: 'hh-1',
    };
    (authApi.get as jest.Mock).mockResolvedValue({ data: [{}, {}, {}] });
    (listNodes as jest.Mock).mockResolvedValue([{ online: true }, { online: false }]);
  });

  it('shows the active household and live tile counts', async () => {
    const utils = renderScreen();
    // In the title switcher and as the Name row's description.
    expect(utils.getAllByText('Avery Household')).toHaveLength(2);
    await waitFor(() => expect(utils.getByText('1 of 2 online')).toBeTruthy());
    expect(utils.getByText('3 in this home')).toBeTruthy();
    expect(authApi.get).toHaveBeenCalledWith('/households/hh-1/members', { headers: { Authorization: 'Bearer tok' } });
    expect(listNodes).toHaveBeenCalledWith('hh-1');
  });

  it('opens each section of the household editor for the active household', () => {
    const utils = renderScreen();
    const cases: [string, string][] = [
      ['household-tile-jarvis', 'jarvis'],
      ['household-tile-knowledge', 'knowledge'],
      ['household-tile-members', 'members'],
      ['household-home-row-home', 'home'],
      ['household-home-row-presence', 'presence'],
      ['household-home-row-calls', 'calls'],
    ];
    for (const [id, section] of cases) {
      fireEvent.press(utils.getByTestId(id));
      expect(mockNavigate).toHaveBeenLastCalledWith('HouseholdEdit', {
        householdId: 'hh-1',
        householdName: 'Avery Household',
        section,
      });
    }
  });

  it('routes the other entries: nodes, smart home, automations', () => {
    const utils = renderScreen();
    fireEvent.press(utils.getByTestId('household-tile-nodes'));
    expect(mockNavigate).toHaveBeenLastCalledWith('NodeList');
    fireEvent.press(utils.getByTestId('household-home-row-smart-home'));
    expect(mockNavigate).toHaveBeenLastCalledWith('Settings', { view: 'smart_home' });
    fireEvent.press(utils.getByTestId('household-home-row-automations'));
    expect(mockNavigate).toHaveBeenLastCalledWith('SignalAutomations', { householdId: 'hh-1' });
  });

  it('switches household from the title menu, and offers join/create', async () => {
    const utils = renderScreen();
    fireEvent.press(utils.getByTestId('household-switcher'));
    fireEvent.press(await utils.findByTestId('household-switch-hh-2'));
    expect(mockSwitchHousehold).toHaveBeenCalledWith('hh-2');

    fireEvent.press(utils.getByTestId('household-switcher'));
    fireEvent.press(await utils.findByTestId('household-join-create'));
    expect(mockNavigate).toHaveBeenLastCalledWith('Settings', { view: 'households' });
  });

  it('with no household, offers only join or create', () => {
    mockAuthState = { ...mockAuthState, households: [], activeHouseholdId: null };
    const utils = renderScreen();
    expect(utils.queryByTestId('household-tile-jarvis')).toBeNull();
    fireEvent.press(utils.getByText('Join or create a household'));
    expect(mockNavigate).toHaveBeenLastCalledWith('Settings', { view: 'households' });
  });
});
