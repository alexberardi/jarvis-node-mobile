import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Button, Text, TextInput, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAuth } from '../../auth/AuthContext';
import * as smartHomeApi from '../../api/smartHomeApi';
import { Device, Room } from '../../types/SmartHome';
import { RoomsStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RoomsStackParamList, 'RoomDetail'>;
type ListItem = { type: 'room'; room: Room } | { type: 'device'; device: Device };

const RoomDetailScreen = ({ navigation, route }: Props) => {
  const { roomId, roomName } = route.params;
  const { state: authState } = useAuth();
  const theme = useTheme();
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [newSubRoomName, setNewSubRoomName] = useState('');
  const [creating, setCreating] = useState(false);

  const householdId = authState.activeHouseholdId;
  const accessToken = authState.accessToken;

  const loadData = useCallback(async () => {
    if (!householdId || !accessToken) return;
    const [r, d] = await Promise.all([
      smartHomeApi.listRooms(householdId, accessToken),
      smartHomeApi.listDevices(householdId, accessToken, { room_id: roomId }),
    ]);
    setAllRooms(r);
    setDevices(d);
  }, [householdId, accessToken, roomId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const subRooms = allRooms.filter((r) => r.parent_room_id === roomId);

  const handleCreateSubRoom = async () => {
    if (!householdId || !accessToken || !newSubRoomName.trim()) return;
    setCreating(true);
    try {
      await smartHomeApi.createRoom(
        householdId,
        { name: newSubRoomName.trim(), parent_room_id: roomId },
        accessToken,
      );
      setNewSubRoomName('');
      await loadData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create sub-room';
      Alert.alert('Error', msg);
    }
    setCreating(false);
  };

  const handleDeleteRoom = () => {
    if (!householdId || !accessToken) return;
    Alert.alert('Delete Room', `Remove "${roomName}" and unassign its devices?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await smartHomeApi.deleteRoom(householdId, roomId, accessToken);
          navigation.goBack();
        },
      },
    ]);
  };

  const listItems: ListItem[] = [
    ...subRooms.map((room) => ({ type: 'room' as const, room })),
    ...devices.map((device) => ({ type: 'device' as const, device })),
  ];

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialCommunityIcons
            name="arrow-left"
            size={24}
            color={theme.colors.onSurface}
          />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text variant="headlineSmall" style={styles.title}>
            {roomName}
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            {subRooms.length > 0 ? `${subRooms.length} sub-rooms \u2022 ` : ''}
            {devices.length} devices
          </Text>
        </View>
      </View>

      {/* Add sub-room */}
      <View style={styles.addRow}>
        <TextInput
          mode="outlined"
          placeholder="New sub-room"
          value={newSubRoomName}
          onChangeText={setNewSubRoomName}
          style={styles.addInput}
          dense
        />
        <Button
          mode="contained"
          onPress={handleCreateSubRoom}
          loading={creating}
          disabled={!newSubRoomName.trim() || creating}
          compact
        >
          Add
        </Button>
      </View>

      {listItems.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="bodyMedium" style={styles.emptyText}>
            No sub-rooms or devices in this room
          </Text>
        </View>
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item) =>
            item.type === 'room' ? `room-${item.room.id}` : `device-${item.device.id}`
          }
          renderItem={({ item }) => {
            if (item.type === 'room') {
              return (
                <TouchableOpacity
                  style={[styles.row, { borderBottomColor: theme.colors.outlineVariant }]}
                  onPress={() =>
                    navigation.push('RoomDetail', {
                      roomId: item.room.id,
                      roomName: item.room.name,
                    })
                  }
                >
                  <MaterialCommunityIcons
                    name="floor-plan"
                    size={24}
                    color={theme.colors.primary}
                    style={styles.rowIcon}
                  />
                  <View style={styles.rowInfo}>
                    <Text variant="titleMedium">{item.room.name}</Text>
                    <Text variant="bodySmall" style={styles.meta}>
                      {item.room.device_count} devices
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={24}
                    color={theme.colors.onSurfaceVariant}
                  />
                </TouchableOpacity>
              );
            }

            return (
              <TouchableOpacity
                style={[styles.row, { borderBottomColor: theme.colors.outlineVariant }]}
                onPress={() =>
                  navigation.navigate('DeviceDetail', { deviceId: item.device.id })
                }
              >
                <MaterialCommunityIcons
                  name="lightbulb-outline"
                  size={24}
                  color={theme.colors.onSurfaceVariant}
                  style={styles.rowIcon}
                />
                <View style={styles.rowInfo}>
                  <Text variant="bodyLarge">{item.device.name}</Text>
                  <Text variant="bodySmall" style={styles.meta}>
                    {item.device.entity_id} {'\u2022'} {item.device.domain}
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={24}
                  color={theme.colors.onSurfaceVariant}
                />
              </TouchableOpacity>
            );
          }}
        />
      )}

      <View style={styles.actions}>
        <Button mode="outlined" textColor={theme.colors.error} onPress={handleDeleteRoom}>
          Delete Room
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 64,
    paddingBottom: 8,
  },
  backButton: { marginRight: 12, padding: 4 },
  headerText: { flex: 1 },
  title: { fontWeight: 'bold' },
  subtitle: { opacity: 0.6, marginTop: 2 },
  addRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  addInput: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  rowIcon: { marginRight: 12 },
  rowInfo: { flex: 1 },
  meta: { opacity: 0.5, marginTop: 2 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { opacity: 0.6 },
  actions: { padding: 16, gap: 12, marginBottom: 16 },
});

export default RoomDetailScreen;
