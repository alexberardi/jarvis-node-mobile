import { CommonActions } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';

import DevicesStackNavigator from './DevicesStackNavigator';
import NodesStackNavigator from './NodesStackNavigator';
import RoutinesStackNavigator from './RoutinesStackNavigator';
import StoreStackNavigator from './StoreStackNavigator';
import HomeScreen from '../screens/Home/HomeScreen';
import { MainTabParamList } from './types';
import { useThemePreference } from '../theme/ThemeProvider';

const Tab = createBottomTabNavigator<MainTabParamList>();

const MainTabNavigator = () => {
  const { paperTheme } = useThemePreference();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: paperTheme.colors.primary,
        tabBarInactiveTintColor: paperTheme.colors.onSurfaceVariant,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: paperTheme.colors.outlineVariant,
        },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="home" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="DevicesTab"
        component={DevicesStackNavigator}
        options={{
          tabBarLabel: 'Devices',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="devices" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="StoreTab"
        component={StoreStackNavigator}
        options={{
          tabBarLabel: 'Pantry',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="package-variant-closed" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="RoutinesTab"
        component={RoutinesStackNavigator}
        options={{
          tabBarLabel: 'Routines',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="robot" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="NodesTab"
        component={NodesStackNavigator}
        options={{
          tabBarLabel: 'Nodes',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="raspberry-pi" color={color} size={size} />
          ),
        }}
        listeners={({ navigation }) => ({
          // Tapping the Nodes tab icon while already on this tab should
          // pop back to NodeList. React Navigation's default popToTop
          // doesn't traverse into nested navigators, so when the user
          // ends up inside AddNode's ProvisioningNavigator (e.g. on the
          // post-provisioning Success screen) the tab tap stays put.
          // Navigating to ``NodeList`` directly pops both AddNode and
          // its nested ProvisioningNavigator off in one go.
          tabPress: (e) => {
            const state = navigation.getState();
            const tabRoute = state.routes.find((r) => r.name === 'NodesTab');
            const isFocused = state.routes[state.index]?.name === 'NodesTab';
            const drilledIn =
              !!tabRoute?.state && (tabRoute.state.index ?? 0) > 0;
            if (isFocused && drilledIn) {
              e.preventDefault();
              navigation.dispatch(
                CommonActions.navigate({
                  name: 'NodesTab',
                  params: { screen: 'NodeList' },
                }),
              );
            }
          },
        })}
      />
    </Tab.Navigator>
  );
};

export default MainTabNavigator;
