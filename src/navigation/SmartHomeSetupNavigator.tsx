import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { Portal } from 'react-native-paper';

import { HelpProvider } from '../components/HelpProvider';
import SmartHomeSetupScreen from '../screens/SmartHome/SmartHomeSetupScreen';
import HADiscoveryScreen from '../screens/SmartHome/HADiscoveryScreen';
import HAAuthScreen from '../screens/SmartHome/HAAuthScreen';
import HADeviceImportScreen from '../screens/SmartHome/HADeviceImportScreen';
import DeviceRoomAssignmentScreen from '../screens/SmartHome/DeviceRoomAssignmentScreen';
import DeviceDiscoveryScreen from '../screens/SmartHome/DeviceDiscoveryScreen';
import DeviceListScreen from '../screens/SmartHome/DeviceListScreen';
import IntegrationAuthScreen from '../screens/Settings/IntegrationAuthScreen';
import { SmartHomeSetupParamList } from './types';

const Stack = createNativeStackNavigator<SmartHomeSetupParamList>();

const SmartHomeSetupNavigator = () => {
  // Modal screens need their own Portal.Host + HelpProvider so the
  // HelpIcon snackbar renders within the modal's view layer instead of
  // being trapped behind it by the root-level Portal.
  return (
    <Portal.Host>
      <HelpProvider>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="SmartHomeSetup" component={SmartHomeSetupScreen} />
          <Stack.Screen name="HADiscovery" component={HADiscoveryScreen} />
          <Stack.Screen name="HAAuth" component={HAAuthScreen} />
          <Stack.Screen name="HADeviceImport" component={HADeviceImportScreen} />
          <Stack.Screen name="DeviceRoomAssignment" component={DeviceRoomAssignmentScreen} />
          <Stack.Screen name="DeviceDiscovery" component={DeviceDiscoveryScreen} />
          <Stack.Screen name="DeviceList" component={DeviceListScreen} />
          <Stack.Screen name="IntegrationAuth" component={IntegrationAuthScreen} />
        </Stack.Navigator>
      </HelpProvider>
    </Portal.Host>
  );
};

export default SmartHomeSetupNavigator;
