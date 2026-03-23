import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Divider,
  IconButton,
  List,
  Snackbar,
  Text,
  useTheme,
} from 'react-native-paper';

import { getNode, NodeInfo } from '../../api/nodeApi';
import { NodesStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<NodesStackParamList>;
type Route = RouteProp<NodesStackParamList, 'NodeDetail'>;

const formatUptime = (seconds: number | null): string => {
  if (seconds == null) return 'N/A';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
};

const formatLastSeen = (lastSeen: string | null): string => {
  if (!lastSeen) return 'Never';
  const date = new Date(lastSeen);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
};

const NodeDetailScreen = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const theme = useTheme();
  const { nodeId } = route.params;

  const [node, setNode] = useState<NodeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadNode = useCallback(async () => {
    try {
      setError(null);
      const data = await getNode(nodeId);
      setNode(data);
    } catch {
      setError('Could not load node details');
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  useEffect(() => {
    loadNode();
  }, [loadNode]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNode();
    setRefreshing(false);
  }, [loadNode]);

  const handleCopyId = async () => {
    await Clipboard.setStringAsync(nodeId);
    setCopied(true);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error && !node) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text variant="bodyLarge" style={{ color: theme.colors.error }}>
          {error}
        </Text>
        <Button mode="text" onPress={loadNode} style={{ marginTop: 8 }}>
          Retry
        </Button>
      </View>
    );
  }

  if (!node) return null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.outlineVariant }]}>
        <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
        <Text variant="headlineSmall" style={{ fontWeight: 'bold', flex: 1 }}>
          {node.room || 'Node'}
        </Text>
        <IconButton
          icon="cog-outline"
          onPress={() => navigation.navigate('NodeSettings', { nodeId, room: node.room })}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Status card */}
        <View style={[styles.statusCard, { backgroundColor: node.online ? '#22c55e18' : `${theme.colors.error}18` }]}>
          <View style={styles.statusRow}>
            <View style={[
              styles.statusDot,
              { backgroundColor: node.online ? '#22c55e' : theme.colors.error },
            ]} />
            <Text variant="titleMedium" style={{ fontWeight: '600' }}>
              {node.online ? 'Online' : 'Offline'}
            </Text>
          </View>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
            Last seen {formatLastSeen(node.last_seen)}
          </Text>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
              {formatUptime(node.uptime_seconds)}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Uptime</Text>
          </View>
          <View style={styles.statBox}>
            <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
              {node.command_count ?? '--'}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Commands</Text>
          </View>
          <View style={styles.statBox}>
            <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
              {node.routine_count ?? '--'}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Routines</Text>
          </View>
        </View>

        <Divider style={{ marginVertical: 8 }} />

        {/* Detail rows */}
        <List.Item
          title="Voice Mode"
          description={node.voice_mode || 'brief'}
          left={(props) => <List.Icon {...props} icon="microphone" />}
        />
        {node.platform && (
          <List.Item
            title="Platform"
            description={node.platform}
            left={(props) => <List.Icon {...props} icon="chip" />}
          />
        )}
        {node.python_version && (
          <List.Item
            title="Python"
            description={node.python_version}
            left={(props) => <List.Icon {...props} icon="language-python" />}
          />
        )}
        {node.adapter_hash && (
          <List.Item
            title="Adapter"
            description={node.adapter_hash}
            left={(props) => <List.Icon {...props} icon="tune" />}
          />
        )}
        <List.Item
          title="Node ID"
          description={nodeId}
          descriptionNumberOfLines={1}
          left={(props) => <List.Icon {...props} icon="identifier" />}
          right={() => (
            <IconButton icon="content-copy" size={18} onPress={handleCopyId} />
          )}
        />
      </ScrollView>

      <Snackbar
        visible={copied}
        onDismiss={() => setCopied(false)}
        duration={2000}
      >
        Node ID copied
      </Snackbar>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48 },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scroll: { paddingBottom: 32 },
  statusCard: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
});

export default NodeDetailScreen;
