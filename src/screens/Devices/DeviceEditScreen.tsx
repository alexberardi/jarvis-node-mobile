import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Chip,
  Dialog,
  Divider,
  List,
  Menu,
  Portal,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  listDevices,
  listRooms,
  updateDevice,
  deleteDevice,
  controlDevice,
  type InputRequest,
} from '../../api/smartHomeApi';
import DeviceControlPanel from '../../components/device-controls/DeviceControlPanel';
import type { DeviceListItem, JarvisButton, Room } from '../../types/SmartHome';
import type { DevicesStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<DevicesStackParamList, 'DeviceEdit'>;

const DeviceEditScreen = ({ navigation, route }: Props) => {
  const { deviceId, householdId } = route.params;
  const theme = useTheme();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [roomMenuVisible, setRoomMenuVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [inputDialog, setInputDialog] = useState<InputRequest | null>(null);
  const [inputValue, setInputValue] = useState('');

  const { data: devices, isLoading: devicesLoading } = useQuery({
    queryKey: ['devices', householdId],
    queryFn: () => listDevices(householdId),
    staleTime: 30_000,
  });

  const { data: rooms } = useQuery({
    queryKey: ['rooms', householdId],
    queryFn: () => listRooms(householdId),
    staleTime: 30_000,
  });

  const device: DeviceListItem | undefined = devices?.find(
    (d) => d.id === deviceId,
  );

  useEffect(() => {
    if (device) {
      setName(device.name);
      setRoomId(device.room_id);
    }
  }, [device]);

  const selectedRoom: Room | undefined = rooms?.find((r) => r.id === roomId);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateDevice(householdId, deviceId, {
        name: name.trim(),
        room_id: roomId,
      });
      queryClient.invalidateQueries({ queryKey: ['devices', householdId] });
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [householdId, deviceId, name, roomId, navigation, queryClient]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete Device',
      `Remove "${device?.name}" from your household? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDevice(householdId, deviceId);
              queryClient.invalidateQueries({
                queryKey: ['devices', householdId],
              });
              navigation.goBack();
            } catch (e) {
              Alert.alert(
                'Error',
                e instanceof Error ? e.message : 'Failed to delete',
              );
            }
          },
        },
      ],
    );
  }, [householdId, deviceId, device?.name, navigation, queryClient]);

  const handleAction = useCallback(async (action: JarvisButton) => {
    if (!device) return;
    setActionLoading(action.button_action);
    try {
      const result = await controlDevice(householdId, deviceId, action.button_action);
      if (result.input_required) {
        // Device needs user input (e.g. PIN for Apple TV pairing)
        setInputDialog(result.input_required);
        setInputValue('');
      } else if (result.success) {
        setLastAction(action.button_text);
        setTimeout(() => setLastAction(null), 3000);
      } else {
        Alert.alert('Failed', result.error || `Could not ${action.button_text.toLowerCase()}`);
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to send action');
    } finally {
      setActionLoading(null);
    }
  }, [device, householdId, deviceId]);

  const handleInputSubmit = useCallback(async () => {
    if (!inputDialog || !device) return;
    setInputDialog(null);
    setActionLoading(inputDialog.follow_up_action);
    try {
      const result = await controlDevice(householdId, deviceId, inputDialog.follow_up_action, {
        session_id: inputDialog.session_id,
        pin: inputValue,
      });
      if (result.success) {
        setLastAction('Paired');
        setTimeout(() => setLastAction(null), 3000);
      } else {
        Alert.alert('Pairing Failed', result.error || 'Could not complete pairing');
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Pairing failed');
    } finally {
      setActionLoading(null);
    }
  }, [inputDialog, inputValue, device, householdId, deviceId]);

  if (devicesLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.centered}>
        <Text>Device not found</Text>
        <Button mode="text" onPress={() => navigation.goBack()}>
          Go Back
        </Button>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Edit Device" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        <TextInput
          label="Device Name"
          value={name}
          onChangeText={setName}
          mode="outlined"
          style={styles.input}
        />

        <Text variant="labelLarge" style={styles.label}>
          Room
        </Text>
        <Menu
          visible={roomMenuVisible}
          onDismiss={() => setRoomMenuVisible(false)}
          anchor={
            <Button
              mode="outlined"
              onPress={() => setRoomMenuVisible(true)}
              style={styles.roomButton}
            >
              {selectedRoom?.name ?? 'Unassigned'}
            </Button>
          }
        >
          <Menu.Item
            title="Unassigned"
            onPress={() => {
              setRoomId(null);
              setRoomMenuVisible(false);
            }}
          />
          <Divider />
          {rooms?.map((r) => (
            <Menu.Item
              key={r.id}
              title={r.name}
              onPress={() => {
                setRoomId(r.id);
                setRoomMenuVisible(false);
              }}
            />
          ))}
        </Menu>

        {device.is_controllable && (
          <>
            <Divider style={styles.divider} />
            <Text variant="labelLarge" style={styles.label}>
              Controls
            </Text>
            <DeviceControlPanel
              householdId={householdId}
              deviceId={deviceId}
              device={device}
              fallbackActions={device.supported_actions}
              onAction={handleAction}
              actionLoading={actionLoading}
            />
            {lastAction && (
              <View style={styles.actionFeedback}>
                <Chip
                  icon="check-circle"
                  style={styles.successChip}
                  textStyle={styles.successText}
                  selectedColor="#16a34a"
                >
                  {lastAction} sent
                </Chip>
              </View>
            )}
          </>
        )}

        <Divider style={styles.divider} />

        <Text variant="labelLarge" style={styles.label}>
          Details
        </Text>
        <List.Item title="Entity ID" description={device.entity_id} />
        {device.protocol && (
          <List.Item title="Protocol" description={device.protocol} />
        )}
        {device.local_ip && (
          <List.Item title="Local IP" description={device.local_ip} />
        )}
        {device.mac_address && (
          <List.Item title="MAC Address" description={device.mac_address} />
        )}
        {device.cloud_id && (
          <List.Item title="Cloud ID" description={device.cloud_id} />
        )}
        {device.manufacturer && (
          <List.Item title="Manufacturer" description={device.manufacturer} />
        )}
        {device.model && (
          <List.Item title="Model" description={device.model} />
        )}
        <List.Item title="Source" description={device.source} />

        <Divider style={styles.divider} />

        <Button
          mode="contained"
          onPress={handleSave}
          loading={saving}
          disabled={saving || !name.trim()}
          style={styles.saveButton}
        >
          Save
        </Button>

        <Button
          mode="outlined"
          onPress={handleDelete}
          textColor={theme.colors.error}
          style={styles.deleteButton}
        >
          Delete Device
        </Button>
      </ScrollView>

      {/* Input dialog for device pairing (PIN entry, etc.) */}
      <Portal>
        <Dialog visible={inputDialog !== null} onDismiss={() => setInputDialog(null)}>
          <Dialog.Title>{inputDialog?.type === 'pin' ? 'Enter PIN' : 'Input Required'}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={{ marginBottom: 12 }}>
              {inputDialog?.prompt}
            </Text>
            <TextInput
              label={inputDialog?.type === 'pin' ? 'PIN' : 'Value'}
              value={inputValue}
              onChangeText={setInputValue}
              mode="outlined"
              keyboardType={inputDialog?.type === 'pin' ? 'number-pad' : 'default'}
              autoFocus
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setInputDialog(null)}>Cancel</Button>
            <Button onPress={handleInputSubmit} disabled={!inputValue}>Submit</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
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
  content: { padding: 16, paddingBottom: 48 },
  input: { marginBottom: 16 },
  label: { marginBottom: 8, marginTop: 8 },
  roomButton: { alignSelf: 'flex-start', marginBottom: 8 },
  divider: { marginVertical: 16 },
  saveButton: { marginTop: 8 },
  deleteButton: { marginTop: 12 },
  actionFeedback: { alignItems: 'center', marginTop: 12 },
  successChip: { backgroundColor: '#dcfce7' },
  successText: { color: '#16a34a' },
});

export default DeviceEditScreen;
