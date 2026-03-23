/**
 * DevicePicker — dropdown selector for smart home devices.
 *
 * Renders a list of devices as selectable chips. Used by PlaceholderResolverScreen.
 */

import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Chip, Text, useTheme } from 'react-native-paper';
import type { DeviceListItem } from '../../types/SmartHome';

interface DevicePickerProps {
  devices: DeviceListItem[];
  selectedEntityId: string;
  onSelect: (entityId: string) => void;
  placeholder?: string;
}

export default function DevicePicker({
  devices,
  selectedEntityId,
  onSelect,
  placeholder = 'Select a device...',
}: DevicePickerProps) {
  const theme = useTheme();

  if (devices.length === 0) {
    return (
      <Text variant="bodySmall" style={{ color: theme.colors.error, fontStyle: 'italic' }}>
        No devices found for this domain. Discover devices first.
      </Text>
    );
  }

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {devices.map((device) => (
          <Chip
            key={device.entity_id}
            selected={device.entity_id === selectedEntityId}
            onPress={() => onSelect(device.entity_id)}
            style={styles.chip}
            showSelectedOverlay
          >
            {device.name}
          </Chip>
        ))}
      </ScrollView>
      {!selectedEntityId && (
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
          {placeholder}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { marginRight: 8 },
});
