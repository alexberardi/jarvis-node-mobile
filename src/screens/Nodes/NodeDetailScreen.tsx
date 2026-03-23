import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Divider,
  Icon,
  IconButton,
  List,
  SegmentedButtons,
  Snackbar,
  Text,
  useTheme,
} from 'react-native-paper';

import { fetchNodeTools } from '../../api/chatApi';
import { getNode, NodeInfo } from '../../api/nodeApi';
import {
  fetchRoutineHistory,
  RoutineExecution,
} from '../../api/routineHistoryApi';
import { NodesStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<NodesStackParamList>;
type Route = RouteProp<NodesStackParamList, 'NodeDetail'>;
type Tab = 'overview' | 'packages' | 'activity';

// =============================================================================
// Helpers
// =============================================================================

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

const formatTimestamp = (iso: string): string => {
  const date = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (diffDays === 0) return `Today ${time}`;
  if (diffDays === 1) return `Yesterday ${time}`;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
};

interface CommandInfo {
  name: string;
  description: string;
}

// =============================================================================
// Overview Tab
// =============================================================================

const OverviewTab = ({
  node,
  nodeId,
  onCopyId,
}: {
  node: NodeInfo;
  nodeId: string;
  onCopyId: () => void;
}) => {
  const theme = useTheme();

  return (
    <>
      {/* Status card */}
      <View style={[styles.statusCard, { backgroundColor: node.online ? '#22c55e18' : `${theme.colors.error}18` }]}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: node.online ? '#22c55e' : theme.colors.error }]} />
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
        right={() => <IconButton icon="content-copy" size={18} onPress={onCopyId} />}
      />
    </>
  );
};

// =============================================================================
// Packages Tab
// =============================================================================

const PackagesTab = ({ nodeId }: { nodeId: string }) => {
  const theme = useTheme();
  const [commands, setCommands] = useState<CommandInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const tools = await fetchNodeTools(nodeId);
      const cmds: CommandInfo[] = tools.client_tools
        .map((t: Record<string, unknown>) => {
          const fn = t.function as Record<string, unknown> | undefined;
          return {
            name: (fn?.name as string) || '',
            description: (fn?.description as string) || '',
          };
        })
        .filter((c) => c.name)
        .sort((a, b) => a.name.localeCompare(b.name));
      setCommands(cmds);
    } catch {
      setError('Could not load commands. Node may be offline.');
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <View style={styles.tabCenter}><ActivityIndicator size="large" /></View>;
  }

  if (error) {
    return (
      <View style={styles.tabCenter}>
        <Text variant="bodyMedium" style={{ color: theme.colors.error, marginBottom: 12 }}>{error}</Text>
        <Button mode="outlined" onPress={load}>Retry</Button>
      </View>
    );
  }

  if (commands.length === 0) {
    return (
      <View style={styles.tabCenter}>
        <Icon source="package-variant" size={48} color={theme.colors.outlineVariant} />
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}>
          No commands installed
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={commands}
      keyExtractor={(c) => c.name}
      contentContainerStyle={{ paddingVertical: 8 }}
      renderItem={({ item }) => (
        <List.Item
          title={item.name}
          description={item.description}
          descriptionNumberOfLines={2}
          left={(props) => <List.Icon {...props} icon="puzzle" />}
        />
      )}
    />
  );
};

// =============================================================================
// Activity Tab
// =============================================================================

const STATUS_ICON: Record<string, { icon: string; color: string }> = {
  success: { icon: 'check-circle', color: '#22c55e' },
  partial: { icon: 'alert-circle', color: '#f59e0b' },
  failure: { icon: 'close-circle', color: '#ef4444' },
};

const ActivityTab = ({ nodeId }: { nodeId: string }) => {
  const theme = useTheme();
  const [executions, setExecutions] = useState<RoutineExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Fetch recent executions for this node (all routines)
      const data = await fetchRoutineHistory('', { limit: 30, offset: 0 });
      // Filter client-side by node_id until the API supports node filtering
      setExecutions(data.executions.filter((e) => e.node_id === nodeId));
    } catch {
      // API may not exist yet — show empty state rather than error
      setExecutions([]);
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <View style={styles.tabCenter}><ActivityIndicator size="large" /></View>;
  }

  if (error) {
    return (
      <View style={styles.tabCenter}>
        <Text variant="bodyMedium" style={{ color: theme.colors.error, marginBottom: 12 }}>{error}</Text>
        <Button mode="outlined" onPress={load}>Retry</Button>
      </View>
    );
  }

  if (executions.length === 0) {
    return (
      <View style={styles.tabCenter}>
        <Icon source="history" size={48} color={theme.colors.outlineVariant} />
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 12, textAlign: 'center' }}>
          No activity yet.{'\n'}Routine executions will appear here.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={executions}
      keyExtractor={(e) => e.id}
      contentContainerStyle={{ padding: 12, gap: 8 }}
      renderItem={({ item }) => {
        const cfg = STATUS_ICON[item.status] || STATUS_ICON.failure;
        return (
          <Card style={styles.activityCard}>
            <Card.Content style={styles.activityRow}>
              <Icon source={cfg.icon} size={22} color={cfg.color} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text variant="bodyMedium" style={{ fontWeight: '500' }}>
                  {item.routine_name}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {formatTimestamp(item.executed_at)}
                  {item.duration_ms != null ? ` \u00B7 ${item.duration_ms < 1000 ? `${item.duration_ms}ms` : `${(item.duration_ms / 1000).toFixed(1)}s`}` : ''}
                </Text>
              </View>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {item.steps_passed}/{item.step_count}
              </Text>
            </Card.Content>
          </Card>
        );
      }}
    />
  );
};

// =============================================================================
// Main Screen
// =============================================================================

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
  const [tab, setTab] = useState<Tab>('overview');

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
        <Text variant="bodyLarge" style={{ color: theme.colors.error }}>{error}</Text>
        <Button mode="text" onPress={loadNode} style={{ marginTop: 8 }}>Retry</Button>
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

      {/* Tab selector */}
      <View style={styles.tabBar}>
        <SegmentedButtons
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          density="small"
          buttons={[
            { value: 'overview', label: 'Overview' },
            { value: 'packages', label: 'Packages' },
            { value: 'activity', label: 'Activity' },
          ]}
        />
      </View>

      {/* Tab content */}
      {tab === 'overview' && (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <OverviewTab node={node} nodeId={nodeId} onCopyId={handleCopyId} />
        </ScrollView>
      )}

      {tab === 'packages' && <PackagesTab nodeId={nodeId} />}

      {tab === 'activity' && <ActivityTab nodeId={nodeId} />}

      <Snackbar visible={copied} onDismiss={() => setCopied(false)} duration={2000}>
        Node ID copied
      </Snackbar>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tabCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
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
  activityCard: {},
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export default NodeDetailScreen;
