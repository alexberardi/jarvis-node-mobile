import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Appbar, Button, ProgressBar, Text } from 'react-native-paper';

import { useProvisioningContext } from '../../contexts/ProvisioningContext';
import { ProvisioningStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProvisioningStackParamList, 'ProvisioningProgress'>;

const ProvisioningProgressScreen = ({ navigation }: Props) => {
  const { state, progress, statusMessage, error, reset, confirmWifiSwitched, selectedNetwork } =
    useProvisioningContext();

  useEffect(() => {
    if (state === 'success') {
      navigation.navigate('Success');
    }
  }, [state, navigation]);

  const handleRetry = () => {
    reset();
    navigation.navigate('ScanForNodes');
  };

  const isError = state === 'error';
  const isAwaitingWifiSwitch = state === 'awaiting_wifi_switch';

  return (
    <>
      <Appbar.Header>
        <Appbar.Content title="Provisioning" />
      </Appbar.Header>
      <View style={styles.container}>
        <View style={styles.content}>
          <View testID="progress-indicator">
            <ProgressBar
              progress={progress / 100}
              style={styles.progressBar}
              color={isError ? '#ef4444' : undefined}
            />
          </View>

          <Text variant="headlineMedium" style={styles.percentage}>
            {progress}%
          </Text>

          <Text variant="bodyLarge" style={styles.statusMessage}>
            {statusMessage}
          </Text>

          {isAwaitingWifiSwitch && (
            <View style={styles.wifiSwitchContainer}>
              <Text variant="bodyMedium" style={styles.wifiSwitchText}>
                Credentials sent! The node is now connecting to "{selectedNetwork?.ssid}".
              </Text>
              <Text variant="bodyMedium" style={styles.wifiSwitchText}>
                Please reconnect your phone to your home WiFi network, then tap the button below.
              </Text>
              <Button
                mode="contained"
                onPress={confirmWifiSwitched}
                style={styles.wifiSwitchButton}
              >
                I've Reconnected to WiFi
              </Button>
            </View>
          )}

          {error && (
            <View style={styles.errorContainer}>
              <Text variant="bodyMedium" style={styles.errorText}>
                {error}
              </Text>
              <Button mode="contained" onPress={handleRetry} style={styles.retryButton}>
                Try Again
              </Button>
            </View>
          )}
        </View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressBar: {
    width: 280,
    height: 8,
    borderRadius: 4,
  },
  percentage: {
    marginTop: 24,
    fontWeight: 'bold',
  },
  statusMessage: {
    marginTop: 16,
    textAlign: 'center',
    opacity: 0.7,
  },
  errorContainer: {
    marginTop: 32,
    alignItems: 'center',
  },
  errorText: {
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    marginTop: 8,
  },
  wifiSwitchContainer: {
    marginTop: 32,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  wifiSwitchText: {
    textAlign: 'center',
    marginBottom: 12,
    opacity: 0.8,
  },
  wifiSwitchButton: {
    marginTop: 16,
  },
});

export default ProvisioningProgressScreen;
