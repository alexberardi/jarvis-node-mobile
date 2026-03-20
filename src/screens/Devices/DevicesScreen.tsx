import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Divider,
  FAB,
  List,
  Snackbar,
  Text,
  useTheme,
} from 'react-native-paper';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { listDevices, listRooms } from '../../api/smartHomeApi';
import { listNodes, NodeInfo } from '../../api/nodeApi';
import { useAuth } from '../../auth/AuthContext';
import type { DeviceListItem, Room } from '../../types/SmartHome';
import type { DevicesStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<DevicesStackParamList>;

const DOMAIN_ICONS: Record<string, string> = {
  light: 'lightbulb-outline',
  switch: 'power-plug-outline',
  fan: 'fan',
  cover: 'window-shutter',
  lock: 'lock-outline',
  climate: 'thermostat',
  vacuum: 'robot-vacuum',
  scene: 'palette-outline',
  script: 'script-outline',
  media_player: 'speaker',
};

interface DeviceGroup {
  title: string;
  roomId: string | null;
  devices: DeviceListItem[];
}

const DevicesScreen = () => {
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const { state: authState } = useAuth();
  const queryClient = useQueryClient();
  const householdId = authState.activeHouseholdId;
  const [snackbar, setSnackbar] = useState('');

  const {
    data: devices,
    isLoading: devicesLoading,
    refetch: refetchDevices,
  } = useQuery({
    queryKey: ['devices', householdId],
    queryFn: () => listDevices(householdId!),
    enabled: !!householdId,
    staleTime: 30_000,
  });

  const { data: rooms } = useQuery({
    queryKey: ['rooms', householdId],
    queryFn: () => listRooms(householdId!),
    enabled: !!householdId,
    staleTime: 30_000,
  });

  // Refresh when screen is focused (e.g., coming back from import)
  useFocusEffect(
    useCallback(() => {
      if (householdId) {
        queryClient.invalidateQueries({ queryKey: ['devices', householdId] });
        queryClient.invalidateQueries({ queryKey: ['rooms', householdId] });
      }
    }, [householdId, queryClient]),
  );

  const roomMap = new Map<string, Room>();
  rooms?.forEach((r) => roomMap.set(r.id, r));

  // Group devices by room
  const groups: DeviceGroup[] = [];
  if (devices) {
    const byRoom = new Map<string | null, DeviceListItem[]>();
    for (const d of devices) {
      const key = d.room_id;
      if (!byRoom.has(key)) byRoom.set(key, []);
      byRoom.get(key)!.push(d);
    }
    // Named rooms first (sorted), then unassigned
    const sortedKeys = [...byRoom.keys()].sort((a, b) => {
      if (a === null) return 1;
      if (b === null) return -1;
      const nameA = roomMap.get(a)?.name ?? '';
      const nameB = roomMap.get(b)?.name ?? '';
      return nameA.localeCompare(nameB);
    });
    for (const key of sortedKeys) {
      groups.push({
        title: key ? (roomMap.get(key)?.name ?? 'Unknown Room') : 'Unassigned',
        roomId: key,
        devices: byRoom.get(key)!,
      });
    }
  }

  const startScan = useCallback(async () => {
    try {
      const nodes: NodeInfo[] = await listNodes();
      if (nodes.length === 0) {
        setSnackbar('No nodes available. Add a node first.');
        return;
      }
      if (nodes.length === 1) {
        navigation.navigate('DeviceDiscovery', { nodeId: nodes[0].node_id });
      } else {
        // Show picker via alert-style
        // For simplicity, use the first node and show a snackbar
        // TODO: proper node picker modal
        navigation.navigate('DeviceDiscovery', { nodeId: nodes[0].node_id });
        setSnackbar(`Scanning with node: ${nodes[0].room || nodes[0].node_id}`);
      }
    } catch {
      setSnackbar('Failed to fetch nodes');
    }
  }, [navigation]);

  if (!householdId) {
    return (
      <View style={styles.centered}>
        <Text variant="bodyLarge">No household selected</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.Content title="Devices" />
        <Appbar.Action
          icon="door"
          onPress={() => navigation.navigate('RoomManagement')}
        />
        <Appbar.Action icon="plus" onPress={startScan} />
      </Appbar.Header>

      {devicesLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Loading devices...</Text>
        </View>
      ) : !devices || devices.length === 0 ? (
        <View style={styles.centered}>
          <Text variant="bodyLarge" style={{ opacity: 0.6, textAlign: 'center' }}>
            No devices yet.{'\n'}Tap + to scan for devices.
          </Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.roomId ?? '__unassigned'}
          refreshing={devicesLoading}
          onRefresh={() => refetchDevices()}
          renderItem={({ item: group }) => (
            <List.Section>
              <List.Subheader>{group.title.toUpperCase()}</List.Subheader>
              {group.devices.map((device) => {
                const icon = DOMAIN_ICONS[device.domain] || 'devices';
                const subtitle = [
                  device.manufacturer,
                  device.protocol || (device.source === 'home_assistant' ? 'HA' : null),
                  device.local_ip,
                ]
                  .filter(Boolean)
                  .join(' \u00B7 ');

                return (
                  <React.Fragment key={device.id}>
                    <List.Item
                      title={device.name}
                      description={subtitle || device.entity_id}
                      left={(props) => <List.Icon {...props} icon={icon} />}
                      onPress={() =>
                        navigation.navigate('DeviceEdit', {
                          deviceId: device.id,
                          householdId: device.household_id,
                        })
                      }
                    />
                    <Divider />
                  </React.Fragment>
                );
              })}
            </List.Section>
          )}
        />
      )}

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        color={theme.colors.onPrimary}
        onPress={startScan}
      />

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar('')}
        duration={3000}
      >
        {snackbar}
      </Snackbar>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: { marginTop: 12, opacity: 0.6 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
});

export default DevicesScreen;
