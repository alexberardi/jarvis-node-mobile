import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import RoutineBuilderScreen from '../screens/Routines/RoutineBuilderScreen';
import RoutineEditScreen from '../screens/Routines/RoutineEditScreen';
import RoutineHistoryScreen from '../screens/Routines/RoutineHistoryScreen';
import RoutineListScreen from '../screens/Routines/RoutineListScreen';
import RoutineNodePickerScreen from '../screens/Routines/RoutineNodePickerScreen';
import PlaceholderResolverScreen from '../screens/Routines/PlaceholderResolverScreen';
import RoutineSuggestScreen from '../screens/Routines/RoutineSuggestScreen';
import { RoutinesStackParamList } from './types';

const Stack = createNativeStackNavigator<RoutinesStackParamList>();

const RoutinesStackNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="RoutineList" component={RoutineListScreen} />
      <Stack.Screen name="RoutineBuilder" component={RoutineBuilderScreen} />
      <Stack.Screen name="RoutineSuggest" component={RoutineSuggestScreen} />
      <Stack.Screen name="RoutineEdit" component={RoutineEditScreen} />
      <Stack.Screen name="RoutineNodePicker" component={RoutineNodePickerScreen} />
      <Stack.Screen name="RoutineHistory" component={RoutineHistoryScreen} />
      <Stack.Screen name="PlaceholderResolver" component={PlaceholderResolverScreen} />
    </Stack.Navigator>
  );
};

export default RoutinesStackNavigator;
