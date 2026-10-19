import { NavigationContainer } from '@react-navigation/native';
import { render } from '@testing-library/react-native';
import React from 'react';

import MainTabNavigator from '../../src/navigation/MainTabNavigator';

jest.mock('../../src/theme/ThemeProvider', () => ({
  useThemePreference: () => ({ paperTheme: jest.requireActual('../../src/theme').lightTheme }),
}));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('../../src/screens/Home/HomeScreen', () => () => null);
jest.mock('../../src/navigation/DevicesStackNavigator', () => () => null);
jest.mock('../../src/navigation/StoreStackNavigator', () => () => null);
jest.mock('../../src/navigation/RoutinesStackNavigator', () => () => null);
jest.mock('../../src/navigation/NodesStackNavigator', () => () => null);

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
});
