/**
 * Data Browser home: node picker (when >1 node visible) + list of
 * commands on the selected node.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Card,
  Chip,
  Divider,
  List,
  Text,
  useTheme,
} from 'react-native-paper';

import {
  CommandSummary,
  NodeSummary,
  listCommands,
  listNodes,
} from '../../api/commandDataApi';
import type { CommandDataStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<CommandDataStackParamList, 'DataBrowserHome'>;
type Route = RouteProp<CommandDataStackParamList, 'DataBrowserHome'>;

const DataBrowserHomeScreen = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const theme = useTheme();

  // When entering from a node-scoped surface (NodeSettings options menu),
  // skip the picker and pin to the supplied node.
  const pinnedNodeId = route.params?.nodeId ?? null;

  const [nodes, setNodes] = useState<NodeSummary[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(pinnedNodeId);
  const [commands, setCommands] = useState<CommandSummary[]>([]);
  const [loadingNodes, setLoadingNodes] = useState(!pinnedNodeId);
  const [loadingCommands, setLoadingCommands] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pinnedNodeId) return;  // Skip node enumeration when pinned.
    let mounted = true;
    listNodes()
      .then((ns) => {
        if (!mounted) return;
        setNodes(ns);
        // Auto-select when there's only one node.
        if (ns.length === 1) {
          setSelectedNodeId(ns[0].node_id);
        }
      })
      .catch((err) => {
        if (!mounted) return;
        console.error('[DataBrowserHome] listNodes failed', err);
        setError('Could not load nodes.');
      })
      .finally(() => {
        if (mounted) setLoadingNodes(false);
      });
    return () => {
      mounted = false;
    };
  }, [pinnedNodeId]);

  useEffect(() => {
    if (!selectedNodeId) {
      setCommands([]);
      return;
    }
    let mounted = true;
    setLoadingCommands(true);
    setError(null);
    listCommands(selectedNodeId)
      .then((cmds) => {
        if (!mounted) return;
        setCommands(cmds);
      })
      .catch((err) => {
        if (!mounted) return;
        console.error('[DataBrowserHome] listCommands failed', err);
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 504) {
          setError('Node did not respond. It may be offline.');
        } else {
          setError('Could not load commands.');
        }
      })
      .finally(() => {
        if (mounted) setLoadingCommands(false);
      });
    return () => {
      mounted = false;
    };
  }, [selectedNodeId]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Stored Data" />
      </Appbar.Header>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Node picker (hidden when entered from a node-scoped surface) */}
        {pinnedNodeId ? null : loadingNodes ? (
          <ActivityIndicator style={styles.spinner} />
        ) : nodes.length === 0 ? (
          <Text style={styles.empty}>No nodes available.</Text>
        ) : nodes.length === 1 ? (
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {nodes[0].room || nodes[0].node_id}
          </Text>
        ) : (
          <Card style={styles.section}>
            <Card.Title title="Node" />
            <Card.Content>
              <View style={styles.chipRow}>
                {nodes.map((n) => (
                  <Chip
                    key={n.node_id}
                    selected={selectedNodeId === n.node_id}
                    onPress={() => setSelectedNodeId(n.node_id)}
                    style={styles.chip}
                  >
                    {n.room || n.node_id}
                  </Chip>
                ))}
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Commands list */}
        {error && (
          <Text style={[styles.error, { color: theme.colors.error }]}>{error}</Text>
        )}
        {selectedNodeId && (
          <Card style={styles.section}>
            <Card.Title title="Commands" />
            <Card.Content>
              {loadingCommands ? (
                <ActivityIndicator />
              ) : commands.length === 0 ? (
                <Text style={{ color: theme.colors.onSurfaceVariant }}>
                  Nothing stored on this node yet.
                </Text>
              ) : (
                commands.map((cmd, idx) => (
                  <React.Fragment key={cmd.command_name}>
                    {idx > 0 && <Divider />}
                    <List.Item
                      title={cmd.command_name}
                      description={cmd.mode === 'readonly' ? 'Read-only' : undefined}
                      right={(props) => <List.Icon {...props} icon="chevron-right" />}
                      onPress={() =>
                        navigation.navigate('DataBrowserRecords', {
                          nodeId: selectedNodeId,
                          commandName: cmd.command_name,
                        })
                      }
                    />
                  </React.Fragment>
                ))
              )}
            </Card.Content>
          </Card>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16 },
  section: { marginBottom: 16 },
  spinner: { marginTop: 24 },
  empty: { marginTop: 24, textAlign: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { marginRight: 4 },
  error: { marginBottom: 12 },
});

export default DataBrowserHomeScreen;
