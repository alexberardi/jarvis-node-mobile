import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, ScrollView, RefreshControl } from 'react-native';
import { Card, Text } from 'react-native-paper';

import { useAuth } from '../../auth/AuthContext';
import * as smartHomeApi from '../../api/smartHomeApi';
import { Room, Device } from '../../types/SmartHome';
import { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const HomeScreen = () => {
  const navigation = useNavigation<Nav>();
  const { state: authState } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const householdId = authState.activeHouseholdId;
  const accessToken = authState.accessToken;

  const loadData = useCallback(async () => {
    if (!householdId || !accessToken) return;
    try {
      const [r, d] = await Promise.all([
        smartHomeApi.listRooms(householdId, accessToken),
        smartHomeApi.listDevices(householdId, accessToken),
      ]);
      setRooms(r);
      setDevices(d);
    } catch {
      // Silently handle — data will show as 0
    }
  }, [householdId, accessToken]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text variant="headlineMedium" style={styles.title}>
          Jarvis
        </Text>
      </View>

      <Text variant="bodyMedium" style={styles.greeting}>
        Welcome, {authState.user?.username || authState.user?.email}
      </Text>

      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <Card.Content style={styles.statContent}>
            <Text variant="headlineLarge">{rooms.length}</Text>
            <Text variant="bodySmall">Rooms</Text>
          </Card.Content>
        </Card>
        <Card style={styles.statCard}>
          <Card.Content style={styles.statContent}>
            <Text variant="headlineLarge">{devices.length}</Text>
            <Text variant="bodySmall">Devices</Text>
          </Card.Content>
        </Card>
      </View>

      <View style={styles.actions}>
        <Card style={styles.actionCard} onPress={() => navigation.navigate('Main', { screen: 'NodesTab' })}>
          <Card.Content>
            <Text variant="titleMedium">Add Node</Text>
            <Text variant="bodySmall" style={styles.actionDesc}>
              Provision a new Pi Zero node
            </Text>
          </Card.Content>
        </Card>

        <Card style={styles.actionCard} onPress={() => navigation.navigate('SmartHomeSetup', { screen: 'SmartHomeSetup' })}>
          <Card.Content>
            <Text variant="titleMedium">Set Up Smart Home</Text>
            <Text variant="bodySmall" style={styles.actionDesc}>
              Connect Home Assistant
            </Text>
          </Card.Content>
        </Card>

        <Card style={styles.actionCard} onPress={() => navigation.navigate('Main', { screen: 'RoomsTab' })}>
          <Card.Content>
            <Text variant="titleMedium">Manage Rooms</Text>
            <Text variant="bodySmall" style={styles.actionDesc}>
              Organize devices by room
            </Text>
          </Card.Content>
        </Card>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 48,
  },
  title: { fontWeight: 'bold' },
  greeting: { opacity: 0.6, marginBottom: 24 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statCard: { flex: 1 },
  statContent: { alignItems: 'center', paddingVertical: 16 },
  actions: { gap: 12 },
  actionCard: {},
  actionDesc: { opacity: 0.6, marginTop: 4 },
});

export default HomeScreen;
