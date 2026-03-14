import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import InboxDetailScreen from '../screens/Inbox/InboxDetailScreen';
import InboxListScreen from '../screens/Inbox/InboxListScreen';
import { InboxStackParamList } from './types';

const Stack = createNativeStackNavigator<InboxStackParamList>();

const InboxStackNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="InboxList" component={InboxListScreen} />
      <Stack.Screen name="InboxDetail" component={InboxDetailScreen} />
    </Stack.Navigator>
  );
};

export default InboxStackNavigator;
