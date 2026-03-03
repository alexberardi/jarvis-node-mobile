import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  RefreshControl,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Button, Text, TextInput, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAuth } from '../../auth/AuthContext';
import * as smartHomeApi from '../../api/smartHomeApi';
import { Device, Room } from '../../types/SmartHome';
import { RoomsStackParamList, RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RoomsStackParamList>;
type RootNav = NativeStackNavigationProp<RootStackParamList>;

type SectionItem = { type: 'room'; room: Room } | { type: 'device'; device: Device };
type Section = { title: string; data: SectionItem[] };

const RoomListScreen = () => {
  const navigation = useNavigation<Nav>();
  const rootNav = useNavigation<RootNav>();
  const { state: authState } = useAuth();
  const theme = useTheme();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [creating, setCreating] = useState(false);

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
      // handle silently
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

  const handleCreateRoom = async () => {
    if (!householdId || !accessToken || !newRoomName.trim()) return;
    setCreating(true);
    try {
      await smartHomeApi.createRoom(
        householdId,
        { name: newRoomName.trim() },
        accessToken,
      );
      setNewRoomName('');
      await loadData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create room';
      Alert.alert('Error', msg);
    }
    setCreating(false);
  };

  // Build sections
  const topLevelRooms = rooms.filter((r) => !r.parent_room_id);
  const unassignedDevices = devices.filter((d) => !d.room_id);

  const sections: Section[] = [];

  if (topLevelRooms.length > 0) {
    sections.push({
      title: 'Rooms',
      data: topLevelRooms.map((room) => ({ type: 'room' as const, room })),
    });
  }

  if (unassignedDevices.length > 0) {
    sections.push({
      title: 'Unassigned Devices',
      data: unassignedDevices.map((device) => ({ type: 'device' as const, device })),
    });
  }

  const renderItem = ({ item }: { item: SectionItem }) => {
    if (item.type === 'room') {
      const { room } = item;
      const subRoomCount = rooms.filter((r) => r.parent_room_id === room.id).length;
      return (
        <TouchableOpacity
          style={[styles.row, { borderBottomColor: theme.colors.outlineVariant }]}
          onPress={() =>
            navigation.navigate('RoomDetail', {
              roomId: room.id,
              roomName: room.name,
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
            <Text variant="titleMedium">{room.name}</Text>
            <Text variant="bodySmall" style={styles.meta}>
              {room.device_count} devices
              {subRoomCount > 0 ? ` \u2022 ${subRoomCount} sub-rooms` : ''}
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

    const { device } = item;
    return (
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: theme.colors.outlineVariant }]}
        onPress={() => navigation.navigate('DeviceDetail', { deviceId: device.id })}
      >
        <MaterialCommunityIcons
          name="lightbulb-outline"
          size={24}
          color={theme.colors.onSurfaceVariant}
          style={styles.rowIcon}
        />
        <View style={styles.rowInfo}>
          <Text variant="bodyLarge">{device.name}</Text>
          <Text variant="bodySmall" style={styles.meta}>
            {device.entity_id} {'\u2022'} {device.domain}
          </Text>
        </View>
        <MaterialCommunityIcons
          name="chevron-right"
          size={24}
          color={theme.colors.onSurfaceVariant}
        />
      </TouchableOpacity>
    );
  };

  const isEmpty = sections.length === 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="headlineSmall" style={styles.title}>
          Rooms
        </Text>
        <Button
          mode="contained"
          compact
          onPress={() =>
            rootNav.navigate('SmartHomeSetup', { screen: 'SmartHomeSetup' })
          }
        >
          Import
        </Button>
      </View>

      {/* Add room */}
      <View style={styles.addRow}>
        <TextInput
          mode="outlined"
          placeholder="New room name"
          value={newRoomName}
          onChangeText={setNewRoomName}
          style={styles.addInput}
          dense
        />
        <Button
          mode="contained"
          onPress={handleCreateRoom}
          loading={creating}
          disabled={!newRoomName.trim() || creating}
          compact
        >
          Add
        </Button>
      </View>

      {isEmpty ? (
        <View style={styles.empty}>
          <Text variant="bodyLarge" style={styles.emptyText}>
            No rooms or devices yet. Add a room above or import from Home Assistant.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) =>
            item.type === 'room' ? `room-${item.room.id}` : `device-${item.device.id}`
          }
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: theme.colors.surfaceVariant }]}>
              <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
                {section.title}
              </Text>
            </View>
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 64,
    paddingBottom: 8,
  },
  title: { fontWeight: 'bold' },
  addRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  addInput: { flex: 1 },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
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
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { opacity: 0.6, textAlign: 'center' },
});

export default RoomListScreen;
