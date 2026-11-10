import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Text, useTheme } from 'react-native-paper';

import type { SnapshotState } from '../hooks/useSettingsSnapshot';

interface Props {
  state: SnapshotState;
  /** The hook's message for the state (timeout, error, no_access, needs_k2). */
  error: string | null;
  onRetry: () => void;
  /** Sets up an encryption key (state needs_k2). */
  onProvisionKey: () => Promise<void>;
  /** Shown when the snapshot loaded but has no settings for this card. */
  emptyMessage: string;
}

/**
 * The body of a node-settings card whose snapshot isn't usable: loading, or why not and what
 * to do about it. Each state used to show the same endless spinner, so "the card never loads"
 * reports couldn't say whether the node was offline, had no key, or failed to decrypt.
 */
export const SnapshotStatus = ({ state, error, onRetry, onProvisionKey, emptyMessage }: Props) => {
  const theme = useTheme();
  const [provisioning, setProvisioning] = useState(false);

  if (state === 'idle' || state === 'loading') {
    return (
      <View style={styles.row} testID="snapshot-loading">
        <ActivityIndicator animating size="small" />
        <Text variant="bodySmall" style={styles.loadingText}>
          Loading current settings from the node…
        </Text>
      </View>
    );
  }

  let message = emptyMessage;
  let action: React.ReactNode = null;
  switch (state) {
    case 'needs_k2':
      message = error ?? "This node doesn't have an encryption key yet.";
      action = (
        <Button
          mode="contained"
          compact
          loading={provisioning}
          disabled={provisioning}
          onPress={async () => {
            setProvisioning(true);
            try {
              await onProvisionKey();
            } finally {
              setProvisioning(false);
            }
          }}
        >
          Set up encryption key
        </Button>
      );
      break;
    case 'timeout':
    case 'error':
      message = error ?? 'Could not load settings from the node.';
      action = (
        <Button mode="outlined" compact icon="refresh" onPress={onRetry}>
          Try again
        </Button>
      );
      break;
    case 'no_access':
      message = error ?? 'This node was set up on another device.';
      break;
  }

  return (
    <View testID={`snapshot-${state}`}>
      <Text
        variant="bodyMedium"
        style={[styles.message, (state === 'error' || state === 'timeout') && { color: theme.colors.error }]}
      >
        {message}
      </Text>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  loadingText: { marginLeft: 12, opacity: 0.7 },
  message: { opacity: 0.85 },
  action: { flexDirection: 'row', marginTop: 12 },
});
