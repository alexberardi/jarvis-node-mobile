import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, Chip, IconButton, Text, useTheme } from 'react-native-paper';

import { controlDevice } from '../../api/smartHomeApi';
import type { DeviceState } from '../../types/SmartHome';

interface Props {
  householdId: string;
  deviceId: string;
  state: DeviceState;
  onStateChange: () => void;
}

const DEBOUNCE_MS = 800;

const KettleControl: React.FC<Props> = ({
  householdId,
  deviceId,
  state,
  onStateChange,
}) => {
  const theme = useTheme();
  const [loading, setLoading] = useState<string | null>(null);

  const s = state.state ?? {};
  const hasLiveState = state.state != null;
  const isOn = (s.state as string) === 'on';
  const currentTemp = s.current_temperature as number | undefined;
  const serverTarget = s.target_temperature as number | undefined;
  const mode = (s.mode as string) ?? null;
  const unit = (s.unit as string) ?? state.ui_hints?.unit ?? 'C';

  const minTemp = state.ui_hints?.min_value ?? 40;
  const maxTemp = state.ui_hints?.max_value ?? 100;

  // Optimistic local target with debounce (same pattern as thermostat)
  const [localTarget, setLocalTarget] = useState<number>(serverTarget ?? 80);
  useEffect(() => {
    if (serverTarget != null) setLocalTarget(serverTarget);
  }, [serverTarget]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTempRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const flushTempChange = useCallback(
    async (temp: number) => {
      setLoading('temp');
      try {
        const result = await controlDevice(householdId, deviceId, 'set_temperature', {
          temperature: temp,
          unit: unit === 'F' ? 'Fahrenheit' : 'Celsius',
        });
        if (result.success) {
          onStateChange();
        } else {
          Alert.alert('Failed', result.error || 'Could not set temperature');
          if (serverTarget != null) setLocalTarget(serverTarget);
        }
      } catch (err) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed');
        if (serverTarget != null) setLocalTarget(serverTarget);
      } finally {
        setLoading(null);
      }
    },
    [householdId, deviceId, unit, serverTarget, onStateChange],
  );

  const handleTempTap = useCallback(
    (delta: number) => {
      const base = pendingTempRef.current ?? localTarget;
      const newTemp = Math.max(minTemp, Math.min(maxTemp, base + delta));
      pendingTempRef.current = newTemp;
      setLocalTarget(newTemp);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const temp = pendingTempRef.current;
        pendingTempRef.current = null;
        debounceRef.current = null;
        if (temp != null) flushTempChange(temp);
      }, DEBOUNCE_MS);
    },
    [localTarget, minTemp, maxTemp, flushTempChange],
  );

  const sendAction = useCallback(
    async (action: string, data?: Record<string, unknown>) => {
      setLoading(action);
      try {
        const result = await controlDevice(householdId, deviceId, action, data);
        if (result.success) {
          onStateChange();
        } else {
          Alert.alert('Failed', result.error || `Could not ${action.replace('_', ' ')}`);
        }
      } catch (err) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed');
      } finally {
        setLoading(null);
      }
    },
    [householdId, deviceId, onStateChange],
  );

  const tempBusy = loading === 'temp';
  const modes = state.ui_hints?.features ?? ['boil', 'keep_warm', 'off'];

  return (
    <View style={styles.container}>
      {/* Current water temperature (live state only) */}
      {hasLiveState && currentTemp != null && (
        <View style={styles.currentTempContainer}>
          <Text style={[styles.currentTempLabel, { color: theme.colors.onSurfaceVariant }]}>
            Water
          </Text>
          <Text variant="displayMedium" style={styles.currentTemp}>
            {currentTemp}°{unit}
          </Text>
        </View>
      )}

      {/* Power status */}
      {hasLiveState && (
        <View style={styles.statusRow}>
          <Chip
            style={{
              backgroundColor: isOn ? '#16a34a' : theme.colors.surfaceVariant,
            }}
            textStyle={{ color: isOn ? '#fff' : theme.colors.onSurfaceVariant, fontWeight: '600' }}
          >
            {isOn ? 'Heating' : 'Off'}
          </Chip>
        </View>
      )}

      {/* Target temperature with +/- */}
      <View style={styles.targetRow}>
        <IconButton
          icon="minus"
          mode="contained-tonal"
          onPress={() => handleTempTap(-5)}
          disabled={tempBusy}
          size={24}
        />
        <View style={styles.targetDisplay}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Target
          </Text>
          <Text variant="headlineMedium">{localTarget}°{unit}</Text>
        </View>
        <IconButton
          icon="plus"
          mode="contained-tonal"
          onPress={() => handleTempTap(5)}
          disabled={tempBusy}
          size={24}
        />
      </View>

      {/* Mode chips */}
      <View style={styles.modeRow}>
        {modes.map((m) => {
          const label = m === 'keep_warm' ? 'Keep Warm' : m.charAt(0).toUpperCase() + m.slice(1);
          return (
            <Chip
              key={m}
              selected={mode === m}
              onPress={() => {
                if (m === 'off') {
                  sendAction('turn_off');
                } else if (m === 'boil') {
                  sendAction('turn_on');
                } else {
                  sendAction('set_mode', { mode: m });
                }
              }}
              disabled={loading !== null}
              style={styles.modeChip}
            >
              {label}
            </Chip>
          );
        })}
      </View>

      {/* Quick boil button (when no live state, make it prominent) */}
      {!hasLiveState && (
        <Button
          mode="contained"
          onPress={() => sendAction('turn_on')}
          loading={loading === 'turn_on'}
          disabled={loading !== null}
          icon="kettle"
        >
          Boil
        </Button>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 16 },
  currentTempContainer: { alignItems: 'center', paddingVertical: 4 },
  currentTempLabel: { fontSize: 12 },
  currentTemp: { fontWeight: '700' },
  statusRow: { alignItems: 'center' },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  targetDisplay: { alignItems: 'center', minWidth: 80 },
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  modeChip: {},
});

export default KettleControl;
