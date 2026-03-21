import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getDeviceState } from '../../api/smartHomeApi';
import ActionButtons from '../ActionButtons';
import type { DeviceListItem, DeviceState, JarvisButton } from '../../types/SmartHome';
import CameraControl from './CameraControl';
import ClimateControl from './ClimateControl';
import CoverControl from './CoverControl';
import KettleControl from './KettleControl';
import LightControl from './LightControl';
import LockControl from './LockControl';
import SwitchControl from './SwitchControl';

interface Props {
  householdId: string;
  deviceId: string;
  device: DeviceListItem;
  fallbackActions: JarvisButton[] | null;
  onAction: (action: JarvisButton) => void;
  actionLoading: string | null;
  /** When true, skip the device state query and render action buttons directly. */
  skipStateQuery?: boolean;
}

/** Map device domain to the control_type used by domain components. */
const DOMAIN_TO_CONTROL_TYPE: Record<string, string> = {
  climate: 'thermostat',
  light: 'light',
  switch: 'toggle',
  lock: 'lock',
  camera: 'camera',
  cover: 'cover',
  media_player: 'media',
  kettle: 'kettle',
};

/** Default UI hints per domain when the state query fails. */
const DEFAULT_UI_HINTS: Record<string, DeviceState['ui_hints']> = {
  climate: {
    control_type: 'thermostat',
    features: ['heat', 'cool', 'off'],
    min_value: 50,
    max_value: 90,
    step: 1,
    unit: 'F',
  },
  light: {
    control_type: 'light',
    features: ['brightness', 'color', 'color_temp'],
    min_value: 0,
    max_value: 100,
    step: 1,
    unit: '%',
  },
  lock: { control_type: 'lock', features: [] },
  cover: { control_type: 'cover', features: [], min_value: 0, max_value: 100, step: 1, unit: '%' },
  camera: { control_type: 'camera', features: [] },
  kettle: {
    control_type: 'kettle',
    features: ['boil', 'keep_warm', 'off'],
    min_value: 40,
    max_value: 100,
    step: 1,
    unit: 'C',
  },
  switch: { control_type: 'toggle', features: [] },
};

/**
 * Dispatcher that fetches device state and renders the appropriate
 * domain-specific control component. When the state query fails,
 * it still picks the right domain component based on device.domain
 * so the user always gets a rich UI (temp input, mode chips, etc.)
 * instead of bare action buttons.
 */
const DeviceControlPanel: React.FC<Props> = ({
  householdId,
  deviceId,
  device,
  fallbackActions,
  onAction,
  actionLoading,
  skipStateQuery = false,
}) => {
  const theme = useTheme();
  const queryClient = useQueryClient();

  const {
    data: deviceState,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['deviceState', householdId, deviceId],
    queryFn: () => getDeviceState(householdId, deviceId),
    staleTime: 10_000,
    retry: 1,
    enabled: !skipStateQuery,
  });

  const invalidateState = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ['deviceState', householdId, deviceId],
    });
  }, [queryClient, householdId, deviceId]);

  // When skipping state query, render action buttons directly
  if (skipStateQuery) {
    if (fallbackActions && fallbackActions.length > 0) {
      return (
        <ActionButtons
          actions={fallbackActions}
          onPress={onAction}
          loadingAction={actionLoading}
        />
      );
    }
    return null;
  }

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" />
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}
        >
          Querying device...
        </Text>
      </View>
    );
  }

  // Determine control type: prefer live state hints, fall back to device domain
  const controlType =
    deviceState?.ui_hints?.control_type ??
    DOMAIN_TO_CONTROL_TYPE[device.domain] ??
    null;

  // Build a DeviceState for domain components even when the query failed.
  // Domain components handle missing state gracefully (no current temp, etc.)
  const effectiveState: DeviceState = deviceState?.state
    ? deviceState
    : {
        entity_id: device.entity_id,
        domain: device.domain,
        state: null,
        ui_hints: deviceState?.ui_hints ?? DEFAULT_UI_HINTS[device.domain] ?? null,
        error: deviceState?.error ?? (isError ? 'Device unreachable' : null),
      };

  switch (controlType) {
    case 'thermostat':
      return (
        <ClimateControl
          householdId={householdId}
          deviceId={deviceId}
          state={effectiveState}
          onStateChange={invalidateState}
        />
      );

    case 'light':
      return (
        <LightControl
          householdId={householdId}
          deviceId={deviceId}
          state={effectiveState}
          onStateChange={invalidateState}
        />
      );

    case 'toggle':
      return (
        <SwitchControl
          householdId={householdId}
          deviceId={deviceId}
          state={effectiveState}
          onStateChange={invalidateState}
        />
      );

    case 'lock':
      return (
        <LockControl
          householdId={householdId}
          deviceId={deviceId}
          state={effectiveState}
          onStateChange={invalidateState}
        />
      );

    case 'kettle':
      return (
        <KettleControl
          householdId={householdId}
          deviceId={deviceId}
          state={effectiveState}
          onStateChange={invalidateState}
        />
      );

    case 'camera':
      return <CameraControl state={effectiveState} />;

    case 'cover':
      return (
        <CoverControl
          householdId={householdId}
          deviceId={deviceId}
          state={effectiveState}
          onStateChange={invalidateState}
        />
      );

    default:
      // Unknown domain — fall back to action buttons
      if (fallbackActions && fallbackActions.length > 0) {
        return (
          <ActionButtons
            actions={fallbackActions}
            onPress={onAction}
            loadingAction={actionLoading}
          />
        );
      }
      return null;
  }
};

const styles = StyleSheet.create({
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
});

export default DeviceControlPanel;
