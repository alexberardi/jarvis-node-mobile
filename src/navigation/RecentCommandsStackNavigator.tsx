import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import RecentCommandDetailScreen from '../screens/RecentCommands/RecentCommandDetailScreen';
import RecentCommandsListScreen from '../screens/RecentCommands/RecentCommandsListScreen';
import { RecentCommandsStackParamList } from './types';

const Stack = createNativeStackNavigator<RecentCommandsStackParamList>();

const RecentCommandsStackNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="RecentCommandsList" component={RecentCommandsListScreen} />
      <Stack.Screen name="RecentCommandDetail" component={RecentCommandDetailScreen} />
    </Stack.Navigator>
  );
};

export default RecentCommandsStackNavigator;
