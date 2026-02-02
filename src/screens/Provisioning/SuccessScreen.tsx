import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { K2BackupCard } from '../../components/K2QRCode';
import { useProvisioningContext } from '../../contexts/ProvisioningContext';
import { ProvisioningStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProvisioningStackParamList, 'Success'>;

const SuccessScreen = ({ navigation }: Props) => {
  const { provisioningResult, k2KeyPair, reset } = useProvisioningContext();
  const [showBackup, setShowBackup] = useState(false);

  const handleDone = () => {
    reset();
    navigation.reset({
      index: 0,
      routes: [{ name: 'ScanForNodes' }],
    });
  };

  const roomLabel = provisioningResult?.room_name
    ?.replace('_', ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());

  // Show QR backup flow
  if (showBackup && k2KeyPair) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <K2BackupCard keyPair={k2KeyPair} onDone={() => setShowBackup(false)} />
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text variant="displaySmall" style={styles.checkmark}>
          ✓
        </Text>

        <Text variant="headlineMedium" style={styles.title}>
          Success!
        </Text>

        <Text variant="bodyLarge" style={styles.description}>
          Your Jarvis node has been provisioned and is ready to use.
        </Text>

        <View style={styles.details}>
          <Text variant="titleMedium" style={styles.nodeId}>
            {provisioningResult?.node_id}
          </Text>
          <Text variant="bodyMedium" style={styles.room}>
            Location: {roomLabel}
          </Text>
        </View>
      </View>

      <View style={styles.buttonContainer}>
        {k2KeyPair && (
          <Button
            mode="outlined"
            onPress={() => setShowBackup(true)}
            style={styles.button}
            icon="qrcode"
          >
            Backup Encryption Key
          </Button>
        )}
        <Button
          testID="done-button"
          mode="contained"
          onPress={handleDone}
          style={styles.button}
        >
          Done
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    fontSize: 80,
    color: '#22c55e',
    marginBottom: 24,
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 16,
  },
  description: {
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 32,
    paddingHorizontal: 32,
  },
  details: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 12,
  },
  nodeId: {
    fontWeight: '600',
    marginBottom: 8,
  },
  room: {
    opacity: 0.7,
  },
  buttonContainer: {
    marginBottom: 32,
    gap: 12,
  },
  button: {},
});

export default SuccessScreen;
