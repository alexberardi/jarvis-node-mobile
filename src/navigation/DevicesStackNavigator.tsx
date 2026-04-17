import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import DevicesScreen from '../screens/Devices/DevicesScreen';
import DeviceEditScreen from '../screens/Devices/DeviceEditScreen';
import ExternalDeviceDetailScreen from '../screens/Devices/ExternalDeviceDetailScreen';
import CameraViewScreen from '../screens/Devices/CameraViewScreen';
import RoomManagementScreen from '../screens/Devices/RoomManagementScreen';
import DeviceDiscoveryScreen from '../screens/SmartHome/DeviceDiscoveryScreen';
import { DevicesStackParamList } from './types';

const Stack = createNativeStackNavigator<DevicesStackParamList>();

const DevicesStackNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DevicesList" component={DevicesScreen} />
      <Stack.Screen name="DeviceEdit" component={DeviceEditScreen} />
      <Stack.Screen name="ExternalDeviceDetail" component={ExternalDeviceDetailScreen} />
      <Stack.Screen name="CameraView" component={CameraViewScreen} />
      <Stack.Screen name="RoomManagement" component={RoomManagementScreen} />
      <Stack.Screen name="DeviceDiscovery" component={DeviceDiscoveryScreen} />
    </Stack.Navigator>
  );
};

export default DevicesStackNavigator;
