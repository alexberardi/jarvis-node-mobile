import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { Portal } from 'react-native-paper';

import { HelpProvider } from '../components/HelpProvider';
import MemoriesEditScreen from '../screens/Memories/MemoriesEditScreen';
import MemoriesListScreen from '../screens/Memories/MemoriesListScreen';
import { MemoriesStackParamList } from './types';

const Stack = createNativeStackNavigator<MemoriesStackParamList>();

const MemoriesStackNavigator = () => {
  return (
    <Portal.Host>
      <HelpProvider>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="MemoriesList" component={MemoriesListScreen} />
          <Stack.Screen name="MemoryEdit" component={MemoriesEditScreen} />
        </Stack.Navigator>
      </HelpProvider>
    </Portal.Host>
  );
};

export default MemoriesStackNavigator;
