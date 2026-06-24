import { CommonActions, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';

import { useAuth } from '../../auth/AuthContext';
import { InfoHelperText } from '../../components/HelpIcon';
import { K2BackupCard } from '../../components/K2QRCode';
import { usePendingNode } from '../../contexts/PendingNodeContext';
import { useProvisioningContext } from '../../contexts/ProvisioningContext';
import { helpCopy } from '../../copy/help';
import { ProvisioningStackParamList, RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProvisioningStackParamList, 'Success'>;

const SuccessScreen = ({ navigation }: Props) => {
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { provisioningResult, k2KeyPair, reset } = useProvisioningContext();
  const { markPending } = usePendingNode();
  const { state: authState } = useAuth();
  const theme = useTheme();
  const [showBackup, setShowBackup] = useState(false);

  // The node is now booting and will register with the command center once it
  // joins WiFi. Flag it as pending so the chat screen polls for it and selects
  // it the moment it comes online — no app restart needed. Marking it here (not
  // on "Done") lets polling run in the background while the user sets up the
  // smart home or backs up their key. Scope it to the active household so a
  // later household switch doesn't strand the chat screen polling for it.
  const newNodeId = provisioningResult?.node_id;
  const householdId = authState.activeHouseholdId;
  useEffect(() => {
    if (newNodeId) markPending(newNodeId, householdId);
  }, [newNodeId, householdId, markPending]);

  const handleDone = () => {
    reset();
    // navigation.reset() here only resets the inner ProvisioningNavigator
    // (would send the user back to ScanForNodes inside AddNode), not
    // OUT of the provisioning flow. Reset the parent NodesStack back to
    // NodeList so the provisioning flow isn't left on-screen behind us.
    const parent = navigation.getParent();
    if (parent) {
      parent.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'NodeList' }],
        }),
      );
    } else {
      navigation.reset({
        index: 0,
        routes: [{ name: 'ScanForNodes' }],
      });
    }
    // Land on the chat tab so the new node's "Setting up… → ready" reveal
    // happens where the user can watch it: the chat screen is already polling
    // and will auto-select the node the moment it comes online.
    rootNav.navigate('Main', { screen: 'HomeTab' });
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
        {k2KeyPair && <InfoHelperText text={helpCopy.k2.alwaysVisible} />}
        <Button
          mode="contained"
          onPress={handleSetupSmartHome}
          style={styles.button}
        >
          Set Up Smart Home
        </Button>
        {k2KeyPair && (
          <Button
            testID="backup-encryption-key-button"
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
