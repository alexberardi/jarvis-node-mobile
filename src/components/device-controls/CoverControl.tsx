import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';

import { controlDevice } from '../../api/smartHomeApi';
import type { DeviceState } from '../../types/SmartHome';

interface Props {
  householdId: string;
  deviceId: string;
  state: DeviceState;
  onStateChange: () => void;
}

const CoverControl: React.FC<Props> = ({
  householdId,
  deviceId,
  state,
  onStateChange,
}) => {
  const theme = useTheme();
  const [loading, setLoading] = useState<string | null>(null);

  const s = state.state ?? {};
  const hasLiveState = state.state != null;
  const coverState = hasLiveState ? ((s.state as string) ?? 'unknown') : null;
  const position = s.position as number | undefined;

  const handleAction = useCallback(
    async (action: string) => {
      setLoading(action);
      try {
        const result = await controlDevice(householdId, deviceId, action);
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

  return (
    <View style={styles.container}>
      {hasLiveState && coverState && (
        <View style={styles.statusRow}>
          <Text variant="titleMedium">
            {coverState.charAt(0).toUpperCase() + coverState.slice(1)}
          </Text>
          {position != null && (
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {position}% open
            </Text>
          )}
        </View>
      )}

      <View style={styles.buttonRow}>
        <Button
          mode="contained-tonal"
          onPress={() => handleAction('open_cover')}
          loading={loading === 'open_cover'}
          disabled={loading !== null}
          icon="arrow-up"
          style={styles.button}
        >
          Open
        </Button>
        <Button
          mode="contained-tonal"
          onPress={() => handleAction('stop_cover')}
          loading={loading === 'stop_cover'}
          disabled={loading !== null}
          icon="stop"
          style={styles.button}
        >
          Stop
        </Button>
        <Button
          mode="contained-tonal"
          onPress={() => handleAction('close_cover')}
          loading={loading === 'close_cover'}
          disabled={loading !== null}
          icon="arrow-down"
          style={styles.button}
        >
          Close
        </Button>
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
    gap: 12,
  },
  button: { flex: 1 },
});

export default CoverControl;
