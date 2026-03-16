import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import SmartHomeSetupScreen from '../screens/SmartHome/SmartHomeSetupScreen';
import HADiscoveryScreen from '../screens/SmartHome/HADiscoveryScreen';
import HAAuthScreen from '../screens/SmartHome/HAAuthScreen';
import HADeviceImportScreen from '../screens/SmartHome/HADeviceImportScreen';
import DeviceRoomAssignmentScreen from '../screens/SmartHome/DeviceRoomAssignmentScreen';
import DeviceListScreen from '../screens/SmartHome/DeviceListScreen';
import IntegrationAuthScreen from '../screens/Settings/IntegrationAuthScreen';
import { SmartHomeSetupParamList } from './types';

const Stack = createNativeStackNavigator<SmartHomeSetupParamList>();

const SmartHomeSetupNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SmartHomeSetup" component={SmartHomeSetupScreen} />
      <Stack.Screen name="HADiscovery" component={HADiscoveryScreen} />
      <Stack.Screen name="HAAuth" component={HAAuthScreen} />
      <Stack.Screen name="HADeviceImport" component={HADeviceImportScreen} />
      <Stack.Screen name="DeviceRoomAssignment" component={DeviceRoomAssignmentScreen} />
      <Stack.Screen name="DeviceList" component={DeviceListScreen} />
      <Stack.Screen name="IntegrationAuth" component={IntegrationAuthScreen} />
    </Stack.Navigator>
  );
};

export default SmartHomeSetupNavigator;
