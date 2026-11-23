import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Button,
  Card,
  Divider,
  List,
  Menu,
  Modal,
  Portal,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import { controlDevice, deleteRoom, listDevices, listRooms, updateDevice, updateRoom } from '../../api/smartHomeApi';
import { useAuth } from '../../auth/AuthContext';
import DeviceRow from '../../components/DeviceRow';
import type { DevicesStackParamList } from '../../navigation/types';
import type { DeviceListItem } from '../../types/SmartHome';
import { placesFor } from '../../utils/roomLayout';

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

/** One room: its devices with their switches, All on / off, and moving devices in. */
const RoomDetailScreen = () => {
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { state: authState } = useAuth();
  const householdId = authState.activeHouseholdId!;
  const { roomId } = useRoute<RouteProp<DevicesStackParamList, 'RoomDetail'>>().params;
  const rooms = useQuery({ queryKey: ['rooms', householdId], queryFn: () => listRooms(householdId) }).data ?? [];
  const devices = useQuery({ queryKey: ['devices', householdId], queryFn: () => listDevices(householdId) }).data ?? [];
  const room = rooms.find((r) => r.id === roomId);
  const [moveOpen, setMoveOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [placeMenu, setPlaceMenu] = useState(false);
  const [snackbar, setSnackbar] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['rooms', householdId] });
    queryClient.invalidateQueries({ queryKey: ['devices', householdId] });
  };

  if (!room) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => navigation.goBack()} />
          <Appbar.Content title="Room" />
        </Appbar.Header>
      </View>
    );
  }

  const here = devices.filter((d) => d.room_id === room.id);
  const elsewhere = devices.filter((d) => d.room_id !== room.id);
  const switchable = here.filter((d) => d.is_controllable && SWITCHABLE.has(d.domain));
  const parent = rooms.find((r) => r.id === room.parent_room_id);

  const setAll = async (on: boolean) => {
    setBusy(true);
    const results = await Promise.allSettled(switchable.map((d) => controlDevice(d.household_id, d.id, on ? 'turn_on' : 'turn_off')));
    setBusy(false);
    const failed = results.filter((r) => r.status === 'rejected' || !(r.value as { success?: boolean })?.success).length;
    setSnackbar(failed ? `${failed} didn't respond` : on ? 'All on' : 'All off');
    switchable.forEach((d) => queryClient.invalidateQueries({ queryKey: ['deviceState', d.household_id, d.id] }));
  };

  const moveHere = async (d: DeviceListItem) => {
    setMoveOpen(false);
    try {
      await updateDevice(d.household_id, d.id, { room_id: room.id });
      setSnackbar(`${d.name} moved here`);
      refresh();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not move it');
    }
  };

  const save = async () => {
    try {
      await updateRoom(householdId, room.id, { name: name.trim(), parent_room_id: parentId });
      setEditing(false);
      refresh();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save');
    }
  };

  const remove = () =>
    Alert.alert('Remove room', `Remove "${room.name}"? Its devices go to "Not in a room".`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteRoom(householdId, room.id);
          refresh();
          navigation.goBack();
        },
      },
    ]);

  const places = placesFor(room, rooms);
  return (
    <Portal.Host>
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => navigation.goBack()} />
          <Appbar.Content title={room.name} />
          <Appbar.Action icon="delete-outline" accessibilityLabel="Remove room" testID="room-remove" onPress={remove} />
        </Appbar.Header>
        <ScrollView contentContainerStyle={styles.content}>
          {switchable.length > 0 && (
            <View style={styles.allRow}>
              <Button mode="contained" style={{ flex: 1 }} disabled={busy} onPress={() => setAll(true)} testID="room-all-on">All on</Button>
              <Button mode="outlined" style={{ flex: 1 }} disabled={busy} onPress={() => setAll(false)} testID="room-all-off">All off</Button>
            </View>
          )}

          <Text variant="labelLarge" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>In this room</Text>
          <Card mode="outlined" style={styles.card}>
            <View>
              {here.length === 0 && (
                <Text variant="bodySmall" style={{ margin: 16, color: theme.colors.onSurfaceVariant }}>No devices here yet.</Text>
              )}
              {here.map((d, i) => (
                <React.Fragment key={d.id}>
                  {i > 0 && <Divider />}
                  <DeviceRow
                    device={d}
                    icon={DOMAIN_ICONS[d.domain] ?? 'devices'}
                    onPress={() => navigation.navigate('DeviceEdit', { deviceId: d.id, householdId: d.household_id })}
                  />
                </React.Fragment>
              ))}
            </View>
          </Card>

          <Card mode="outlined" style={styles.card}>
            <View>
              <Menu
                visible={moveOpen}
                onDismiss={() => setMoveOpen(false)}
                anchor={
                  <List.Item
                    testID="room-move-here"
                    title="Move a device here"
                    description="From another room, or not in a room"
                    left={(props) => <List.Icon {...props} icon="plus" />}
                    onPress={() => setMoveOpen(true)}
                    disabled={elsewhere.length === 0}
                  />
                }
              >
                <ScrollView style={{ maxHeight: 360 }}>
                  {elsewhere.map((d) => (
                    <Menu.Item
                      key={d.id}
                      title={d.name}
                      leadingIcon={DOMAIN_ICONS[d.domain] ?? 'devices'}
                      onPress={() => moveHere(d)}
                    />
                  ))}
                </ScrollView>
              </Menu>
              <Divider />
              <List.Item
                testID="room-name-place"
                title="Name & place"
                description={`${room.name} · ${parent ? `in ${parent.name}` : 'top level'}`}
                left={(props) => <List.Icon {...props} icon="pencil-outline" />}
                onPress={() => {
                  setName(room.name);
                  setParentId(room.parent_room_id);
                  setEditing(true);
                }}
              />
            </View>
          </Card>
        </ScrollView>

        <Portal>
          <Modal visible={editing} onDismiss={() => setEditing(false)} contentContainerStyle={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
            <Text variant="titleMedium" style={{ fontWeight: '600', marginBottom: 12 }}>Name & place</Text>
            <TextInput mode="outlined" label="Name" value={name} onChangeText={setName} testID="room-name-input" />
            <Menu
              visible={placeMenu}
              onDismiss={() => setPlaceMenu(false)}
              anchor={
                <List.Item
                  title="Inside"
                  description={rooms.find((r) => r.id === parentId)?.name ?? 'Nothing (top level)'}
                  onPress={() => setPlaceMenu(true)}
                  right={(props) => <List.Icon {...props} icon="menu-down" />}
                  style={{ paddingHorizontal: 0 }}
                />
              }
            >
              <Menu.Item title="Nothing (top level)" onPress={() => { setParentId(null); setPlaceMenu(false); }} />
              {places.map((r) => (
                <Menu.Item key={r.id} title={r.name} onPress={() => { setParentId(r.id); setPlaceMenu(false); }} />
              ))}
            </Menu>
            <View style={styles.sheetActions}>
              <Button mode="outlined" style={{ flex: 1 }} onPress={() => setEditing(false)}>Cancel</Button>
              <Button mode="contained" style={{ flex: 1 }} disabled={!name.trim()} onPress={save} testID="room-save">Save</Button>
            </View>
          </Modal>
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
  content: { padding: 16, paddingBottom: 32 },
  allRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  label: { marginBottom: 6, marginLeft: 4 },
  card: { marginBottom: 12, overflow: 'hidden' },
  sheet: { marginTop: 'auto', padding: 16, paddingBottom: 28, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  sheetActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
});

export default RoomDetailScreen;
