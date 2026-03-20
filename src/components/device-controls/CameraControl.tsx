import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip, Text, useTheme } from 'react-native-paper';

import type { DeviceState } from '../../types/SmartHome';

interface Props {
  state: DeviceState;
}

const CameraControl: React.FC<Props> = ({ state }) => {
  const theme = useTheme();

  const s = state.state ?? {};
  const online = (s.online as boolean) ?? false;

  return (
    <View style={styles.container}>
      <View style={styles.statusRow}>
        <Chip
          icon={online ? 'check-circle' : 'alert-circle'}
          style={{
            backgroundColor: online ? '#dcfce7' : theme.colors.errorContainer,
          }}
          textStyle={{
            color: online ? '#16a34a' : theme.colors.onErrorContainer,
          }}
        >
          {online ? 'Online' : 'Offline'}
        </Chip>
      </View>
      <Text
        variant="bodySmall"
        style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}
      >
        Live stream not yet supported
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 12, alignItems: 'center', paddingVertical: 8 },
  statusRow: { alignItems: 'center' },
});

export default CameraControl;
