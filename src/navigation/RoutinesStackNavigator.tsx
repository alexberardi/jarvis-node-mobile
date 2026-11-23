import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import RoutineEditScreen from '../screens/Routines/RoutineEditScreen';
import RoutineListScreen from '../screens/Routines/RoutineListScreen';
import { RoutinesStackParamList } from './types';

const Stack = createNativeStackNavigator<RoutinesStackParamList>();

const RoutinesStackNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="RoutineList" component={RoutineListScreen} />
      <Stack.Screen name="RoutineEdit" component={RoutineEditScreen} />
    </Stack.Navigator>
  );
};

export default RoutinesStackNavigator;
