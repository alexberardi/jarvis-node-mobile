import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Text,
  TextInput,
} from 'react-native-paper';

import { discoverHomeAssistant } from '../../services/haDiscoveryService';
import { SmartHomeSetupParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<SmartHomeSetupParamList, 'HADiscovery'>;

const HADiscoveryScreen = ({ navigation }: Props) => {
  const [scanning, setScanning] = useState(true);
  const [foundUrl, setFoundUrl] = useState<string | null>(null);
  const [manualIp, setManualIp] = useState('');
  const [progress, setProgress] = useState(0);

  const startScan = useCallback(async () => {
    setScanning(true);
    setFoundUrl(null);
    setProgress(0);

    const result = await discoverHomeAssistant((scanned, total) => {
      setProgress(Math.round((scanned / total) * 100));
    });

    setScanning(false);
    if (result.found && result.url) {
      setFoundUrl(result.url);
    }
  }, []);

  useEffect(() => {
    startScan();
  }, [startScan]);

  const handleConnect = (url: string) => {
    navigation.navigate('HAAuth', { haUrl: url });
  };

  const handleManualConnect = () => {
    const ip = manualIp.trim();
    if (!ip) return;
    const url = ip.includes('://') ? ip : `http://${ip}:8123`;
    handleConnect(url);
  };

  return (
    <View style={styles.container}>
      <Text variant="headlineSmall" style={styles.title}>
        Find Home Assistant
      </Text>

      {scanning && (
        <View style={styles.scanningContainer}>
          <ActivityIndicator size="large" style={styles.spinner} />
          <Text variant="bodyLarge" style={styles.scanText}>
            Scanning your network...
          </Text>
          <Text variant="bodySmall" style={styles.progressText}>
            {progress}% complete
          </Text>
        </View>
      )}

      {!scanning && foundUrl && (
        <View style={styles.foundContainer}>
          <Text variant="bodyLarge" style={styles.foundLabel}>
            Found Home Assistant at:
          </Text>
          <Text variant="titleMedium" style={styles.foundUrl}>
            {foundUrl}
          </Text>
          <Button
            mode="contained"
            onPress={() => handleConnect(foundUrl)}
            style={styles.button}
          >
            Connect
          </Button>
        </View>
      )}

      {!scanning && !foundUrl && (
        <View style={styles.notFoundContainer}>
          <Text variant="bodyLarge" style={styles.notFoundText}>
            Home Assistant not found on your network.
          </Text>
          <Text variant="bodyMedium" style={styles.manualLabel}>
            Enter the IP address manually:
          </Text>
          <TextInput
            mode="outlined"
            placeholder="192.168.1.100"
            value={manualIp}
            onChangeText={setManualIp}
            keyboardType="url"
            autoCapitalize="none"
            style={styles.input}
          />
          <Button
            mode="contained"
            onPress={handleManualConnect}
            disabled={!manualIp.trim()}
            style={styles.button}
          >
            Connect
          </Button>
        </View>
      )}

      <View style={styles.bottomActions}>
        {!scanning && foundUrl && (
          <>
            <Text variant="bodySmall" style={styles.orText}>
              Or enter IP manually:
            </Text>
            <TextInput
              mode="outlined"
              placeholder="192.168.1.100"
              value={manualIp}
              onChangeText={setManualIp}
              keyboardType="url"
              autoCapitalize="none"
              style={styles.input}
            />
            <Button
              mode="text"
              onPress={handleManualConnect}
              disabled={!manualIp.trim()}
            >
              Use manual address
            </Button>
          </>
        )}
        {!scanning && (
          <Button mode="text" onPress={startScan}>
            Scan again
          </Button>
        )}
        <Button mode="text" onPress={() => navigation.goBack()}>
          Back
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 64 },
  title: { fontWeight: 'bold', marginBottom: 32, textAlign: 'center' },
  scanningContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  spinner: { marginBottom: 16 },
  scanText: { textAlign: 'center', opacity: 0.7 },
  progressText: { textAlign: 'center', opacity: 0.5, marginTop: 8 },
  foundContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  foundLabel: { opacity: 0.7, marginBottom: 8 },
  foundUrl: { fontWeight: '600', marginBottom: 24 },
  notFoundContainer: { flex: 1, justifyContent: 'center' },
  notFoundText: { textAlign: 'center', opacity: 0.7, marginBottom: 24 },
  manualLabel: { opacity: 0.7, marginBottom: 8 },
  input: { marginBottom: 16 },
  button: { marginTop: 8 },
  bottomActions: { marginBottom: 32, gap: 4 },
  orText: { opacity: 0.5, textAlign: 'center', marginTop: 16 },
});

export default HADiscoveryScreen;
