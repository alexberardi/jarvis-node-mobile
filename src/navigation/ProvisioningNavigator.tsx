import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ProvisioningProvider } from '../contexts/ProvisioningContext';
import ScanForNodesScreen from '../screens/Provisioning/ScanForNodesScreen';
import NodeInfoScreen from '../screens/Provisioning/NodeInfoScreen';
import SelectNetworkScreen from '../screens/Provisioning/SelectNetworkScreen';
import EnterPasswordScreen from '../screens/Provisioning/EnterPasswordScreen';
import ProvisioningProgressScreen from '../screens/Provisioning/ProvisioningProgressScreen';
import SuccessScreen from '../screens/Provisioning/SuccessScreen';
import { ProvisioningStackParamList } from './types';

const Stack = createNativeStackNavigator<ProvisioningStackParamList>();

const ProvisioningNavigator = () => {
  return (
    <ProvisioningProvider>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="ScanForNodes" component={ScanForNodesScreen} />
        <Stack.Screen name="NodeInfo" component={NodeInfoScreen} />
        <Stack.Screen name="SelectNetwork" component={SelectNetworkScreen} />
        <Stack.Screen name="EnterPassword" component={EnterPasswordScreen} />
        <Stack.Screen name="ProvisioningProgress" component={ProvisioningProgressScreen} />
        <Stack.Screen name="Success" component={SuccessScreen} />
      </Stack.Navigator>
    </ProvisioningProvider>
  );
};

export default ProvisioningNavigator;
