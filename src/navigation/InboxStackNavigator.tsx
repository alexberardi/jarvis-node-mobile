import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import AdapterDeployedScreen from '../screens/Inbox/AdapterDeployedScreen';
import AdapterProposalDetailScreen from '../screens/Inbox/AdapterProposalDetailScreen';
import AdapterProposalScreen from '../screens/Inbox/AdapterProposalScreen';
import InboxDetailScreen from '../screens/Inbox/InboxDetailScreen';
import InboxListScreen from '../screens/Inbox/InboxListScreen';
import { InboxStackParamList } from './types';

const Stack = createNativeStackNavigator<InboxStackParamList>();

const InboxStackNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="InboxList" component={InboxListScreen} />
      <Stack.Screen name="InboxDetail" component={InboxDetailScreen} />
      <Stack.Screen name="AdapterProposal" component={AdapterProposalScreen} />
      <Stack.Screen
        name="AdapterProposalDetail"
        component={AdapterProposalDetailScreen}
      />
      <Stack.Screen name="AdapterDeployed" component={AdapterDeployedScreen} />
    </Stack.Navigator>
  );
};

export default InboxStackNavigator;
