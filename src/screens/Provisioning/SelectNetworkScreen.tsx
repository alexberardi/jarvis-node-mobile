import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Appbar, List, Text, ActivityIndicator } from 'react-native-paper';

import { useProvisioningContext } from '../../contexts/ProvisioningContext';
import { ProvisioningStackParamList } from '../../navigation/types';
import { Network } from '../../types/Provisioning';

type Props = NativeStackScreenProps<ProvisioningStackParamList, 'SelectNetwork'>;

const getSignalIcon = (strength: number): string => {
  if (strength > -50) return 'wifi-strength-4';
  if (strength > -60) return 'wifi-strength-3';
  if (strength > -70) return 'wifi-strength-2';
  return 'wifi-strength-1';
};

const SelectNetworkScreen = ({ navigation }: Props) => {
  const { networks, selectNetwork, isLoading, fetchNetworks } = useProvisioningContext();

  const handleSelectNetwork = (network: Network) => {
    selectNetwork(network);
    navigation.navigate('EnterPassword');
  };

  const renderNetwork = ({ item }: { item: Network }) => (
    <List.Item
      title={item.ssid}
      description={item.security}
      left={(props) => (
        <List.Icon {...props} icon={getSignalIcon(item.signal_strength)} />
      )}
      right={() => <Text style={styles.signalText}>{item.signal_strength} dBm</Text>}
      onPress={() => handleSelectNetwork(item)}
      style={styles.networkItem}
    />
  );

  if (isLoading) {
    return (
      <>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => navigation.goBack()} />
          <Appbar.Content title="Select Network" />
        </Appbar.Header>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Scanning for networks...</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Select Network" />
        <Appbar.Action icon="refresh" onPress={fetchNetworks} />
      </Appbar.Header>
      <View style={styles.container}>
        <Text variant="bodyMedium" style={styles.description}>
          Select a WiFi network for your Jarvis node to connect to.
        </Text>

        <FlatList
          data={networks}
          renderItem={renderNetwork}
          keyExtractor={(item) => item.ssid}
          style={styles.list}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No networks found. Try refreshing.</Text>
          }
        />
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
  },
  description: {
    marginBottom: 16,
    opacity: 0.7,
  },
  list: {
    flex: 1,
  },
  networkItem: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  signalText: {
    alignSelf: 'center',
    opacity: 0.6,
    fontSize: 12,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 32,
    opacity: 0.6,
  },
});

export default SelectNetworkScreen;
