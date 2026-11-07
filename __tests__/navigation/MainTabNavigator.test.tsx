import { NavigationContainer } from '@react-navigation/native';
import { render } from '@testing-library/react-native';
import React from 'react';

import MainTabNavigator, { onFirstScreen } from '../../src/navigation/MainTabNavigator';

jest.mock('../../src/theme/ThemeProvider', () => ({
  useThemePreference: () => ({ paperTheme: jest.requireActual('../../src/theme').lightTheme }),
}));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('../../src/screens/Home/HomeScreen', () => () => null);
jest.mock('../../src/navigation/DevicesStackNavigator', () => () => null);
jest.mock('../../src/navigation/StoreStackNavigator', () => () => null);
jest.mock('../../src/navigation/RoutinesStackNavigator', () => () => null);
jest.mock('../../src/navigation/NodesStackNavigator', () => () => null);
jest.mock('../../src/components/NowPlaying/MiniPlayer', () => {
  const { View } = jest.requireActual('react-native');
  return () => <View testID="mini-player" />;
});

describe('MainTabNavigator', () => {
  // The Maestro flows (.maestro/) pick tabs by these ids, not by the
  // platform's "<Label>, tab, N of M" accessibility text.
  it('gives every tab button a stable testID', () => {
    const { getByTestId } = render(
      <NavigationContainer>
        <MainTabNavigator />
      </NavigationContainer>,
    );

    for (const id of ['tab-home', 'tab-devices', 'tab-pantry', 'tab-routines', 'tab-nodes']) {
      expect(getByTestId(id)).toBeTruthy();
    }
  });

  it('shows the mini-player above the tabs on a tab\'s first screen', () => {
    const { getByTestId } = render(
      <NavigationContainer>
        <MainTabNavigator />
      </NavigationContainer>,
    );
    expect(getByTestId('mini-player')).toBeTruthy();
  });

  it('hides the mini-player on drill-in screens', () => {
    const tabs = (inner?: number) => ({ index: 1, routes: [{}, inner === undefined ? {} : { state: { index: inner } }] });
    expect(onFirstScreen(tabs())).toBe(true); // a tab that has not mounted its stack yet
    expect(onFirstScreen(tabs(0))).toBe(true);
    expect(onFirstScreen(tabs(1))).toBe(false); // e.g. a routine's edit screen
  });
});
