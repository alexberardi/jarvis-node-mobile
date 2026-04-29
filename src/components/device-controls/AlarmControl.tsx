import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { controlDevice } from '../../api/smartHomeApi';
import type { DeviceState } from '../../types/SmartHome';

interface Props {
  householdId: string;
  deviceId: string;
  state: DeviceState;
  onStateChange: () => void;
}

const MODES = [
  { key: 'away', label: 'Away', action: 'arm_away', icon: 'shield-lock', color: '#dc2626' },
  { key: 'home', label: 'Home', action: 'arm_home', icon: 'shield-home', color: '#e68a00' },
  { key: 'off', label: 'Off', action: 'disarm', icon: 'shield-off', color: '#16a34a' },
] as const;

const STATE_LABELS: Record<string, string> = {
  away: 'Armed Away',
  home: 'Armed Home',
  off: 'Disarmed',
};

const AlarmControl: React.FC<Props> = ({
  householdId,
  deviceId,
  state,
  onStateChange,
}) => {
  const [loading, setLoading] = useState<string | null>(null);

  const s = state.state ?? {};
  const hasLiveState = state.state != null;

  const rawAlarmState = (s.alarm_state as string) ?? '';
  const currentMode = hasLiveState ? rawAlarmState.toLowerCase() : null;
  const isAlarming = hasLiveState ? (s.is_alarming as boolean) ?? false : false;
  const activeMode = MODES.find((m) => m.key === currentMode);

  const doAction = useCallback(
    async (action: string) => {
      setLoading(action);
      try {
        const result = await controlDevice(householdId, deviceId, action);
        if (result.success) {
          onStateChange();
        } else {
          Alert.alert('Failed', result.error || `Could not ${action}`);
        }
      } catch (err) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed');
      } finally {
        setLoading(null);
      }
    },
    [householdId, deviceId, onStateChange],
  );

  return (
    <View style={styles.container}>
      {hasLiveState && (
        <View style={styles.statusRow}>
          {isAlarming && (
            <Text
              variant="titleMedium"
              style={{ color: '#dc2626', marginBottom: 4 }}
            >
              ALARM TRIGGERED
            </Text>
          )}
          <Text
            variant="headlineSmall"
            style={{ color: activeMode?.color ?? '#888' }}
          >
            {activeMode ? STATE_LABELS[activeMode.key] ?? 'Unknown' : 'Unknown'}
          </Text>
        </View>
      )}

      <View style={styles.buttonRow}>
        {MODES.map((mode) => {
          const isActive = currentMode === mode.key;
          return (
            <Button
              key={mode.key}
              mode={isActive ? 'contained' : 'outlined'}
              onPress={() => doAction(mode.action)}
              loading={loading === mode.action}
              disabled={loading !== null}
              icon={mode.icon}
              style={styles.modeButton}
              buttonColor={isActive ? mode.color : undefined}
              textColor={isActive ? '#ffffff' : undefined}
            >
              {mode.label}
            </Button>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 16 },
  statusRow: { alignItems: 'center', paddingVertical: 8 },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  modeButton: { flex: 1 },
});

export default AlarmControl;
