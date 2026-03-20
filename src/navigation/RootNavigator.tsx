import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import React from 'react';

import { useAuth } from '../auth/AuthContext';
import AuthNavigator from './AuthNavigator';
import InboxStackNavigator from './InboxStackNavigator';
import MainTabNavigator from './MainTabNavigator';
import SmartHomeSetupNavigator from './SmartHomeSetupNavigator';
import SettingsScreen from '../screens/Settings/SettingsScreen';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const RootNavigator = () => {
  const {
    state: { isAuthenticated, isLoading },
  } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <AuthNavigator />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={MainTabNavigator} />
      <Stack.Screen
        name="Inbox"
        component={InboxStackNavigator}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="SmartHomeSetup"
        component={SmartHomeSetupNavigator}
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default RootNavigator;
