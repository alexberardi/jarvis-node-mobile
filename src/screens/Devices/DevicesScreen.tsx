import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Divider,
  FAB,
  List,
  Snackbar,
  Text,
  useTheme,
} from 'react-native-paper';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getSmartHomeConfig,
  listDevices,
  listRooms,
  pollDeviceList,
  requestDeviceList,
} from '../../api/smartHomeApi';
import { listNodes, NodeInfo } from '../../api/nodeApi';
import { useAuth } from '../../auth/AuthContext';
import type { DeviceListItem, ExternalDeviceItem, Room } from '../../types/SmartHome';
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
  kettle: 'kettle',
};

interface DeviceGroup {
  title: string;
  key: string;
  devices: DeviceListItem[];
}

interface ExternalDeviceGroup {
  title: string;
  key: string;
  devices: ExternalDeviceItem[];
}

// ---------------------------------------------------------------------------
// External device fetching (request + poll loop)
// ---------------------------------------------------------------------------

function useExternalDevices(
  nodeId: string | undefined,
  enabled: boolean,
  isFocused: boolean,
) {
  const [devices, setDevices] = useState<ExternalDeviceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const fetch = useCallback(async () => {
    if (!nodeId || !enabled) return;
    abortRef.current = false;
    setLoading(true);
    setError(null);
    try {
      const { id } = await requestDeviceList(nodeId);
      let attempts = 0;
      while (attempts < 30 && !abortRef.current) {
        await new Promise((r) => setTimeout(r, 1000));
        const result = await pollDeviceList(nodeId, id);
        if (result.status === 'completed') {
          setDevices(result.devices ?? []);
          return;
        }
        if (result.status === 'failed') {
          setError(result.error_message ?? 'Failed to fetch devices');
          return;
        }
        attempts++;
      }
      if (!abortRef.current) setError('Timed out waiting for device list');
    } catch (err) {
      if (!abortRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch devices');
      }
    } finally {
      if (!abortRef.current) setLoading(false);
    }
  }, [nodeId, enabled]);

  // Fetch on mount / when focused
  useEffect(() => {
    if (isFocused && enabled) fetch();
    return () => {
      abortRef.current = true;
    };
  }, [isFocused, enabled, fetch]);

  return { devices, loading, error, refetch: fetch };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DevicesScreen = () => {
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const { state: authState } = useAuth();
  const queryClient = useQueryClient();
  const householdId = authState.activeHouseholdId;
  const [snackbar, setSnackbar] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  // Smart home config (tells us whether to use external devices)
  const { data: smartHomeConfig } = useQuery({
    queryKey: ['smartHomeConfig', householdId],
    queryFn: () => getSmartHomeConfig(householdId!),
    enabled: !!householdId,
    staleTime: 30_000,
  });

  const useExternal = smartHomeConfig?.use_external_devices ?? false;
  const primaryNodeId = smartHomeConfig?.primary_node_id;

  // Track focus for external device fetching
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

  // ---- DB-backed device queries (when NOT external) ----
  const {
    data: devices,
    isLoading: devicesLoading,
    isError: devicesError,
    error: devicesQueryError,
    refetch: refetchDevices,
  } = useQuery({
    queryKey: ['devices', householdId],
    queryFn: () => listDevices(householdId!),
    enabled: !!householdId && !useExternal,
    staleTime: 30_000,
  });

  const { data: rooms } = useQuery({
    queryKey: ['rooms', householdId],
    queryFn: () => listRooms(householdId!),
    enabled: !!householdId && !useExternal,
    staleTime: 30_000,
  });

  // Refresh DB devices when screen is focused (only when not external)
  useFocusEffect(
    useCallback(() => {
      if (householdId && !useExternal) {
        queryClient.invalidateQueries({ queryKey: ['devices', householdId] });
        queryClient.invalidateQueries({ queryKey: ['rooms', householdId] });
      }
    }, [householdId, useExternal, queryClient]),
  );

  // ---- External device fetching (when external) ----
  const {
    devices: externalDevices,
    loading: externalLoading,
    error: externalError,
    refetch: refetchExternal,
  } = useExternalDevices(primaryNodeId, useExternal, isFocused);

  // ---- Grouping logic ----

  // DB devices grouped by room
  const roomMap = new Map<string, Room>();
  rooms?.forEach((r) => roomMap.set(r.id, r));

  const dbGroups: DeviceGroup[] = [];
  if (!useExternal && devices) {
    const byRoom = new Map<string | null, DeviceListItem[]>();
    for (const d of devices) {
      const key = d.room_id;
      if (!byRoom.has(key)) byRoom.set(key, []);
      byRoom.get(key)!.push(d);
    }
    const sortedKeys = [...byRoom.keys()].sort((a, b) => {
      if (a === null) return 1;
      if (b === null) return -1;
      const nameA = roomMap.get(a)?.name ?? '';
      const nameB = roomMap.get(b)?.name ?? '';
      return nameA.localeCompare(nameB);
    });
    for (const key of sortedKeys) {
      dbGroups.push({
        title: key ? (roomMap.get(key)?.name ?? 'Unknown Room') : 'Unassigned',
        key: key ?? '__unassigned',
        devices: byRoom.get(key)!,
      });
    }
  }

  // External devices grouped by area
  const extGroups: ExternalDeviceGroup[] = [];
  if (useExternal && externalDevices.length > 0) {
    const byArea = new Map<string, ExternalDeviceItem[]>();
    for (const d of externalDevices) {
      const area = d.area || 'Unassigned';
      if (!byArea.has(area)) byArea.set(area, []);
      byArea.get(area)!.push(d);
    }
    const sortedAreas = [...byArea.keys()].sort((a, b) => {
      if (a === 'Unassigned') return 1;
      if (b === 'Unassigned') return -1;
      return a.localeCompare(b);
    });
    for (const area of sortedAreas) {
      extGroups.push({
        title: area,
        key: area,
        devices: byArea.get(area)!,
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
      navigation.navigate('DeviceDiscovery', { nodeId: nodes[0].node_id });
      if (nodes.length > 1) {
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

  const isLoading = useExternal ? externalLoading : devicesLoading;
  const isEmpty = useExternal
    ? externalDevices.length === 0 && !externalLoading
    : !devices || devices.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.Content title="Devices" />
        {!useExternal && (
          <>
            <Appbar.Action
              icon="door"
              onPress={() => navigation.navigate('RoomManagement')}
            />
            <Appbar.Action icon="plus" onPress={startScan} />
          </>
        )}
      </Appbar.Header>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>
            {useExternal ? 'Fetching devices from node...' : 'Loading devices...'}
          </Text>
        </View>
      ) : externalError && useExternal ? (
        <View style={styles.centered}>
          <Text variant="bodyLarge" style={{ opacity: 0.6, textAlign: 'center' }}>
            {externalError}
          </Text>
          <Button mode="outlined" onPress={refetchExternal} style={{ marginTop: 16 }}>
            Retry
          </Button>
        </View>
      ) : devicesError && !useExternal ? (
        <View style={styles.centered}>
          <Text variant="bodyLarge" style={{ opacity: 0.6, textAlign: 'center', marginBottom: 12 }}>
            {devicesQueryError instanceof Error ? devicesQueryError.message : 'Failed to load devices.'}
          </Text>
          <Button mode="outlined" onPress={() => refetchDevices()}>
            Retry
          </Button>
        </View>
      ) : isEmpty ? (
        <View style={styles.centered}>
          <Text variant="bodyLarge" style={{ opacity: 0.6, textAlign: 'center' }}>
            {useExternal
              ? 'No external devices found.\nCheck your device manager and primary node settings.'
              : `No devices yet.\nTap + to scan for devices.`}
          </Text>
        </View>
      ) : useExternal ? (
        /* ---------- External device list ---------- */
        <FlatList
          data={extGroups}
          keyExtractor={(g) => g.key}
          refreshing={externalLoading}
          onRefresh={refetchExternal}
          renderItem={({ item: group }) => (
            <List.Section>
              <List.Subheader>{group.title.toUpperCase()}</List.Subheader>
              {group.devices.map((device) => {
                const icon = DOMAIN_ICONS[device.domain] || 'devices';
                const subtitle = [
                  device.manufacturer,
                  device.protocol || (device.source === 'home_assistant' ? 'HA' : null),
                  device.state,
                ]
                  .filter(Boolean)
                  .join(' \u00B7 ');

                return (
                  <React.Fragment key={device.entity_id}>
                    <List.Item
                      title={device.name}
                      description={subtitle || device.entity_id}
                      left={(props) => <List.Icon {...props} icon={icon} />}
                      onPress={() =>
                        navigation.navigate('ExternalDeviceDetail', {
                          device: JSON.stringify(device),
                          householdId: householdId!,
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
      ) : (
        /* ---------- DB-backed device list ---------- */
        <FlatList
          data={dbGroups}
          keyExtractor={(g) => g.key}
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

      {/* Hide FAB in external mode */}
      {!useExternal && (
        <FAB
          icon="plus"
          style={[styles.fab, { backgroundColor: theme.colors.primary }]}
          color={theme.colors.onPrimary}
          onPress={startScan}
        />
      )}

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
