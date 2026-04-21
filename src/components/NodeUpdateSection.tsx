import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Text, useTheme } from 'react-native-paper';

import { NodeInfo } from '../api/nodeApi';
import { getLatestRelease, LatestRelease } from '../api/nodeUpdateApi';
import { useNodeUpdate } from '../hooks/useNodeUpdate';

interface Props {
  node: NodeInfo;
}

const compareVersions = (a: string, b: string): number => {
  const parse = (v: string) =>
    v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10));
  const aa = parse(a);
  const bb = parse(b);
  for (let i = 0; i < Math.max(aa.length, bb.length); i += 1) {
    const x = aa[i] ?? 0;
    const y = bb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
};

const stateLabel = (state: string): string => {
  switch (state) {
    case 'pending':
      return 'Queued — will apply on next heartbeat';
    case 'dispatched':
      return 'Node received the update request';
    case 'in_progress':
      return 'Installing new version';
    case 'success':
      return 'Update complete';
    case 'failed':
      return 'Update failed';
    default:
      return state;
  }
};

export const NodeUpdateSection: React.FC<Props> = ({ node }) => {
  const theme = useTheme();
  const [latest, setLatest] = useState<LatestRelease | null>(null);
  const { task, error, loading, rehydrating, trigger } = useNodeUpdate(node.node_id);

  useEffect(() => {
    let cancelled = false;
    getLatestRelease().then((info) => {
      if (!cancelled) setLatest(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Update is only meaningful for tarball installs (the ones the node can
  // upgrade itself). Docker / dev show version but no button.
  const supported = node.install_mode === 'tarball';
  const current = node.last_seen_version;
  const updateAvailable =
    supported &&
    !!latest &&
    !!current &&
    compareVersions(latest.version, current) > 0;

  const isActive = task && task.state !== 'success' && task.state !== 'failed';

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text variant="titleSmall">Node version</Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {current ?? 'Unknown'}
            {node.install_mode ? ` · ${node.install_mode}` : ''}
          </Text>
          {latest && updateAvailable && (
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.primary, marginTop: 2 }}
            >
              Latest: {latest.version}
            </Text>
          )}
        </View>
        {supported && updateAvailable && !isActive && !rehydrating && (
          <Button
            mode="contained"
            onPress={() => trigger(null)}
            loading={loading}
            disabled={loading || node.is_busy}
          >
            Update
          </Button>
        )}
        {rehydrating && (
          <ActivityIndicator size={16} style={{ marginLeft: 8 }} />
        )}
      </View>

      {node.is_busy && !isActive && (
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant, marginTop: 6 }}
        >
          Node is busy — update will defer.
        </Text>
      )}

      {isActive && task && (
        <View style={styles.activeRow}>
          <ActivityIndicator size={16} />
          <Text variant="bodySmall" style={{ marginLeft: 8, flex: 1 }}>
            {stateLabel(task.state)}
            {task.target_version ? ` → ${task.target_version}` : ''}
          </Text>
        </View>
      )}

      {task?.state === 'success' && (
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.primary, marginTop: 6 }}
        >
          Updated to {task.target_version}.
        </Text>
      )}
      {task?.state === 'failed' && (
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.error, marginTop: 6 }}
        >
          {task.error_message || 'Update failed. Check node logs.'}
        </Text>
      )}
      {error && !task && (
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.error, marginTop: 6 }}
        >
          {error}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
});
