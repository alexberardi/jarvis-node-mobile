import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, Switch, Text } from 'react-native-paper';

import { controlDevice } from '../../api/smartHomeApi';
import type { DeviceState } from '../../types/SmartHome';

interface Props {
  householdId: string;
  deviceId: string;
  state: DeviceState;
  onStateChange: () => void;
}

const SwitchControl: React.FC<Props> = ({
  householdId,
  deviceId,
  state,
  onStateChange,
}) => {
  const [loading, setLoading] = useState(false);

  const s = state.state ?? {};
  const hasLiveState = state.state != null;
  const isOn = hasLiveState ? (s.state as string) === 'on' : false;

  const sendAction = useCallback(
    async (action: string) => {
      setLoading(true);
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
        setLoading(false);
      }
    },
    [householdId, deviceId, onStateChange],
  );

  if (!hasLiveState) {
    return (
      <View style={styles.buttonRow}>
        <Button
          mode="contained"
          onPress={() => sendAction('turn_on')}
          loading={loading}
          disabled={loading}
          icon="power"
          style={styles.rowButton}
        >
          Turn On
        </Button>
        <Button
          mode="contained-tonal"
          onPress={() => sendAction('turn_off')}
          disabled={loading}
          icon="power-off"
          style={styles.rowButton}
        >
          Turn Off
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.toggleRow}>
        <Text variant="titleMedium">{isOn ? 'On' : 'Off'}</Text>
        <Switch
          value={isOn}
          onValueChange={() => sendAction(isOn ? 'turn_off' : 'turn_on')}
          disabled={loading}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {},
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  rowButton: { flex: 1 },
});

export default SwitchControl;
