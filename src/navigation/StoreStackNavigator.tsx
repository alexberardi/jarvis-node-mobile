import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import PantryGate from '../components/PantryGate';
import InstallProgressScreen from '../screens/Store/InstallProgressScreen';
import NodePickerSheet from '../screens/Store/NodePickerSheet';
import StoreBrowseScreen from '../screens/Store/StoreBrowseScreen';
import StoreDetailScreen from '../screens/Store/StoreDetailScreen';
import TestInstallScreen from '../screens/Store/TestInstallScreen';
import { StoreStackParamList } from './types';

const Stack = createNativeStackNavigator<StoreStackParamList>();

// Every Pantry screen sits behind the household's `pantry.enabled` gate, so the
// tab, `navigate('StoreTab', { screen })` and any deep link into the stack are
// all covered — nothing in here mounts (or contacts the Pantry) until it's on.
const StoreStackNavigator = () => {
  return (
    <PantryGate>
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="StoreBrowse" component={StoreBrowseScreen} />
      <Stack.Screen name="StoreDetail" component={StoreDetailScreen} />
      <Stack.Screen name="NodePickerSheet" component={NodePickerSheet} />
      <Stack.Screen name="InstallProgress" component={InstallProgressScreen} />
      <Stack.Screen name="TestInstall" component={TestInstallScreen} />
    </Stack.Navigator>
    </PantryGate>
  );
};

export default StoreStackNavigator;
