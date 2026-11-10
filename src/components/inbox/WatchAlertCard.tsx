import React from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import { Button, Chip, Text, useTheme } from 'react-native-paper';

import type { WatchAlertData } from '../../types/autonomyCards';
import { parseServerDate } from '../../utils/serverTime';

interface WatchAlertCardProps {
  data: WatchAlertData;
}

const STATE_LABELS: Record<string, string> = {
  done: 'Stopped',
  paused: 'Paused',
};

/**
 * Watch-alert inbox card (metadata.card_type === 'watch_alert'): what the
 * watch looks for, the new value beside the previous one, and the source.
 * Pause and Stop watching stay with InteractiveElementsSection.
 */
const WatchAlertCard: React.FC<WatchAlertCardProps> = ({ data }) => {
  const theme = useTheme();
  const stateLabel = STATE_LABELS[data.state];
  const change =
    data.previous && data.previous !== data.value
      ? `${data.previous} → ${data.value}`
      : data.value;
  const checked = data.checkedAt
    ? (parseServerDate(data.checkedAt) ?? new Date(data.checkedAt)).toLocaleString()
    : null;
  const sourceUrl = data.sourceUrl;

  return (
    <View testID="watch-card" style={styles.container}>
      {stateLabel ? (
        <Chip compact style={styles.chip} testID="watch-state">
          {stateLabel}
        </Chip>
      ) : null}

      <View>
        <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
          Watching for
        </Text>
        <Text variant="bodyLarge">{data.lookingFor}</Text>
      </View>

      <Text variant="headlineMedium" testID="watch-change">
        {change}
      </Text>

      {checked ? (
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {`Checked ${checked}`}
        </Text>
      ) : null}

      {sourceUrl ? (
        <Button
          mode="contained"
          icon="open-in-new"
          testID="watch-open-link"
          onPress={() => {
            Linking.openURL(sourceUrl).catch(() =>
              Alert.alert('Error', 'Could not open the link.'),
            );
          }}
          style={styles.link}
        >
          {`Open ${data.sourceLabel || 'link'}`}
        </Button>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  chip: {
    alignSelf: 'flex-start',
  },
  link: {
    alignSelf: 'flex-start',
  },
});

export default WatchAlertCard;
