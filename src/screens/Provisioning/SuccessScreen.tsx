import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';

import { K2BackupCard } from '../../components/K2QRCode';
import { useProvisioningContext } from '../../contexts/ProvisioningContext';
import { ProvisioningStackParamList, RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProvisioningStackParamList, 'Success'>;

const SuccessScreen = ({ navigation }: Props) => {
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { provisioningResult, k2KeyPair, reset } = useProvisioningContext();
  const theme = useTheme();
  const [showBackup, setShowBackup] = useState(false);

  const handleDone = () => {
    reset();
    navigation.reset({
      index: 0,
      routes: [{ name: 'ScanForNodes' }],
    });
  };

  const handleSetupSmartHome = () => {
    reset();
    rootNav.navigate('SmartHomeSetup', { screen: 'SmartHomeSetup' });
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
        <Text variant="displaySmall" style={[styles.checkmark, { color: theme.colors.secondary }]}>
          ✓
        </Text>

        <Text variant="headlineMedium" style={styles.title}>
          Success!
        </Text>

        <Text variant="bodyLarge" style={styles.description}>
          Your Jarvis node has been provisioned and is ready to use.
        </Text>

        <View style={[styles.details, { backgroundColor: theme.colors.surfaceVariant }]}>
          <Text variant="titleMedium" style={styles.nodeId}>
            {provisioningResult?.node_id}
          </Text>
          <Text variant="bodyMedium" style={styles.room}>
            Location: {roomLabel}
          </Text>
        </View>
      </View>

      <View style={styles.buttonContainer}>
        <Button
          mode="contained"
          onPress={handleSetupSmartHome}
          style={styles.button}
        >
          Set Up Smart Home
        </Button>
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
          mode="text"
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
