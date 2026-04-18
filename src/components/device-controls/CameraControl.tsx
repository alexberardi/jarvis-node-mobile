import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Chip, Text, useTheme } from 'react-native-paper';

import type { DeviceState } from '../../types/SmartHome';
import type { DevicesStackParamList } from '../../navigation/types';

interface Props {
  state: DeviceState;
  householdId?: string;
  deviceId?: string;
  deviceName?: string;
}

type Nav = NativeStackNavigationProp<DevicesStackParamList>;

const CameraControl: React.FC<Props> = ({ state, householdId, deviceId, deviceName }) => {
  const theme = useTheme();
  const navigation = useNavigation<Nav>();

  const s = state.state ?? {};
  const online = (s.online as boolean | undefined) ?? (s.connectivity === 'ONLINE');
  const stateUnknown = state.state === null;

  // Allow streaming even when state is unknown (token may be expired but camera is fine)
  const canStream = (online || stateUnknown) && householdId && deviceId;

  const handleViewLive = () => {
    if (!householdId || !deviceId) return;
    navigation.navigate('CameraView', {
      deviceId,
      householdId,
      deviceName: deviceName ?? 'Camera',
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.statusRow}>
        <Chip
          icon={online ? 'check-circle' : stateUnknown ? 'help-circle' : 'alert-circle'}
          style={{
            backgroundColor: online
              ? '#dcfce7'
              : stateUnknown
                ? theme.colors.surfaceVariant
                : theme.colors.errorContainer,
          }}
          textStyle={{
            color: online
              ? '#16a34a'
              : stateUnknown
                ? theme.colors.onSurfaceVariant
                : theme.colors.onErrorContainer,
          }}
        >
          {online ? 'Online' : stateUnknown ? 'Status Unknown' : 'Offline'}
        </Chip>
      </View>

      {canStream ? (
        <Button
          mode="contained"
          icon="video"
          onPress={handleViewLive}
          style={styles.streamButton}
        >
          View Live
        </Button>
      ) : (
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}
        >
          Camera is offline
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 12, alignItems: 'center', paddingVertical: 8 },
  statusRow: { alignItems: 'center' },
  streamButton: { marginTop: 4 },
});

export default CameraControl;
