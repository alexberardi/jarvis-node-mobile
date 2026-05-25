import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { StyleSheet, View, Linking, Platform } from 'react-native';
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
  const { isDark, toggleTheme, paperTheme } = useThemePreference();
  const [showDevMode, setShowDevMode] = useState(DEV_MODE);
  const [devIp, setDevIp] = useState(SIMULATED_NODE_IP);
  const [devPort, setDevPort] = useState(String(NODE_PORT));
  // Track whether we've already fetched the provisioning token
  const [tokenReady, setTokenReady] = useState(false);
  const [fetchingToken, setFetchingToken] = useState(false);

  // Phase 1: Fetch provisioning token while still on home WiFi
  const handlePrepare = async () => {
    if (!authState.accessToken || !authState.activeHouseholdId) {
      setError('Not authenticated or no household selected');
      return;
    }

    setFetchingToken(true);
    const tokenSuccess = await fetchProvisioningToken(
      authState.activeHouseholdId,
    );
    setFetchingToken(false);

    if (tokenSuccess) {
      setTokenReady(true);
    }
  };

  // Phase 2: Connect to node (token already cached, user is now on node WiFi)
  const handleConnectAPMode = async () => {
    const success = await connect(AP_MODE_IP, AP_MODE_PORT);
    if (success) {
      navigation.navigate('NodeInfo');
    }
  };

  const handleConnectDevMode = async () => {
    // Dev mode: fetch token + connect in one step (assumes home network can reach both)
    if (!authState.accessToken || !authState.activeHouseholdId) {
      setError('Not authenticated or no household selected');
      return;
    }

    if (!tokenReady) {
      const tokenSuccess = await fetchProvisioningToken(
        authState.activeHouseholdId,
      );
      if (!tokenSuccess) return;
    }

    const success = await connect(devIp, parseInt(devPort, 10) || 8080);
    if (success) {
      navigation.navigate('NodeInfo');
    }
  };

  const openWiFiSettings = async () => {
    // Android: there's a public intent that lands directly on the WiFi pane.
    if (Platform.OS === 'android') {
      try {
        await Linking.sendIntent('android.settings.WIFI_SETTINGS');
        return;
      } catch {
        // fall through to the generic openSettings fallback below
      }
    }
    // iOS: `App-Prefs:root=WIFI` was a private URL scheme Apple progressively
    // blocked; on modern iOS it falls back to the app's own settings page
    // (Settings → Apps → Jarvis), which is the bug we're fixing. There is no
    // public API for jumping directly to the WiFi pane, so the best we can do
    // is open Settings root and let the user tap WiFi themselves — the
    // adjacent instruction text covers this.
    try {
      await Linking.openURL('App-Prefs:');
    } catch {
      await Linking.openSettings();
    }
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

            {!tokenReady ? (
              <>
                <Text variant="bodyMedium" style={styles.instructions}>
                  1. Power on your new Jarvis node{'\n'}
                  2. Make sure you're on your home WiFi{'\n'}
                  3. Tap "Prepare" to get a provisioning token
                </Text>

                <Button
                  testID="prepare-button"
                  mode="contained"
                  onPress={handlePrepare}
                  loading={fetchingToken}
                  disabled={fetchingToken || isLoading}
                  style={styles.button}
                  icon="key-variant"
                >
                  Prepare
                </Button>
              </>
            ) : (
              <>
                <Text variant="bodyMedium" style={styles.instructions}>
                  Token ready! Now:{'\n'}
                  1. Connect to the node's WiFi (Jarvis-XXXX){'\n'}
                  2. Tap "Connect to Node" below
                </Text>

                <Button
                  mode="outlined"
                  onPress={openWiFiSettings}
                  style={styles.wifiButton}
                  icon="wifi"
                >
                  Open Settings
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
              </>
            )}
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
          <Card style={[styles.devCard, { backgroundColor: paperTheme.colors.surfaceVariant }]}>
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
