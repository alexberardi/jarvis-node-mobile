import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  View,
} from 'react-native';
import {
  Button,
  Menu,
  Text,
  TextInput,
} from 'react-native-paper';

import { useAuth } from '../../auth/AuthContext';
import * as smartHomeApi from '../../api/smartHomeApi';
import { deriveHAUrls } from '../../services/haDiscoveryService';
import { encryptAndPushConfig } from '../../services/configPushService';
import {
  DeviceImportItem,
  EnrichedEntity,
  HAArea,
  Room,
} from '../../types/SmartHome';
import { SmartHomeSetupParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<
  SmartHomeSetupParamList,
  'DeviceRoomAssignment'
>;

interface RoomOption {
  id: string;
  name: string;
}

const DeviceRoomAssignmentScreen = ({ navigation, route }: Props) => {
  const { haUrl, haToken, source = 'home_assistant' } = route.params;
  const selectedDevices: (EnrichedEntity & {
    protocol?: string;
    local_ip?: string;
    mac_address?: string;
    cloud_id?: string;
  })[] = JSON.parse(route.params.selectedDevices);
  const haAreas: HAArea[] = JSON.parse(route.params.areas);

  const { state: authState } = useAuth();
  const householdId = authState.activeHouseholdId!;
  const accessToken = authState.accessToken!;

  // Build rooms from HA areas
  const initialRooms: RoomOption[] = useMemo(
    () => haAreas.map((a) => ({ id: `ha_${a.area_id}`, name: a.name })),
    [haAreas],
  );

  const [rooms, setRooms] = useState<RoomOption[]>(initialRooms);
  const [deviceRooms, setDeviceRooms] = useState<Record<string, string | null>>(
    () => {
      const map: Record<string, string | null> = {};
      for (const dev of selectedDevices) {
        if (dev.area_id) {
          map[dev.entity_id] = `ha_${dev.area_id}`;
        } else {
          map[dev.entity_id] = null;
        }
      }
      return map;
    },
  );
  const [newRoomName, setNewRoomName] = useState('');
  const [saving, setSaving] = useState(false);
  const [menuVisible, setMenuVisible] = useState<string | null>(null);
  const [nodeId, setNodeId] = useState('');

  const addRoom = () => {
    const name = newRoomName.trim();
    if (!name) return;
    const id = `new_${name.toLowerCase().replace(/\s+/g, '_')}`;
    if (rooms.find((r) => r.name.toLowerCase() === name.toLowerCase())) return;
    setRooms((prev) => [...prev, { id, name }]);
    setNewRoomName('');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. Create rooms in CC (dedup HA areas into Jarvis rooms)
      const roomIdMap = new Map<string, string>(); // local id -> CC room id

      for (const room of rooms) {
        // Check if any device uses this room
        const isUsed = Object.values(deviceRooms).includes(room.id);
        if (!isUsed) continue;

        try {
          const haAreaId = room.id.startsWith('ha_')
            ? room.id.replace('ha_', '')
            : undefined;
          const created = await smartHomeApi.createRoom(
            householdId,
            { name: room.name, ha_area_id: haAreaId },
          );
          roomIdMap.set(room.id, created.id);
        } catch (e: unknown) {
          // Room might already exist (409) — fetch existing rooms to get ID
          if (e && typeof e === 'object' && 'response' in e) {
            const resp = (e as { response?: { status?: number } }).response;
            if (resp?.status === 409) {
              const existingRooms = await smartHomeApi.listRooms(
                householdId,
              );
              const match = existingRooms.find(
                (r: Room) => r.normalized_name === room.name.toLowerCase(),
              );
              if (match) roomIdMap.set(room.id, match.id);
            }
          }
        }
      }

      // 2. Import devices
      const importItems: DeviceImportItem[] = selectedDevices.map((dev) => {
        const localRoomId = deviceRooms[dev.entity_id];
        const ccRoomId = localRoomId ? roomIdMap.get(localRoomId) : undefined;
        const item: DeviceImportItem = {
          entity_id: dev.entity_id,
          name: dev.name,
          domain: dev.domain,
          room_id: ccRoomId,
          device_class: dev.device_class || undefined,
          manufacturer: dev.manufacturer || undefined,
          model: dev.model || undefined,
          ha_device_id: dev.ha_device_id || undefined,
          source: source === 'direct' ? 'direct' : 'home_assistant',
        };
        if (source === 'direct') {
          item.protocol = dev.protocol || undefined;
          item.local_ip = dev.local_ip || undefined;
          item.mac_address = dev.mac_address || undefined;
          item.cloud_id = dev.cloud_id || undefined;
        }
        return item;
      });

      const result = await smartHomeApi.importDevices(
        householdId,
        importItems,
      );

      // 3. Push HA config to node (if node ID provided and source is HA)
      if (source !== 'direct' && nodeId.trim() && haUrl && haToken) {
        await pushHAConfigToNode(nodeId.trim());
      }

      Alert.alert(
        'Import Complete',
        `${result.created} created, ${result.updated} updated`,
        [
          {
            text: 'OK',
            onPress: () => navigation.getParent()?.goBack(),
          },
        ],
      );
    } catch (e) {
      Alert.alert(
        'Error',
        e instanceof Error ? e.message : 'Failed to save',
      );
    }
    setSaving(false);
  };

  const pushHAConfigToNode = async (targetNodeId: string) => {
    if (!haUrl || !haToken) return;
    const { restUrl, wsUrl } = deriveHAUrls(haUrl);
    await encryptAndPushConfig(
      targetNodeId,
      'home_assistant',
      {
        HOME_ASSISTANT_REST_URL: restUrl,
        HOME_ASSISTANT_WS_URL: wsUrl,
        HOME_ASSISTANT_API_KEY: haToken,
      },
    );
  };

  const renderDevice = useCallback(
    ({ item }: { item: EnrichedEntity }) => {
      const currentRoomId = deviceRooms[item.entity_id];
      const currentRoom = rooms.find((r) => r.id === currentRoomId);

      return (
        <View style={styles.deviceRow}>
          <View style={styles.deviceInfo}>
            <Text variant="bodyLarge">{item.name}</Text>
            <Text variant="bodySmall" style={styles.entityId}>
              {item.entity_id}
            </Text>
          </View>
          <Menu
            visible={menuVisible === item.entity_id}
            onDismiss={() => setMenuVisible(null)}
            anchor={
              <Button
                mode="outlined"
                compact
                onPress={() => setMenuVisible(item.entity_id)}
              >
                {currentRoom?.name || 'No room'}
              </Button>
            }
          >
            <Menu.Item
              title="No room"
              onPress={() => {
                setDeviceRooms((prev) => ({
                  ...prev,
                  [item.entity_id]: null,
                }));
                setMenuVisible(null);
              }}
            />
            {rooms.map((room) => (
              <Menu.Item
                key={room.id}
                title={room.name}
                onPress={() => {
                  setDeviceRooms((prev) => ({
                    ...prev,
                    [item.entity_id]: room.id,
                  }));
                  setMenuVisible(null);
                }}
              />
            ))}
          </Menu>
        </View>
      );
    },
    [deviceRooms, rooms, menuVisible],
  );

  return (
    <View style={styles.container}>
      <Text variant="headlineSmall" style={styles.title}>
        Assign Rooms
      </Text>
      <Text variant="bodyMedium" style={styles.subtitle}>
        {selectedDevices.length} devices to assign
      </Text>

      {/* Add new room */}
      <View style={styles.addRoomRow}>
        <TextInput
          mode="outlined"
          placeholder="New room name"
          value={newRoomName}
          onChangeText={setNewRoomName}
          style={styles.addRoomInput}
          dense
        />
        <Button mode="outlined" onPress={addRoom} disabled={!newRoomName.trim()}>
          Add
        </Button>
      </View>

      {/* Optional: node to push config to */}
      <TextInput
        mode="outlined"
        placeholder="Node ID (to push HA config)"
        value={nodeId}
        onChangeText={setNodeId}
        style={styles.nodeInput}
        dense
      />

      {/* Device list */}
      <FlatList
        data={selectedDevices}
        keyExtractor={(e) => e.entity_id}
        renderItem={renderDevice}
        style={styles.list}
      />

      <View style={styles.bottomActions}>
        <Button
          mode="contained"
          onPress={handleSave}
          loading={saving}
          disabled={saving}
        >
          Save
        </Button>
        <Button mode="text" onPress={() => navigation.goBack()}>
          Back
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 64 },
  title: { fontWeight: 'bold', paddingHorizontal: 16, marginBottom: 4 },
  subtitle: { paddingHorizontal: 16, opacity: 0.6, marginBottom: 12 },
  addRoomRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  addRoomInput: { flex: 1 },
  nodeInput: { marginHorizontal: 16, marginBottom: 12 },
  list: { flex: 1 },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  deviceInfo: { flex: 1 },
  entityId: { opacity: 0.5 },
  bottomActions: { padding: 16, gap: 8 },
});

export default DeviceRoomAssignmentScreen;
