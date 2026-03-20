import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback } from 'react';

import ImportKeyScreen from '../screens/ImportKey/ImportKeyScreen';
import NodeListScreen from '../screens/Nodes/NodeListScreen';
import NodeSettingsScreen from '../screens/Nodes/NodeSettingsScreen';
import IntegrationAuthScreen from '../screens/Settings/IntegrationAuthScreen';
import ProvisioningNavigator from './ProvisioningNavigator';
import { NodesStackParamList } from './types';

const Stack = createNativeStackNavigator<NodesStackParamList>();

const ImportKeyWrapper = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<NodesStackParamList>>();
  const handleDone = useCallback(() => navigation.goBack(), [navigation]);
  return <ImportKeyScreen onComplete={handleDone} onCancel={handleDone} />;
};

const NodesStackNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="NodeList" component={NodeListScreen} />
      <Stack.Screen name="AddNode" component={ProvisioningNavigator} />
      <Stack.Screen name="NodeSettings" component={NodeSettingsScreen} />
      <Stack.Screen name="ImportKey" component={ImportKeyWrapper} />
      <Stack.Screen name="IntegrationAuth" component={IntegrationAuthScreen} />
    </Stack.Navigator>
  );
};

export default NodesStackNavigator;
