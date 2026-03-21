import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Chip,
  Divider,
  List,
  Text,
  useTheme,
} from 'react-native-paper';

import type { ExternalDeviceItem } from '../../types/SmartHome';
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
  const device: ExternalDeviceItem = JSON.parse(route.params.device);

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

        {/* Controls hidden — device is externally managed */}

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
});

export default ExternalDeviceDetailScreen;
