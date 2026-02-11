import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { StyleSheet, View, Linking } from 'react-native';
import { Appbar, Button, Card, HelperText, Text, TextInput, Divider } from 'react-native-paper';

import { useAuth } from '../../auth/AuthContext';
import { useProvisioningContext } from '../../contexts/ProvisioningContext';
import { ProvisioningStackParamList } from '../../navigation/types';
import { SIMULATED_NODE_IP, NODE_PORT, DEV_MODE } from '../../config/env';
import { useThemePreference } from '../../theme/ThemeProvider';

type Props = NativeStackScreenProps<ProvisioningStackParamList, 'ScanForNodes'>;

// Standard AP mode address for Jarvis nodes
const AP_MODE_IP = '192.168.4.1';
const AP_MODE_PORT = 8080;

const ScanForNodesScreen = ({ navigation }: Props) => {
  const { state: authState } = useAuth();
  const { logout } = useAuth();
  const { connect, isLoading, error, fetchProvisioningToken, setError } = useProvisioningContext();
  const { isDark, toggleTheme } = useThemePreference();
  const [showDevMode, setShowDevMode] = useState(DEV_MODE);
  const [devIp, setDevIp] = useState(SIMULATED_NODE_IP);
  const [devPort, setDevPort] = useState(String(NODE_PORT));

  const handleConnectAPMode = async () => {
    // Fetch provisioning token while still on home WiFi
    if (!authState.accessToken || !authState.activeHouseholdId) {
      setError('Not authenticated or no household selected');
      return;
    }

    const tokenSuccess = await fetchProvisioningToken(
      authState.activeHouseholdId,
      authState.accessToken
    );
    if (!tokenSuccess) {
      return; // Error already set by fetchProvisioningToken
    }

    const success = await connect(AP_MODE_IP, AP_MODE_PORT);
    if (success) {
      navigation.navigate('NodeInfo');
    }
  };

  const handleConnectDevMode = async () => {
    // Fetch provisioning token while still on home WiFi
    if (!authState.accessToken || !authState.activeHouseholdId) {
      setError('Not authenticated or no household selected');
      return;
    }

    const tokenSuccess = await fetchProvisioningToken(
      authState.activeHouseholdId,
      authState.accessToken
    );
    if (!tokenSuccess) {
      return; // Error already set by fetchProvisioningToken
    }

    const success = await connect(devIp, parseInt(devPort, 10) || 8080);
    if (success) {
      navigation.navigate('NodeInfo');
    }
  };

  const openWiFiSettings = () => {
    Linking.openURL('App-Prefs:WIFI');
  };

  return (
    <>
      <Appbar.Header>
        <Appbar.Content title="Add Node" />
        <Appbar.Action
          icon={isDark ? 'weather-sunny' : 'weather-night'}
          onPress={toggleTheme}
          accessibilityLabel="Toggle dark mode"
        />
        <Appbar.Action
          icon="logout"
          onPress={logout}
          accessibilityLabel="Logout"
        />
      </Appbar.Header>
      <View style={styles.container}>
        {/* Real provisioning mode */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.cardTitle}>
              Provision New Node
            </Text>
            <Text variant="bodyMedium" style={styles.instructions}>
              1. Power on your new Jarvis node{'\n'}
              2. Connect to its WiFi network (Jarvis-XXXX){'\n'}
              3. Tap "Connect to Node" below
            </Text>

            <Button
              mode="outlined"
              onPress={openWiFiSettings}
              style={styles.wifiButton}
              icon="wifi"
            >
              Open WiFi Settings
            </Button>

            <Button
              testID="connect-button"
              mode="contained"
              onPress={handleConnectAPMode}
              loading={isLoading && !showDevMode}
              disabled={isLoading}
              style={styles.button}
            >
              Connect to Node
            </Button>
          </Card.Content>
        </Card>

        {error && !showDevMode && (
          <HelperText type="error" visible>
            {error}
          </HelperText>
        )}

        {/* Dev/Simulator mode */}
        <Divider style={styles.divider} />

        <Button
          mode="text"
          onPress={() => setShowDevMode(!showDevMode)}
          style={styles.devToggle}
        >
          {showDevMode ? 'Hide' : 'Show'} Developer Options
        </Button>

        {showDevMode && (
          <Card style={styles.devCard}>
            <Card.Content>
              <Text variant="titleSmall" style={styles.devTitle}>
                Simulator Mode
              </Text>
              <Text variant="bodySmall" style={styles.devDescription}>
                Connect to provisioning simulator running on another machine.
              </Text>

              <View style={styles.row}>
                <TextInput
                  testID="ip-input"
                  label="IP Address"
                  value={devIp}
                  onChangeText={setDevIp}
                  keyboardType="numeric"
                  placeholder="192.168.1.100"
                  style={styles.ipInput}
                  dense
                />
                <TextInput
                  testID="port-input"
                  label="Port"
                  value={devPort}
                  onChangeText={setDevPort}
                  keyboardType="numeric"
                  placeholder="8080"
                  style={styles.portInput}
                  dense
                />
              </View>

              {error && showDevMode && (
                <HelperText type="error" visible>
                  {error}
                </HelperText>
              )}

              <Button
                mode="contained-tonal"
                onPress={handleConnectDevMode}
                loading={isLoading && showDevMode}
                disabled={!devIp || isLoading}
                style={styles.button}
              >
                Connect to Simulator
              </Button>
            </Card.Content>
          </Card>
        )}
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  card: {
    marginBottom: 16,
  },
  cardTitle: {
    marginBottom: 12,
    fontWeight: '600',
  },
  instructions: {
    marginBottom: 16,
    lineHeight: 24,
    opacity: 0.8,
  },
  wifiButton: {
    marginBottom: 12,
  },
  button: {
    marginTop: 8,
  },
  divider: {
    marginVertical: 16,
  },
  devToggle: {
    alignSelf: 'center',
  },
  devCard: {
    marginTop: 8,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  devTitle: {
    marginBottom: 4,
    fontWeight: '600',
  },
  devDescription: {
    marginBottom: 12,
    opacity: 0.7,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  ipInput: {
    flex: 3,
  },
  portInput: {
    flex: 1,
  },
});

export default ScanForNodesScreen;
