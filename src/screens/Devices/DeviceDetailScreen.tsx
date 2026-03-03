import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAuth } from '../../auth/AuthContext';
import * as smartHomeApi from '../../api/smartHomeApi';
import { Device } from '../../types/SmartHome';
import { RoomsStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RoomsStackParamList, 'DeviceDetail'>;

const DeviceDetailScreen = ({ navigation, route }: Props) => {
  const { deviceId } = route.params;
  const { state: authState } = useAuth();
  const theme = useTheme();
  const [device, setDevice] = useState<Device | null>(null);

  const householdId = authState.activeHouseholdId;
  const accessToken = authState.accessToken;

  const loadData = useCallback(async () => {
    if (!householdId || !accessToken) return;
    const devices = await smartHomeApi.listDevices(householdId, accessToken);
    const found = devices.find((d) => d.id === deviceId);
    setDevice(found || null);
  }, [householdId, accessToken, deviceId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = () => {
    if (!householdId || !accessToken || !device) return;
    Alert.alert('Delete Device', `Remove "${device.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await smartHomeApi.deleteDevice(householdId, device.id, accessToken);
          navigation.goBack();
        },
      },
    ]);
  };

  if (!device) {
    return (
      <View style={styles.centered}>
        <Text variant="bodyLarge">Loading...</Text>
      </View>
    );
  }

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
        <Text variant="headlineSmall" style={styles.title}>
          {device.name}
        </Text>
      </View>

      <View style={styles.details}>
        <DetailRow label="Entity ID" value={device.entity_id} borderColor={theme.colors.outlineVariant} />
        <DetailRow label="Domain" value={device.domain} borderColor={theme.colors.outlineVariant} />
        <DetailRow label="Room" value={device.room_name || 'Unassigned'} borderColor={theme.colors.outlineVariant} />
        <DetailRow label="Source" value={device.source} borderColor={theme.colors.outlineVariant} />
        {device.manufacturer && (
          <DetailRow label="Manufacturer" value={device.manufacturer} borderColor={theme.colors.outlineVariant} />
        )}
        {device.model && <DetailRow label="Model" value={device.model} borderColor={theme.colors.outlineVariant} />}
        <DetailRow
          label="Controllable"
          value={device.is_controllable ? 'Yes' : 'No'}
          borderColor={theme.colors.outlineVariant}
        />
        <DetailRow
          label="Active"
          value={device.is_active ? 'Yes' : 'No'}
          borderColor={theme.colors.outlineVariant}
        />
      </View>

      <View style={styles.actions}>
        <Button mode="outlined" textColor={theme.colors.error} onPress={handleDelete}>
          Delete Device
        </Button>
      </View>
    </View>
  );
};

const DetailRow = ({
  label,
  value,
  borderColor,
}: {
  label: string;
  value: string;
  borderColor: string;
}) => (
  <View style={[styles.row, { borderBottomColor: borderColor }]}>
    <Text variant="bodyMedium" style={styles.label}>
      {label}
    </Text>
    <Text variant="bodyMedium">{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 48,
    marginBottom: 24,
  },
  backButton: { marginRight: 12, padding: 4 },
  title: { fontWeight: 'bold', flex: 1 },
  details: { gap: 12, marginBottom: 32 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  label: { opacity: 0.6 },
  actions: { gap: 12, marginTop: 'auto', marginBottom: 32 },
});

export default DeviceDetailScreen;
