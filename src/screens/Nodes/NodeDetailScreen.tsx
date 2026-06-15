import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
  Modal,
  Portal,
  SegmentedButtons,
  Surface,
  Text,
  useTheme,
} from 'react-native-paper';

import { fetchNodeTools } from '../../api/chatApi';
import { deleteNode, getNode, NodeInfo } from '../../api/nodeApi';
import { NodeUpdateSection } from '../../components/NodeUpdateSection';
import { helpCopy } from '../../copy/help';
import { HardwareTab } from './HardwareTab';
import { NodesStackParamList } from '../../navigation/types';
import { deleteK2, hasK2 } from '../../services/k2Service';

type Nav = NativeStackNavigationProp<NodesStackParamList>;
type Route = RouteProp<NodesStackParamList, 'NodeDetail'>;
type Tab = 'overview' | 'hardware' | 'packages' | 'activity';

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

type DeleteStep =
  | { kind: 'closed' }
  | { kind: 'confirm' }
  | { kind: 'running' }
  | { kind: 'error'; message: string };

const OverviewTab = ({
  node,
  canDelete,
}: {
  node: NodeInfo;
  canDelete: boolean;
}) => {
  const theme = useTheme();
  const navigation = useNavigation<Nav>();
  const [deleteStep, setDeleteStep] = useState<DeleteStep>({ kind: 'closed' });

  const handleDelete = useCallback(async () => {
    setDeleteStep({ kind: 'running' });
    try {
      await deleteNode(node.node_id);
      // Best-effort local K2 cleanup — failure here doesn't block navigation.
      try {
        await deleteK2(node.node_id);
      } catch {}
      setDeleteStep({ kind: 'closed' });
      navigation.navigate('NodeList');
    } catch (err) {
      setDeleteStep({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Failed to delete node',
      });
    }
  }, [node.node_id, navigation]);

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

      <NodeUpdateSection node={node} />

      {canDelete && (
        <>
          <View style={styles.dangerHeader}>
            <Text variant="titleSmall" style={{ color: theme.colors.error, fontWeight: '600' }}>
              Danger Zone
            </Text>
          </View>
          <Surface style={[styles.dangerCard, { borderColor: theme.colors.error }]} elevation={0}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
              Deletes this node from your household. If it's still online,
              it'll be wiped and rebooted into provisioning mode. Safe to use
              even if the node has already been reset or reflashed.
            </Text>
            <Button
              mode="outlined"
              icon="delete-alert-outline"
              textColor={theme.colors.error}
              style={{ borderColor: theme.colors.error }}
              onPress={() => setDeleteStep({ kind: 'confirm' })}
            >
              Delete Node
            </Button>
          </Surface>
        </>
      )}

      <Portal>
        <Modal
          visible={deleteStep.kind !== 'closed'}
          onDismiss={() => {
            // Block dismiss while the request is in flight.
            if (deleteStep.kind !== 'running') {
              setDeleteStep({ kind: 'closed' });
            }
          }}
          contentContainerStyle={[styles.modalCard, { backgroundColor: theme.colors.surface }]}
        >
          {deleteStep.kind === 'confirm' && (
            <>
              <Text variant="titleLarge" style={{ fontWeight: '600', marginBottom: 8, color: theme.colors.error }}>
                Delete {node.room ?? 'Node'}?
              </Text>
              <Text variant="bodyMedium" style={{ marginBottom: 16 }}>
                This removes the node from your household and revokes its
                credentials. If the node is online, it will also be wiped and
                rebooted into provisioning mode.
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 24 }}>
                This action cannot be undone.
              </Text>
              <View style={styles.modalActions}>
                <Button onPress={() => setDeleteStep({ kind: 'closed' })}>Cancel</Button>
                <Button
                  mode="contained"
                  buttonColor={theme.colors.error}
                  textColor={theme.colors.onError}
                  onPress={handleDelete}
                >
                  Delete
                </Button>
              </View>
            </>
          )}

          {deleteStep.kind === 'running' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <ActivityIndicator />
              <Text variant="bodyMedium">Deleting node…</Text>
            </View>
          )}

          {deleteStep.kind === 'error' && (
            <>
              <Text variant="titleLarge" style={{ fontWeight: '600', marginBottom: 12, color: theme.colors.error }}>
                Delete failed
              </Text>
              <Text variant="bodyMedium" style={{ marginBottom: 24 }}>
                {deleteStep.message}
              </Text>
              <View style={styles.modalActions}>
                <Button onPress={() => setDeleteStep({ kind: 'closed' })}>Close</Button>
              </View>
            </>
          )}
        </Modal>
      </Portal>
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
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4, textAlign: 'center', paddingHorizontal: 24 }}>
          {helpCopy.nodeDetail.packagesEmpty}
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

const ActivityTab = (_props: { nodeId: string }) => {
  const theme = useTheme();
  return (
    <View style={styles.tabCenter}>
      <Icon source="history" size={48} color={theme.colors.outlineVariant} />
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 12, textAlign: 'center' }}>
        No activity yet
      </Text>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4, textAlign: 'center', paddingHorizontal: 24 }}>
        {helpCopy.nodeDetail.activityTab}
      </Text>
    </View>
  );
};
// =============================================================================
// Main Screen
// =============================================================================

const NodeDetailScreen = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const theme = useTheme();
  const { nodeId, initialTab } = route.params;

  const [node, setNode] = useState<NodeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab || 'overview');
  // null = checking, true = key on this device, false = no key
  // (node was set up on another device — hide the settings gear).
  const [hasSettingsAccess, setHasSettingsAccess] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    hasK2(nodeId).then((result) => {
      if (mounted) setHasSettingsAccess(result);
    });
    return () => {
      mounted = false;
    };
  }, [nodeId]);

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
        {(hasSettingsAccess || node.needs_k2) && (
          <IconButton
            icon="cog-outline"
            onPress={() => navigation.navigate('NodeSettings', { nodeId, room: node.room })}
          />
        )}
      </View>

      {/* Tab selector */}
      <View style={styles.tabBar}>
        <SegmentedButtons
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          density="small"
          buttons={[
            { value: 'overview', label: 'Overview' },
            ...(node.install_mode !== 'docker'
              ? [{ value: 'hardware', label: 'Hardware' }]
              : []),
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
          <OverviewTab node={node} canDelete={hasSettingsAccess === true} />
        </ScrollView>
      )}

      {tab === 'hardware' && <HardwareTab nodeId={nodeId} node={node} />}

      {tab === 'packages' && <PackagesTab nodeId={nodeId} />}

      {tab === 'activity' && <ActivityTab nodeId={nodeId} />}

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
  dangerHeader: {
    marginTop: 32,
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  dangerCard: {
    marginHorizontal: 16,
    marginBottom: 24,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  modalCard: {
    margin: 20,
    borderRadius: 16,
    padding: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
});

export default NodeDetailScreen;
