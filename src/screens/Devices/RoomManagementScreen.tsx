import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useRef, useState } from 'react';
import { Alert, Animated, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
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
import Draggable, { type DragHandlers } from '../../components/Draggable';
import type { DevicesStackParamList } from '../../navigation/types';
import type { DeviceListItem, Room } from '../../types/SmartHome';
import { FLOOR_ICON, hitTest, layoutRooms, placesFor, type Rect } from '../../utils/roomLayout';

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
 * is on, with All off per floor. Arrange turns the same plan into an editor: drag a device onto a
 * room (or tap it, then the room), drag a room by its handle onto a floor, and add, rename, move
 * and remove rooms and floors in place.
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
  // Drag and drop: what is held, which target it is over, and the targets' window rects.
  const [drag, setDrag] = useState<{ kind: 'device' | 'room'; name: string; icon: string } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const targets = useRef<Record<string, View | null>>({});
  const rects = useRef<Record<string, Rect>>({});
  const origin = useRef({ x: 0, y: 0 });
  const container = useRef<View>(null);
  const ghost = useRef(new Animated.ValueXY()).current;
  const droppedAt = useRef(0);
  const held = useRef<DeviceListItem | Room | null>(null);
  const deviceDrag = useRef<DragHandlers<DeviceListItem>>(null!);
  const roomDrag = useRef<DragHandlers<Room>>(null!);

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

  // Measured when a drag starts: nothing scrolls while a finger holds the drag.
  const beginDrag = (kind: 'device' | 'room', name: string, icon: string, x: number, y: number) => {
    setPicked(null);
    setDrag({ kind, name, icon });
    rects.current = {};
    const prefix = kind === 'device' ? /^(room:|tray$)/ : /^floor:/;
    container.current?.measureInWindow((cx, cy) => {
      origin.current = { x: cx, y: cy };
      ghost.setValue({ x: x - cx, y: y - cy });
    });
    for (const [key, view] of Object.entries(targets.current)) {
      if (view && prefix.test(key)) view.measureInWindow((rx, ry, width, height) => { rects.current[key] = { x: rx, y: ry, width, height }; });
    }
  };
  const moveDrag = (x: number, y: number) => {
    ghost.setValue({ x: x - origin.current.x, y: y - origin.current.y });
    const k = hitTest(rects.current, x, y);
    setHover((h) => (h === k ? h : k));
  };
  const endDrag = (at: { x: number; y: number } | null) => {
    droppedAt.current = Date.now();
    setDrag(null);
    setHover(null);
    return at ? hitTest(rects.current, at.x, at.y) : null;
  };
  deviceDrag.current = {
    start: (d, x, y) => {
      held.current = d;
      beginDrag('device', d.name, DOMAIN_ICONS[d.domain] ?? 'devices', x, y);
    },
    move: moveDrag,
    end: (at) => {
      const d = held.current as DeviceListItem | null;
      const k = endDrag(at);
      if (!d || !k) return;
      const target = k === 'tray' ? null : rooms.find((r) => `room:${r.id}` === k) ?? null;
      if ((target?.id ?? null) !== (unassigned.includes(d) ? null : d.room_id)) moveDevice(d, target);
    },
  };
  roomDrag.current = {
    start: (r, x, y) => {
      held.current = r;
      beginDrag('room', r.name, 'drag', x, y);
    },
    move: moveDrag,
    end: (at) => {
      const r = held.current as Room | null;
      const k = endDrag(at);
      if (!r || !k) return;
      const floorId = k === 'floor:none' ? null : k.slice('floor:'.length);
      if (floorId === (r.parent_room_id ?? null) || floorId === r.id) return;
      const floor = rooms.find((f) => f.id === floorId);
      run(() => updateRoom(householdId, r.id, { parent_room_id: floorId }), `${r.name} moved${floor ? ` to ${floor.name}` : ''}`);
    },
  };

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
        ref={(v) => { targets.current[`room:${room.id}`] = v; }}
        testID={`room-item-${room.id}`}
        onPress={() => onRoomPress(room)}
        style={[
          styles.cell,
          { borderColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surface },
          lit && { backgroundColor: theme.dark ? '#422006' : '#fef9c3', borderColor: theme.dark ? '#a16207' : '#fde68a' },
          arranging && (picked || drag?.kind === 'device') && { borderColor: theme.colors.primary, borderStyle: 'dashed', borderWidth: 2 },
          hover === `room:${room.id}` && { backgroundColor: theme.colors.primaryContainer, borderStyle: 'solid' },
        ]}
      >
        <View style={styles.cellHead}>
          <Text variant="titleSmall" numberOfLines={1} style={{ flex: 1 }}>{room.name}</Text>
          {arranging && (
            <Draggable payload={room} handlers={roomDrag}>
              <View style={styles.handle} accessibilityLabel={`Hold and drag ${room.name} to another floor`} testID={`room-handle-${room.id}`}>
                <Icon source="drag" size={18} color={theme.colors.onSurfaceVariant} />
              </View>
            </Draggable>
          )}
        </View>
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
      <Draggable key={d.id} payload={d} handlers={deviceDrag}>
      <TouchableOpacity
        testID={`room-device-${d.id}`}
        onPress={() => {
          // The finger that just dropped a drag can also lift here: that isn't a tap.
          if (Date.now() - droppedAt.current < 300) return;
          setPicked(isPicked ? null : d);
        }}
        style={[
          styles.chip,
          { borderColor: isPicked ? theme.colors.primary : theme.colors.outlineVariant, backgroundColor: isPicked ? theme.colors.primaryContainer : theme.colors.background },
        ]}
      >
        <Icon source={DOMAIN_ICONS[d.domain] ?? 'devices'} size={13} color={theme.colors.onSurfaceVariant} />
        <Text style={styles.chipText} numberOfLines={1}>{d.name}</Text>
      </TouchableOpacity>
      </Draggable>
    );
  };

  return (
    <Portal.Host>
      <View ref={container} style={[styles.container, { backgroundColor: theme.colors.background }]}>
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
              : 'Hold and drag a device onto a room, or tap it, then the room. Drag a room by its handle onto a floor; tap it to rename or remove it.'}
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
            <View key={g.floor?.id ?? 'loose'} ref={(v) => { targets.current[`floor:${g.floor?.id ?? 'none'}`] = v; }} collapsable={false}>
            <Card
              mode="outlined"
              testID={`floor-${g.floor?.id ?? 'none'}`}
              style={drag?.kind === 'room' ? { borderColor: theme.colors.primary, borderWidth: hover === `floor:${g.floor?.id ?? 'none'}` ? 3 : 1.5, borderStyle: 'dashed' } : { borderStyle: 'solid' }}
            >
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
            </View>
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
          <View
            ref={(v) => { targets.current.tray = v; }}
            style={[
              styles.tray,
              { borderTopColor: theme.colors.outlineVariant, backgroundColor: hover === 'tray' ? theme.colors.primaryContainer : theme.colors.surface },
            ]}
          >
            <TouchableOpacity
              disabled={!picked}
              onPress={() => {
                if (picked) moveDevice(picked, null);
                setPicked(null);
              }}
            >
              <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.6 }}>
                NOT IN A ROOM{picked ? '  (tap to put it here)' : drag?.kind === 'device' ? '  (drop here)' : ''}
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

        {drag && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ghost,
              { backgroundColor: theme.colors.primaryContainer, borderColor: theme.colors.primary, transform: ghost.getTranslateTransform() },
            ]}
          >
            <Icon source={drag.icon} size={15} color={theme.colors.onPrimaryContainer} />
            <Text style={{ color: theme.colors.onPrimaryContainer }} numberOfLines={1}>{drag.name}</Text>
          </Animated.View>
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
  // borderStyle is always set: Android keeps a dashed border after the style that set it goes.
  cell: { flexBasis: '47%', flexGrow: 1, minWidth: '47%', minHeight: 64, borderWidth: 1, borderStyle: 'solid', borderRadius: 12, padding: 10, gap: 4 },
  addCell: { borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 4, maxWidth: 150 },
  chipText: { fontSize: 11.5 },
  cellHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  handle: { padding: 4, margin: -4 },
  // Centred a little above the finger so the finger doesn't hide it.
  ghost: {
    position: 'absolute', left: -60, top: -44, width: 120, flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6, elevation: 6,
  },
  tray: { borderTopWidth: StyleSheet.hairlineWidth, padding: 12, gap: 8 },
});

export default RoomManagementScreen;
