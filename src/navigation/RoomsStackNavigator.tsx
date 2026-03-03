import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import RoomListScreen from '../screens/Rooms/RoomListScreen';
import RoomDetailScreen from '../screens/Rooms/RoomDetailScreen';
import DeviceDetailScreen from '../screens/Devices/DeviceDetailScreen';
import { RoomsStackParamList } from './types';

const Stack = createNativeStackNavigator<RoomsStackParamList>();

const RoomsStackNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="RoomList" component={RoomListScreen} />
      <Stack.Screen name="RoomDetail" component={RoomDetailScreen} />
      <Stack.Screen name="DeviceDetail" component={DeviceDetailScreen} />
    </Stack.Navigator>
  );
};

export default RoomsStackNavigator;
