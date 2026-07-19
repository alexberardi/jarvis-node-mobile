import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { Portal } from 'react-native-paper';

import { HelpProvider } from '../components/HelpProvider';
import PhonebookEditScreen from '../screens/Phonebook/PhonebookEditScreen';
import PhonebookListScreen from '../screens/Phonebook/PhonebookListScreen';
import { PhonebookStackParamList } from './types';

const Stack = createNativeStackNavigator<PhonebookStackParamList>();

const PhonebookStackNavigator = () => {
  return (
    <Portal.Host>
      <HelpProvider>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="PhonebookList" component={PhonebookListScreen} />
          <Stack.Screen name="PhonebookEdit" component={PhonebookEditScreen} />
        </Stack.Navigator>
      </HelpProvider>
    </Portal.Host>
  );
};

export default PhonebookStackNavigator;
