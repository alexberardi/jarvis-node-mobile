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
  // A live state that is neither on nor off (e.g. 'unknown') is indeterminate:
  // show it as such, not as Off, and let the user pick the action.
  const isKnown = isOn || (s.state as string) === 'off';

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

  if (!hasLiveState || !isKnown) {
    const buttons = (
      <View style={styles.buttonRow}>
        <Button
          testID="switch-power-on"
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
          testID="switch-power-off"
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
    if (!hasLiveState) return buttons;
    return (
      <View style={styles.unknownContainer}>
        <Text variant="titleMedium">Unknown</Text>
        {buttons}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.toggleRow}>
        <Text variant="titleMedium">{isOn ? 'On' : 'Off'}</Text>
        <Switch
          testID="switch-power-switch"
          value={isOn}
          onValueChange={(value) => sendAction(value ? 'turn_on' : 'turn_off')}
          disabled={loading}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {},
  unknownContainer: { gap: 8 },
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
