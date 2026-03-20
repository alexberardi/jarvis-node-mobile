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

const LockControl: React.FC<Props> = ({
  householdId,
  deviceId,
  state,
  onStateChange,
}) => {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);

  const s = state.state ?? {};
  const hasLiveState = state.state != null;
  const isLocked = hasLiveState
    ? ((s.is_locked as boolean) ?? (s.state as string) === 'locked')
    : null;

  const doAction = useCallback(
    async (action: string) => {
      setLoading(true);
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
        setLoading(false);
      }
    },
    [householdId, deviceId, onStateChange],
  );

  const confirmUnlock = useCallback(() => {
    Alert.alert('Confirm Unlock', 'Are you sure you want to unlock this device?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unlock', style: 'destructive', onPress: () => doAction('unlock') },
    ]);
  }, [doAction]);

  // No live state: show both buttons
  if (isLocked === null) {
    return (
      <View style={styles.buttonRow}>
        <Button
          mode="contained"
          onPress={() => doAction('lock')}
          loading={loading}
          disabled={loading}
          icon="lock"
          style={styles.rowButton}
        >
          Lock
        </Button>
        <Button
          mode="contained"
          onPress={confirmUnlock}
          disabled={loading}
          icon="lock-open"
          buttonColor={theme.colors.error}
          textColor={theme.colors.onError}
          style={styles.rowButton}
        >
          Unlock
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.statusRow}>
        <Text
          variant="headlineSmall"
          style={{ color: isLocked ? '#16a34a' : theme.colors.error }}
        >
          {isLocked ? 'Locked' : 'Unlocked'}
        </Text>
      </View>

      <View style={styles.buttonRow}>
        {isLocked ? (
          <Button
            mode="contained"
            onPress={confirmUnlock}
            loading={loading}
            disabled={loading}
            icon="lock-open"
            buttonColor={theme.colors.error}
            textColor={theme.colors.onError}
            style={styles.actionButton}
          >
            Unlock
          </Button>
        ) : (
          <Button
            mode="contained"
            onPress={() => doAction('lock')}
            loading={loading}
            disabled={loading}
            icon="lock"
            style={styles.actionButton}
          >
            Lock
          </Button>
        )}
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
  rowButton: { flex: 1 },
  actionButton: { minWidth: 160 },
});

export default LockControl;
