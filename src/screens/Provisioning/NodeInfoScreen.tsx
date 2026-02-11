import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Appbar, Button, Card, Chip, Text } from 'react-native-paper';

import { useProvisioningContext } from '../../contexts/ProvisioningContext';
import { ProvisioningStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProvisioningStackParamList, 'NodeInfo'>;

const NodeInfoScreen = ({ navigation }: Props) => {
  const { nodeInfo, fetchNetworks, isLoading } = useProvisioningContext();

  const handleContinue = async () => {
    const success = await fetchNetworks();
    if (success) {
      navigation.navigate('SelectNetwork');
    }
  };

  if (!nodeInfo) {
    return (
      <>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => navigation.goBack()} />
          <Appbar.Content title="Node Info" />
        </Appbar.Header>
        <View style={styles.container}>
          <Text>No node info available</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Node Info" />
      </Appbar.Header>
      <View style={styles.container}>
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.nodeId}>
              {nodeInfo.node_id}
            </Text>

            <View style={styles.infoRow}>
              <Text variant="bodyMedium" style={styles.label}>
                Firmware:
              </Text>
              <Text variant="bodyMedium">{nodeInfo.firmware_version}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text variant="bodyMedium" style={styles.label}>
                Hardware:
              </Text>
              <Text variant="bodyMedium">{nodeInfo.hardware}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text variant="bodyMedium" style={styles.label}>
                MAC Address:
              </Text>
              <Text variant="bodyMedium">{nodeInfo.mac_address}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text variant="bodyMedium" style={styles.label}>
                Status:
              </Text>
              <Chip compact>{nodeInfo.state}</Chip>
            </View>

            <Text variant="bodyMedium" style={[styles.label, styles.capabilitiesLabel]}>
              Capabilities:
            </Text>
            <View style={styles.capabilities}>
              {nodeInfo.capabilities.map((cap) => (
                <Chip key={cap} style={styles.capabilityChip}>
                  {cap}
                </Chip>
              ))}
            </View>
          </Card.Content>
        </Card>

        <Button
          testID="continue-button"
          mode="contained"
          onPress={handleContinue}
          loading={isLoading}
          style={styles.button}
        >
          Continue to Network Selection
        </Button>
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
    marginBottom: 24,
  },
  nodeId: {
    marginBottom: 16,
    fontWeight: 'bold',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontWeight: '600',
    marginRight: 8,
    opacity: 0.7,
  },
  capabilitiesLabel: {
    marginTop: 8,
    marginBottom: 8,
  },
  capabilities: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  capabilityChip: {
    marginRight: 8,
  },
  button: {
    marginTop: 'auto',
  },
});

export default NodeInfoScreen;
