import { ActivityIndicator, View, StyleSheet } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import AuthNavigator from './AuthNavigator';
import ProvisioningNavigator from './ProvisioningNavigator';

const RootNavigator = () => {
  const {
    state: { isAuthenticated, isLoading },
  } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return isAuthenticated ? <ProvisioningNavigator /> : <AuthNavigator />;
};

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default RootNavigator;
