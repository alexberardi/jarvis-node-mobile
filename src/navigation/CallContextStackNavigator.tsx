import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { Portal } from 'react-native-paper';

import { HelpProvider } from '../components/HelpProvider';
import CallContextEditScreen from '../screens/CallContext/CallContextEditScreen';
import CallContextListScreen from '../screens/CallContext/CallContextListScreen';
import { CallContextStackParamList } from './types';

const Stack = createNativeStackNavigator<CallContextStackParamList>();

const CallContextStackNavigator = () => {
  return (
    <Portal.Host>
      <HelpProvider>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="CallContextList" component={CallContextListScreen} />
          <Stack.Screen name="CallContextEdit" component={CallContextEditScreen} />
        </Stack.Navigator>
      </HelpProvider>
    </Portal.Host>
  );
};

export default CallContextStackNavigator;
