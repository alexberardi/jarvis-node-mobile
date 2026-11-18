import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Icon, List, Switch, useTheme } from 'react-native-paper';

import { controlDevice, getDeviceState } from '../api/smartHomeApi';
import type { DeviceListItem, DeviceState } from '../types/SmartHome';

/** How a row reads a device's live state, and whether it gets a switch. */
export const describeState = (
  domain: string,
  state: DeviceState | undefined,
): { label: string; on: boolean | null } => {
  const s = (state?.state ?? null) as Record<string, unknown> | null;
  if (!s) return { label: 'Not responding', on: null };
  const raw = typeof s.state === 'string' ? s.state : null;
  switch (domain) {
    case 'light': {
      if (raw !== 'on' && raw !== 'off') return { label: 'Unknown', on: null };
      const b = typeof s.brightness === 'number' ? ` · ${Math.round(s.brightness)}%` : '';
      return { label: raw === 'on' ? `On${b}` : 'Off', on: raw === 'on' };
    }
    case 'switch':
      if (raw !== 'on' && raw !== 'off') return { label: 'Unknown', on: null };
      return { label: raw === 'on' ? 'On' : 'Off', on: raw === 'on' };
    case 'lock': {
      const locked = typeof s.is_locked === 'boolean' ? s.is_locked : raw === 'locked' ? true : raw === 'unlocked' ? false : null;
      return locked === null ? { label: 'Unknown', on: null } : { label: locked ? 'Locked' : 'Unlocked', on: locked };
    }
    case 'climate': {
      const mode = typeof s.mode === 'string' ? s.mode : null;
      const target = typeof s.target_temperature === 'number' ? s.target_temperature : null;
      const current = typeof s.current_temperature === 'number' ? s.current_temperature : null;
      const parts = [
        mode && mode !== 'off' && target != null ? `${mode[0].toUpperCase()}${mode.slice(1)} to ${target}°` : mode === 'off' ? 'Off' : null,
        current != null ? `${current}° now` : null,
      ].filter(Boolean);
      return { label: parts.join(' · ') || 'Unknown', on: null };
    }
    default:
      return { label: raw ? `${raw[0].toUpperCase()}${raw.slice(1).replace(/_/g, ' ')}` : 'Unknown', on: null };
  }
};

const SWITCHABLE = new Set(['light', 'switch', 'lock']);

interface Props {
  device: DeviceListItem;
  icon: string;
  onPress: () => void;
}

/**
 * One device in the Devices list: its live state, and a switch for lights, plugs and locks.
 * State comes from the node one device at a time (no list-wide call), shared with the
 * device screen through the same query key.
 */
const DeviceRow = ({ device, icon, onPress }: Props) => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const key = ['deviceState', device.household_id, device.id];
  const [busy, setBusy] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: key,
    queryFn: () => getDeviceState(device.household_id, device.id),
    staleTime: 30_000,
    retry: 0,
    enabled: device.is_controllable,
  });

  const described = device.is_controllable && !isLoading && !isError ? describeState(device.domain, data) : null;
  const subtitle = !device.is_controllable
    ? [device.manufacturer, device.protocol].filter(Boolean).join(' · ') || device.entity_id
    : isLoading
      ? 'Checking…'
      : isError || !described
        ? 'Not responding'
        : described.label;
  const on = described?.on ?? null;
  // Lights, plugs and locks always show their switch, so the list reads the same whether or
  // not the node answers; it only works once the device reports on/off (or locked/unlocked).
  const showSwitch = device.is_controllable && SWITCHABLE.has(device.domain);
  const switchLive = on !== null;

  const send = async (action: string) => {
    setBusy(true);
    try {
      const result = await controlDevice(device.household_id, device.id, action);
      if (!result.success) Alert.alert('Failed', result.error || `Could not ${action.replace('_', ' ')}`);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const toggle = (next: boolean) => {
    if (device.domain === 'lock') {
      if (next) send('lock');
      else
        Alert.alert('Unlock?', `Unlock ${device.name}?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Unlock', style: 'destructive', onPress: () => send('unlock') },
        ]);
      return;
    }
    send(next ? 'turn_on' : 'turn_off');
  };

  const active = on === true;
  return (
    <List.Item
      testID={`device-row-${device.id}`}
      title={device.name}
      description={subtitle}
      descriptionStyle={active ? { color: theme.colors.primary, fontWeight: '600' } : undefined}
      onPress={onPress}
      style={styles.row}
      left={() => (
        <View style={[styles.icon, { backgroundColor: active ? theme.colors.secondaryContainer : theme.colors.surfaceVariant }]}>
          <Icon source={icon} size={22} color={active ? theme.colors.primary : theme.colors.onSurfaceVariant} />
        </View>
      )}
      right={() =>
        showSwitch ? (
          <Switch
            testID={`device-switch-${device.id}`}
            value={active}
            disabled={busy || !switchLive}
            onValueChange={toggle}
            accessibilityLabel={`${device.name} ${device.domain === 'lock' ? 'locked' : 'on'}`}
          />
        ) : (
          <View style={styles.chev}>
            <Icon source="chevron-right" size={22} color={theme.colors.onSurfaceVariant} />
          </View>
        )
      }
    />
  );
};

const styles = StyleSheet.create({
  row: { paddingLeft: 16, paddingVertical: 10 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  chev: { justifyContent: 'center' },
});

export default DeviceRow;
