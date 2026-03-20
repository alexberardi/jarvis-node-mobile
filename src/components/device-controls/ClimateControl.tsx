import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, Chip, IconButton, Text, TextInput, useTheme } from 'react-native-paper';

import { controlDevice } from '../../api/smartHomeApi';
import type { DeviceState } from '../../types/SmartHome';

interface Props {
  householdId: string;
  deviceId: string;
  state: DeviceState;
  onStateChange: () => void;
}

const DEBOUNCE_MS = 800;

const ClimateControl: React.FC<Props> = ({
  householdId,
  deviceId,
  state,
  onStateChange,
}) => {
  const theme = useTheme();
  const [loading, setLoading] = useState<string | null>(null);

  const s = state.state ?? {};
  const currentTemp = s.current_temperature as number | undefined;
  const serverTarget = s.target_temperature as number | undefined;
  const mode = (s.mode as string) ?? null;
  const humidity = s.humidity as number | undefined;
  const unit = state.ui_hints?.unit ?? 'F';
  const hasLiveState = state.state != null;

  // Optimistic local target that updates instantly on +/- taps.
  // Synced back to server value when it changes.
  const [localTarget, setLocalTarget] = useState<number | null>(serverTarget ?? null);
  useEffect(() => {
    if (serverTarget != null) setLocalTarget(serverTarget);
  }, [serverTarget]);

  // Debounced API call for +/- taps
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTempRef = useRef<number | null>(null);

  const flushTempChange = useCallback(async (temp: number) => {
    setLoading('temp');
    try {
      const result = await controlDevice(householdId, deviceId, 'set_temperature', {
        temperature: temp,
      });
      if (result.success) {
        onStateChange();
      } else {
        Alert.alert('Failed', result.error || 'Could not set temperature');
        // Revert optimistic update
        if (serverTarget != null) setLocalTarget(serverTarget);
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed');
      if (serverTarget != null) setLocalTarget(serverTarget);
    } finally {
      setLoading(null);
    }
  }, [householdId, deviceId, serverTarget, onStateChange]);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleTempTap = useCallback(
    (delta: number) => {
      const base = pendingTempRef.current ?? localTarget ?? serverTarget;
      if (base == null) return;

      const newTemp = base + delta;
      pendingTempRef.current = newTemp;
      setLocalTarget(newTemp);

      // Reset debounce timer
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const temp = pendingTempRef.current;
        pendingTempRef.current = null;
        debounceRef.current = null;
        if (temp != null) flushTempChange(temp);
      }, DEBOUNCE_MS);
    },
    [localTarget, serverTarget, flushTempChange],
  );

  // Manual temperature entry (no live state)
  const [manualTemp, setManualTemp] = useState('');

  const handleManualTempSubmit = useCallback(async () => {
    const temp = parseFloat(manualTemp);
    if (isNaN(temp)) {
      Alert.alert('Invalid', 'Enter a valid temperature');
      return;
    }
    setLoading('manual');
    try {
      const result = await controlDevice(householdId, deviceId, 'set_temperature', {
        temperature: temp,
      });
      if (result.success) {
        setManualTemp('');
        onStateChange();
      } else {
        Alert.alert('Failed', result.error || 'Could not set temperature');
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(null);
    }
  }, [householdId, deviceId, manualTemp, onStateChange]);

  const handleModeChange = useCallback(
    async (newMode: string) => {
      setLoading(newMode);
      try {
        const result = await controlDevice(householdId, deviceId, 'set_mode', {
          mode: newMode,
        });
        if (result.success) {
          onStateChange();
        } else {
          Alert.alert('Failed', result.error || 'Could not set mode');
        }
      } catch (err) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed');
      } finally {
        setLoading(null);
      }
    },
    [householdId, deviceId, onStateChange],
  );

  const modes = state.ui_hints?.features ?? ['heat', 'cool', 'off'];

  // +/- buttons are disabled only while an API call is in flight, not while debouncing
  const tempBusy = loading === 'temp';

  return (
    <View style={styles.container}>
      {/* Current temperature - large display (only with live state) */}
      {hasLiveState && currentTemp != null && (
        <View style={styles.currentTempContainer}>
          <Text variant="displayLarge" style={styles.currentTemp}>
            {currentTemp}°{unit}
          </Text>
          {humidity != null && (
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {humidity}% humidity
            </Text>
          )}
        </View>
      )}

      {/* Target temperature with +/- (live state available) */}
      {hasLiveState && localTarget != null && (
        <View style={styles.targetRow}>
          <IconButton
            icon="minus"
            mode="contained-tonal"
            onPress={() => handleTempTap(-1)}
            disabled={tempBusy}
            size={28}
            style={styles.tempButton}
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
            onPress={() => handleTempTap(1)}
            disabled={tempBusy}
            size={28}
            style={styles.tempButton}
          />
        </View>
      )}

      {/* Manual temperature input (no live state) */}
      {!hasLiveState && (
        <View style={styles.manualTempRow}>
          <TextInput
            label={`Temperature (°${unit})`}
            value={manualTemp}
            onChangeText={setManualTemp}
            keyboardType="numeric"
            mode="outlined"
            style={styles.manualTempInput}
            disabled={loading !== null}
          />
          <Button
            mode="contained"
            onPress={handleManualTempSubmit}
            loading={loading === 'manual'}
            disabled={loading !== null || !manualTemp.trim()}
            style={styles.manualTempButton}
          >
            Set
          </Button>
        </View>
      )}

      {/* Mode selector chips */}
      <View style={styles.modeRow}>
        {modes.map((m) => (
          <Chip
            key={m}
            selected={mode === m}
            onPress={() => handleModeChange(m)}
            disabled={loading !== null}
            style={styles.modeChip}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </Chip>
        ))}
      </View>

    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 16 },
  currentTempContainer: { alignItems: 'center', paddingVertical: 8 },
  currentTemp: { fontWeight: '700' },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  targetDisplay: { alignItems: 'center', minWidth: 80 },
  tempButton: {},
  manualTempRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  manualTempInput: { flex: 1 },
  manualTempButton: { marginTop: 6 },
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  modeChip: {},
});

export default ClimateControl;
