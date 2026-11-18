import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Dialog,
  Icon,
  Menu,
  Portal,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import {
  controlDevice,
  createRoom,
  deleteRoom,
  getDeviceState,
  listDevices,
  listRooms,
  updateDevice,
  updateRoom,
} from '../../api/smartHomeApi';
import { useAuth } from '../../auth/AuthContext';
import { describeState } from '../../components/DeviceRow';
import type { DevicesStackParamList } from '../../navigation/types';
import type { DeviceListItem, Room } from '../../types/SmartHome';
import { FLOOR_ICON, layoutRooms, placesFor } from '../../utils/roomLayout';

type Nav = NativeStackNavigationProp<DevicesStackParamList>;

const DOMAIN_ICONS: Record<string, string> = {
  light: 'lightbulb-outline',
  switch: 'power-plug-outline',
  lock: 'lock-outline',
  climate: 'thermostat',
  camera: 'cctv',
  cover: 'window-shutter',
  media_player: 'speaker',
  kettle: 'kettle-outline',
};
const SWITCHABLE = new Set(['light', 'switch']);

type NameDialog = { kind: 'floor' } | { kind: 'room'; parentId: string | null } | { kind: 'rename'; room: Room };

/**
 * Rooms as floors: each floor drawn as a loose plan of its rooms, lit when something in them
 * is on, with All off per floor. Arrange turns the same plan into an editor: tap a device, then
 * a room, to move it; add, rename, move and remove rooms and floors in place.
 */
const RoomManagementScreen = () => {
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { state: authState } = useAuth();
  const householdId = authState.activeHouseholdId;
  const [arranging, setArranging] = useState(false);
  const [picked, setPicked] = useState<DeviceListItem | null>(null);
  const [roomMenu, setRoomMenu] = useState<string | null>(null);
  const [moveMenu, setMoveMenu] = useState<string | null>(null);
  const [dialog, setDialog] = useState<NameDialog | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [snackbar, setSnackbar] = useState('');
  const [busy, setBusy] = useState(false);

  const roomsQuery = useQuery({
    queryKey: ['rooms', householdId],
    queryFn: () => listRooms(householdId!),
    enabled: !!householdId,
  });
  const devicesQuery = useQuery({
    queryKey: ['devices', householdId],
    queryFn: () => listDevices(householdId!),
    enabled: !!householdId,
  });
  const rooms = roomsQuery.data ?? [];
  const devices = devicesQuery.data ?? [];
  const switchable = devices.filter((d) => d.is_controllable && SWITCHABLE.has(d.domain));
  // Live state for lights and plugs, shared with the Devices list's rows.
  const states = useQueries({
    queries: switchable.map((d) => ({
      queryKey: ['deviceState', d.household_id, d.id],
      queryFn: () => getDeviceState(d.household_id, d.id),
      staleTime: 30_000,
      retry: 0,
      enabled: !arranging,
    })),
  });
  const isOn = (d: DeviceListItem) => {
    const i = switchable.indexOf(d);
    return i >= 0 && describeState(d.domain, states[i]?.data).on === true;
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['rooms', householdId] });
    queryClient.invalidateQueries({ queryKey: ['devices', householdId] });
  };
  const run = async (what: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await what();
      if (done) setSnackbar(done);
      refresh();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  if (!householdId) {
    return (
      <View style={styles.center}>
        <Text>No household selected</Text>
      </View>
    );
  }

  const groups = layoutRooms(rooms);
  const inRoom = (roomIds: string[]) => devices.filter((d) => d.room_id && roomIds.includes(d.room_id));
  const unassigned = devices.filter((d) => !d.room_id || !rooms.some((r) => r.id === d.room_id));
  const roomIdsOf = (room: Room) => [room.id, ...rooms.filter((r) => r.parent_room_id === room.id).map((r) => r.id)];

  const allOff = (floorRooms: Room[]) => {
    const targets = inRoom(floorRooms.map((r) => r.id)).filter((d) => d.is_controllable && SWITCHABLE.has(d.domain));
    if (targets.length === 0) return setSnackbar('Nothing here to turn off');
    run(
      () => Promise.all(targets.map((d) => controlDevice(d.household_id, d.id, 'turn_off'))),
      `Turning off ${targets.length} device${targets.length === 1 ? '' : 's'}`,
    ).then(() => targets.forEach((d) => queryClient.invalidateQueries({ queryKey: ['deviceState', d.household_id, d.id] })));
  };

  const moveDevice = (device: DeviceListItem, room: Room | null) =>
    run(() => updateDevice(device.household_id, device.id, { room_id: room?.id ?? null }), `${device.name} moved to ${room?.name ?? 'Not in a room'}`);

  const onRoomPress = (room: Room) => {
    if (!arranging) return navigation.navigate('RoomDetail', { roomId: room.id });
    if (picked) {
      moveDevice(picked, room);
      setPicked(null);
      return;
    }
    setRoomMenu(room.id);
  };

  const removeRoom = (room: Room) =>
    Alert.alert('Remove room', `Remove "${room.name}"? Its devices go to "Not in a room", and rooms inside it move up a level.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => run(() => deleteRoom(householdId, room.id), `${room.name} removed`) },
    ]);

  const submitDialog = () => {
    const name = nameInput.trim();
    if (!name || !dialog) return;
    const d = dialog;
    setDialog(null);
    if (d.kind === 'floor') run(() => createRoom(householdId, { name, icon: FLOOR_ICON }), `${name} added`);
    else if (d.kind === 'room') run(() => createRoom(householdId, { name, ...(d.parentId ? { parent_room_id: d.parentId } : {}) }), `${name} added`);
    else run(() => updateRoom(householdId, d.room.id, { name }), 'Renamed');
  };
  const openDialog = (d: NameDialog) => {
    setNameInput(d.kind === 'rename' ? d.room.name : '');
    setDialog(d);
  };

  const roomCell = (room: Room) => {
    const ds = inRoom(roomIdsOf(room));
    const lit = !arranging && ds.some(isOn);
    const onCount = ds.filter(isOn).length;
    const summary = ds.length === 0 ? 'No devices' : onCount > 0 ? `${onCount} on` : `${ds.length} device${ds.length === 1 ? '' : 's'}`;
    const cell = (
      <TouchableOpacity
        key={room.id}
        testID={`room-item-${room.id}`}
        onPress={() => onRoomPress(room)}
        onLongPress={() => arranging && setRoomMenu(room.id)}
        style={[
          styles.cell,
          { borderColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surface },
          lit && { backgroundColor: theme.dark ? '#422006' : '#fef9c3', borderColor: theme.dark ? '#a16207' : '#fde68a' },
          arranging && picked && { borderColor: theme.colors.primary, borderStyle: 'dashed', borderWidth: 2 },
        ]}
      >
        <Text variant="titleSmall" numberOfLines={1}>{room.name}</Text>
        {arranging ? (
          <View style={styles.chips}>
            {ds.length === 0 && <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>No devices</Text>}
            {ds.map((d) => deviceChip(d))}
          </View>
        ) : (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{summary}</Text>
        )}
      </TouchableOpacity>
    );
    if (!arranging) return cell;
    const places = placesFor(room, rooms).filter((r) => groups.some((g) => g.floor?.id === r.id));
    return (
      <Menu key={room.id} visible={roomMenu === room.id || moveMenu === room.id} onDismiss={() => { setRoomMenu(null); setMoveMenu(null); }} anchor={cell}>
        {moveMenu === room.id ? (
          <>
            <Menu.Item title="Not on a floor" onPress={() => { setMoveMenu(null); run(() => updateRoom(householdId, room.id, { parent_room_id: null }), `${room.name} moved`); }} />
            {places.map((f) => (
              <Menu.Item key={f.id} title={f.name} onPress={() => { setMoveMenu(null); run(() => updateRoom(householdId, room.id, { parent_room_id: f.id }), `${room.name} moved to ${f.name}`); }} />
            ))}
          </>
        ) : (
          <>
            <Menu.Item leadingIcon="pencil-outline" title="Rename" testID={`room-rename-${room.id}`} onPress={() => { setRoomMenu(null); openDialog({ kind: 'rename', room }); }} />
            <Menu.Item leadingIcon="stairs" title="Move to a floor" onPress={() => { setRoomMenu(null); setMoveMenu(room.id); }} />
            <Menu.Item leadingIcon="delete-outline" title="Remove" testID={`room-delete-${room.id}`} onPress={() => { setRoomMenu(null); removeRoom(room); }} />
          </>
        )}
      </Menu>
    );
  };

  const deviceChip = (d: DeviceListItem) => {
    const isPicked = picked?.id === d.id;
    return (
      <TouchableOpacity
        key={d.id}
        testID={`room-device-${d.id}`}
        onPress={() => setPicked(isPicked ? null : d)}
        style={[
          styles.chip,
          { borderColor: isPicked ? theme.colors.primary : theme.colors.outlineVariant, backgroundColor: isPicked ? theme.colors.primaryContainer : theme.colors.background },
        ]}
      >
        <Icon source={DOMAIN_ICONS[d.domain] ?? 'devices'} size={13} color={theme.colors.onSurfaceVariant} />
        <Text style={styles.chipText} numberOfLines={1}>{d.name}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <Portal.Host>
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Appbar.Header>
          {arranging ? (
            <Appbar.Action icon="check" accessibilityLabel="Done" testID="rooms-done" onPress={() => { setArranging(false); setPicked(null); }} />
          ) : (
            <Appbar.BackAction onPress={() => navigation.goBack()} />
          )}
          <Appbar.Content title={arranging ? 'Arrange' : 'Rooms'} />
          {arranging ? (
            <Button mode="outlined" compact icon="plus" testID="rooms-add-floor" onPress={() => openDialog({ kind: 'floor' })} style={{ marginRight: 8 }}>
              Floor
            </Button>
          ) : (
            <Button mode="outlined" compact testID="rooms-arrange" onPress={() => setArranging(true)} style={{ marginRight: 8 }}>
              Arrange
            </Button>
          )}
        </Appbar.Header>

        {arranging && (
          <Text variant="bodySmall" style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>
            {picked
              ? `Tap a room to move ${picked.name} there, or tap it again to put it down.`
              : 'Tap a device, then a room, to move it. Tap a room to rename, move or remove it.'}
          </Text>
        )}

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={roomsQuery.isFetching && !roomsQuery.isPending} onRefresh={refresh} />}
        >
          {(roomsQuery.isPending || devicesQuery.isPending) && <ActivityIndicator style={{ marginTop: 32 }} />}
          {!roomsQuery.isPending && rooms.length === 0 && (
            <Text variant="bodyMedium" style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}>
              No rooms yet. Tap Arrange to add floors and rooms.
            </Text>
          )}
          {groups.map((g) => (
            <Card key={g.floor?.id ?? 'loose'} mode="outlined" testID={`floor-${g.floor?.id ?? 'none'}`}>
              <View style={styles.floor}>
              <View style={styles.floorHead}>
                <TouchableOpacity
                  disabled={!arranging || !g.floor}
                  onPress={() => g.floor && openDialog({ kind: 'rename', room: g.floor })}
                  style={{ flex: 1 }}
                >
                  <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.6 }}>
                    {(g.floor?.name ?? (groups.length > 1 ? 'Other rooms' : 'Rooms')).toUpperCase()}
                    {arranging && g.floor ? '  ✎' : ''}
                  </Text>
                </TouchableOpacity>
                {!arranging && g.rooms.length > 0 && (
                  <Button compact disabled={busy} onPress={() => allOff(g.rooms)} testID={`floor-off-${g.floor?.id ?? 'none'}`}>
                    All off
                  </Button>
                )}
                {arranging && g.floor && (
                  <Button compact onPress={() => removeRoom(g.floor!)}>Remove</Button>
                )}
              </View>
              <View style={styles.plan}>
                {g.rooms.map(roomCell)}
                {arranging && (
                  <TouchableOpacity
                    testID={`rooms-add-room-${g.floor?.id ?? 'none'}`}
                    onPress={() => openDialog({ kind: 'room', parentId: g.floor?.id ?? null })}
                    style={[styles.cell, styles.addCell, { borderColor: theme.colors.outline }]}
                  >
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>+ Room</Text>
                  </TouchableOpacity>
                )}
              </View>
              </View>
            </Card>
          ))}
          {!arranging && unassigned.length > 0 && (
            <Card mode="outlined" onPress={() => setArranging(true)} testID="rooms-unassigned-nudge">
              <Card.Title
                title={`${unassigned.length} device${unassigned.length === 1 ? '' : 's'} not in a room`}
                subtitle="Tap to file them"
                left={(props) => <Icon {...props} source="tray-arrow-down" />}
              />
            </Card>
          )}
        </ScrollView>

        {arranging && (
          <View style={[styles.tray, { borderTopColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surface }]}>
            <TouchableOpacity
              disabled={!picked}
              onPress={() => {
                if (picked) moveDevice(picked, null);
                setPicked(null);
              }}
            >
              <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.6 }}>
                NOT IN A ROOM{picked ? '  (tap to put it here)' : ''}
              </Text>
            </TouchableOpacity>
            <View style={styles.chips}>
              {unassigned.length === 0 ? (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Every device is in a room.</Text>
              ) : (
                unassigned.map(deviceChip)
              )}
            </View>
          </View>
        )}

        <Portal>
          <Dialog visible={dialog !== null} onDismiss={() => setDialog(null)} testID="room-edit-dialog">
            <Dialog.Title>{dialog?.kind === 'floor' ? 'New floor' : dialog?.kind === 'room' ? 'New room' : 'Rename'}</Dialog.Title>
            <Dialog.Content>
              <TextInput
                mode="outlined"
                label="Name"
                value={nameInput}
                onChangeText={setNameInput}
                onSubmitEditing={submitDialog}
                autoFocus
                testID="room-edit-name-input"
              />
              {dialog?.kind === 'floor' && (
                <Text variant="bodySmall" style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}>
                  A floor groups rooms, so "turn off upstairs" covers all of them.
                </Text>
              )}
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setDialog(null)} testID="room-edit-cancel">Cancel</Button>
              <Button onPress={submitDialog} disabled={!nameInput.trim()} testID="room-edit-save">
                {dialog?.kind === 'rename' ? 'Save' : 'Add'}
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>

        <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar('')} duration={2500}>
          {snackbar}
        </Snackbar>
      </View>
    </Portal.Host>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  hint: { marginHorizontal: 16, marginTop: 8 },
  empty: { textAlign: 'center', marginTop: 32 },
  floor: { padding: 10 },
  floorHead: { flexDirection: 'row', alignItems: 'center', minHeight: 36, marginBottom: 6, paddingHorizontal: 4 },
  plan: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { flexBasis: '47%', flexGrow: 1, minHeight: 64, borderWidth: 1, borderRadius: 12, padding: 10, gap: 4 },
  addCell: { borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 4, maxWidth: 150 },
  chipText: { fontSize: 11.5 },
  tray: { borderTopWidth: StyleSheet.hairlineWidth, padding: 12, gap: 8 },
});

export default RoomManagementScreen;
