import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Chip,
  Divider,
  List,
  Text,
  useTheme,
} from 'react-native-paper';

import { controlExternalDevice, type DeviceControlResponse } from '../../api/smartHomeApi';
import DeviceControlPanel from '../../components/device-controls/DeviceControlPanel';
import type { DeviceListItem, ExternalDeviceItem, JarvisButton } from '../../types/SmartHome';
import type { DevicesStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<DevicesStackParamList, 'ExternalDeviceDetail'>;

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

const ExternalDeviceDetailScreen = ({ navigation, route }: Props) => {
  const theme = useTheme();
  const { householdId } = route.params;
  const device: ExternalDeviceItem = JSON.parse(route.params.device);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);

  // Adapt ExternalDeviceItem to DeviceListItem shape for DeviceControlPanel
  const deviceAsListItem: DeviceListItem = {
    id: device.entity_id, // no real ID for external devices
    household_id: householdId,
    room_id: null,
    entity_id: device.entity_id,
    name: device.name,
    domain: device.domain,
    device_class: device.device_class,
    manufacturer: device.manufacturer,
    model: device.model,
    source: device.source,
    protocol: device.protocol,
    local_ip: device.local_ip,
    mac_address: device.mac_address,
    cloud_id: device.cloud_id,
    ha_device_id: null,
    is_controllable: device.is_controllable,
    is_active: true,
    room_name: device.area,
    supported_actions: device.supported_actions,
    created_at: '',
    updated_at: '',
  };

  const handleAction = useCallback(async (action: JarvisButton) => {
    setActionLoading(action.button_action);
    try {
      const result: DeviceControlResponse = await controlExternalDevice(
        householdId,
        device.entity_id,
        action.button_action,
        device.source,
        {
          protocol: device.protocol ?? undefined,
          cloud_id: device.cloud_id ?? undefined,
          model: device.model ?? undefined,
          local_ip: device.local_ip ?? undefined,
          mac_address: device.mac_address ?? undefined,
        },
      );
      if (result.success) {
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
  }, [householdId, device]);

  const icon = DOMAIN_ICONS[device.domain] || 'devices';

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={device.name} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.headerRow}>
          <List.Icon icon={icon} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text variant="titleLarge">{device.name}</Text>
            {device.area && (
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {device.area}
              </Text>
            )}
          </View>
          {device.state && (
            <Chip compact>{device.state}</Chip>
          )}
        </View>

        {/* Controls */}
        {device.is_controllable && (
          <>
            <Divider style={styles.divider} />
            <Text variant="labelLarge" style={styles.label}>Controls</Text>
            <DeviceControlPanel
              householdId={householdId}
              deviceId={device.entity_id}
              device={deviceAsListItem}
              fallbackActions={device.supported_actions}
              onAction={handleAction}
              actionLoading={actionLoading}
              skipStateQuery
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

        {/* Details */}
        <Divider style={styles.divider} />
        <Text variant="labelLarge" style={styles.label}>Details</Text>
        <List.Item title="Entity ID" description={device.entity_id} />
        {device.domain && <List.Item title="Domain" description={device.domain} />}
        {device.protocol && <List.Item title="Protocol" description={device.protocol} />}
        {device.source && <List.Item title="Source" description={device.source} />}
        {device.manufacturer && <List.Item title="Manufacturer" description={device.manufacturer} />}
        {device.model && <List.Item title="Model" description={device.model} />}
        {device.local_ip && <List.Item title="Local IP" description={device.local_ip} />}
        {device.mac_address && <List.Item title="MAC Address" description={device.mac_address} />}
        {device.cloud_id && <List.Item title="Cloud ID" description={device.cloud_id} />}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  label: { marginBottom: 8, marginTop: 8 },
  divider: { marginVertical: 16 },
  actionFeedback: { alignItems: 'center', marginTop: 12 },
  successChip: { backgroundColor: '#dcfce7' },
  successText: { color: '#16a34a' },
});

export default ExternalDeviceDetailScreen;
