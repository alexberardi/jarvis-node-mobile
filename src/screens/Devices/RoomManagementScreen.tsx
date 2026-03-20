import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Chip,
  Dialog,
  Divider,
  IconButton,
  List,
  Menu,
  Portal,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  listRooms,
  createRoom,
  updateRoom,
  deleteRoom,
} from '../../api/smartHomeApi';
import { useAuth } from '../../auth/AuthContext';
import type { Room } from '../../types/SmartHome';

/** Compute depth of each room in the hierarchy. */
function computeDepths(rooms: Room[]): Map<string, number> {
  const parentMap = new Map<string, string | null>();
  for (const r of rooms) parentMap.set(r.id, r.parent_room_id);

  const cache = new Map<string, number>();
  function depth(id: string): number {
    if (cache.has(id)) return cache.get(id)!;
    const parentId = parentMap.get(id);
    const d = parentId && parentMap.has(parentId) ? depth(parentId) + 1 : 0;
    cache.set(id, d);
    return d;
  }

  const result = new Map<string, number>();
  for (const r of rooms) result.set(r.id, depth(r.id));
  return result;
}

/** Sort rooms so children appear after their parent, depth-first. */
function sortRoomsTree(rooms: Room[]): Room[] {
  const childrenMap = new Map<string | null, Room[]>();
  for (const r of rooms) {
    const key = r.parent_room_id ?? null;
    if (!childrenMap.has(key)) childrenMap.set(key, []);
    childrenMap.get(key)!.push(r);
  }

  const sorted: Room[] = [];
  function walk(parentId: string | null) {
    const children = childrenMap.get(parentId) ?? [];
    children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      sorted.push(child);
      walk(child.id);
    }
  }
  walk(null);
  return sorted;
}

/** Get breadcrumb path for a room (e.g., "Upstairs > Bedroom 1"). */
function getBreadcrumb(room: Room, rooms: Room[]): string {
  const nameMap = new Map<string, { name: string; parent_room_id: string | null }>();
  for (const r of rooms) nameMap.set(r.id, { name: r.name, parent_room_id: r.parent_room_id });

  const parts: string[] = [];
  let current: string | null = room.parent_room_id;
  while (current && nameMap.has(current)) {
    const r = nameMap.get(current)!;
    parts.unshift(r.name);
    current = r.parent_room_id;
  }
  return parts.length > 0 ? parts.join(' > ') : '';
}

/** Get IDs of a room and all its descendants. */
function getDescendantIds(roomId: string, rooms: Room[]): Set<string> {
  const ids = new Set<string>([roomId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of rooms) {
      if (r.parent_room_id && ids.has(r.parent_room_id) && !ids.has(r.id)) {
        ids.add(r.id);
        changed = true;
      }
    }
  }
  return ids;
}

const RoomManagementScreen = () => {
  const navigation = useNavigation();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { state: authState } = useAuth();
  const householdId = authState.activeHouseholdId;

  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomParentId, setNewRoomParentId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [snackbar, setSnackbar] = useState('');
  const [parentMenuVisible, setParentMenuVisible] = useState(false);

  // Edit dialog state
  const [editRoom, setEditRoom] = useState<Room | null>(null);
  const [editName, setEditName] = useState('');
  const [editParentId, setEditParentId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editParentMenuVisible, setEditParentMenuVisible] = useState(false);

  const {
    data: rooms,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['rooms', householdId],
    queryFn: () => listRooms(householdId!),
    enabled: !!householdId,
    staleTime: 30_000,
  });

  const sortedRooms = useMemo(() => sortRoomsTree(rooms ?? []), [rooms]);
  const depthMap = useMemo(() => computeDepths(rooms ?? []), [rooms]);

  const handleAddRoom = useCallback(async () => {
    const trimmed = newRoomName.trim();
    if (!trimmed || !householdId) return;
    setAdding(true);
    try {
      await createRoom(householdId, {
        name: trimmed,
        parent_room_id: newRoomParentId ?? undefined,
      });
      setNewRoomName('');
      setNewRoomParentId(null);
      queryClient.invalidateQueries({ queryKey: ['rooms', householdId] });
      setSnackbar(`"${trimmed}" created`);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create room');
    } finally {
      setAdding(false);
    }
  }, [newRoomName, newRoomParentId, householdId, queryClient]);

  const handleEdit = useCallback(async () => {
    if (!editRoom || !householdId) return;
    const trimmed = editName.trim();
    if (!trimmed) return;
    setEditing(true);
    try {
      await updateRoom(householdId, editRoom.id, {
        name: trimmed !== editRoom.name ? trimmed : undefined,
        parent_room_id: editParentId !== editRoom.parent_room_id ? editParentId : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['rooms', householdId] });
      setSnackbar(`"${trimmed}" updated`);
      setEditRoom(null);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setEditing(false);
    }
  }, [editRoom, editName, editParentId, householdId, queryClient]);

  const handleDelete = useCallback(
    (room: Room) => {
      Alert.alert(
        'Delete Room',
        `Delete "${room.name}"? Devices will become unassigned, child rooms move to root.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteRoom(householdId!, room.id);
                queryClient.invalidateQueries({ queryKey: ['rooms', householdId] });
                queryClient.invalidateQueries({ queryKey: ['devices', householdId] });
                setSnackbar(`"${room.name}" deleted`);
              } catch (e) {
                Alert.alert('Error', e instanceof Error ? e.message : 'Failed to delete');
              }
            },
          },
        ],
      );
    },
    [householdId, queryClient],
  );

  // Rooms eligible as parent in the edit dialog (excludes self + descendants)
  const editParentOptions = useMemo(() => {
    if (!editRoom || !rooms) return [];
    const excluded = getDescendantIds(editRoom.id, rooms);
    return rooms.filter((r) => !excluded.has(r.id));
  }, [editRoom, rooms]);

  const getParentName = (parentId: string | null, roomList: Room[]) => {
    if (!parentId) return 'None (root)';
    return roomList.find((r) => r.id === parentId)?.name ?? 'Unknown';
  };

  if (!householdId) {
    return (
      <View style={styles.centered}>
        <Text>No household selected</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Rooms" />
      </Appbar.Header>

      {/* Add room */}
      <View style={styles.addRow}>
        <TextInput
          mode="outlined"
          label="New room name"
          value={newRoomName}
          onChangeText={setNewRoomName}
          style={styles.addInput}
          dense
        />
        <Button
          mode="contained"
          onPress={handleAddRoom}
          loading={adding}
          disabled={adding || !newRoomName.trim()}
          style={styles.addButton}
        >
          Add
        </Button>
      </View>

      {/* Parent selector for new room */}
      {rooms && rooms.length > 0 && (
        <View style={styles.parentRow}>
          <Text variant="bodySmall" style={{ opacity: 0.7 }}>Parent: </Text>
          <Menu
            visible={parentMenuVisible}
            onDismiss={() => setParentMenuVisible(false)}
            anchor={
              <Chip
                onPress={() => setParentMenuVisible(true)}
                compact
                icon={newRoomParentId ? 'folder-outline' : 'home-outline'}
              >
                {getParentName(newRoomParentId, rooms)}
              </Chip>
            }
          >
            <Menu.Item
              onPress={() => { setNewRoomParentId(null); setParentMenuVisible(false); }}
              title="None (root)"
            />
            <Divider />
            {rooms.map((r) => (
              <Menu.Item
                key={r.id}
                onPress={() => { setNewRoomParentId(r.id); setParentMenuVisible(false); }}
                title={r.name}
              />
            ))}
          </Menu>
        </View>
      )}

      <Divider />

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={sortedRooms}
          keyExtractor={(r) => r.id}
          refreshing={isLoading}
          onRefresh={() => refetch()}
          ItemSeparatorComponent={Divider}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={{ opacity: 0.6 }}>No rooms yet</Text>
            </View>
          }
          renderItem={({ item: room }) => {
            const depth = depthMap.get(room.id) ?? 0;
            const breadcrumb = getBreadcrumb(room, rooms ?? []);
            const desc = breadcrumb
              ? `${breadcrumb} > ${room.name} \u00B7 ${room.device_count} device${room.device_count !== 1 ? 's' : ''}`
              : `${room.device_count} device${room.device_count !== 1 ? 's' : ''}`;
            return (
              <List.Item
                title={room.name}
                description={desc}
                style={{ paddingLeft: 16 + depth * 24 }}
                left={() => depth > 0 ? (
                  <List.Icon icon="subdirectory-arrow-right" style={{ opacity: 0.4 }} />
                ) : null}
                onPress={() => {
                  setEditRoom(room);
                  setEditName(room.name);
                  setEditParentId(room.parent_room_id);
                }}
                right={() => (
                  <IconButton
                    icon="delete-outline"
                    onPress={() => handleDelete(room)}
                    iconColor={theme.colors.error}
                  />
                )}
              />
            );
          }}
        />
      )}

      {/* Edit dialog */}
      <Portal>
        <Dialog
          visible={!!editRoom}
          onDismiss={() => setEditRoom(null)}
        >
          <Dialog.Title>Edit Room</Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              value={editName}
              onChangeText={setEditName}
              label="Room name"
              autoFocus
              style={{ marginBottom: 12 }}
            />
            <Text variant="bodySmall" style={{ marginBottom: 4, opacity: 0.7 }}>
              Parent Room
            </Text>
            <Menu
              visible={editParentMenuVisible}
              onDismiss={() => setEditParentMenuVisible(false)}
              anchor={
                <Chip
                  onPress={() => setEditParentMenuVisible(true)}
                  icon={editParentId ? 'folder-outline' : 'home-outline'}
                >
                  {getParentName(editParentId, rooms ?? [])}
                </Chip>
              }
            >
              <ScrollView style={{ maxHeight: 300 }}>
                <Menu.Item
                  onPress={() => { setEditParentId(null); setEditParentMenuVisible(false); }}
                  title="None (root)"
                />
                <Divider />
                {editParentOptions.map((r) => (
                  <Menu.Item
                    key={r.id}
                    onPress={() => { setEditParentId(r.id); setEditParentMenuVisible(false); }}
                    title={r.name}
                  />
                ))}
              </ScrollView>
            </Menu>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditRoom(null)}>Cancel</Button>
            <Button
              onPress={handleEdit}
              loading={editing}
              disabled={editing || !editName.trim()}
            >
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

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
  addRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    alignItems: 'center',
  },
  addInput: { flex: 1 },
  addButton: { marginTop: 6 },
  parentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
});

export default RoomManagementScreen;
