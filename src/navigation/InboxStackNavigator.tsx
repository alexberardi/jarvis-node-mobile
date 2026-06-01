import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { Portal } from 'react-native-paper';

import { HelpProvider } from '../components/HelpProvider';
import AdapterDeployedScreen from '../screens/Inbox/AdapterDeployedScreen';
import AdapterProposalDetailScreen from '../screens/Inbox/AdapterProposalDetailScreen';
import AdapterProposalScreen from '../screens/Inbox/AdapterProposalScreen';
import InboxDetailScreen from '../screens/Inbox/InboxDetailScreen';
import InboxListScreen from '../screens/Inbox/InboxListScreen';
import { InboxStackParamList } from './types';

const Stack = createNativeStackNavigator<InboxStackParamList>();

const InboxStackNavigator = () => {
  // Modal screens need their own Portal.Host + HelpProvider so the
  // HelpIcon snackbar renders within the modal's view layer instead of
  // being trapped behind it by the root-level Portal.
  return (
    <Portal.Host>
      <HelpProvider>
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
      </HelpProvider>
    </Portal.Host>
  );
};

export default InboxStackNavigator;
