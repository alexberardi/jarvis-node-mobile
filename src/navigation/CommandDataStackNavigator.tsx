import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import DataBrowserHomeScreen from '../screens/CommandData/DataBrowserHomeScreen';
import RecordDetailScreen from '../screens/CommandData/RecordDetailScreen';
import RecordEditScreen from '../screens/CommandData/RecordEditScreen';
import RecordsListScreen from '../screens/CommandData/RecordsListScreen';
import type { CommandDataStackParamList } from './types';

const Stack = createNativeStackNavigator<CommandDataStackParamList>();

const CommandDataStackNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="DataBrowserHome" component={DataBrowserHomeScreen} />
    <Stack.Screen name="DataBrowserRecords" component={RecordsListScreen} />
    <Stack.Screen name="DataBrowserDetail" component={RecordDetailScreen} />
    <Stack.Screen name="DataBrowserEdit" component={RecordEditScreen} />
  </Stack.Navigator>
);

export default CommandDataStackNavigator;
