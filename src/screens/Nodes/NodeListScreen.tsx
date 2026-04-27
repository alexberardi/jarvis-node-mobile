import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  FAB,
  Text,
  useTheme,
} from 'react-native-paper';

import { listNodes, NodeInfo } from '../../api/nodeApi';
import { useAuth } from '../../auth/AuthContext';
import { NodesStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<NodesStackParamList>;

const NodeListScreen = () => {
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const { state: authState } = useAuth();
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNodes = useCallback(async () => {
    try {
      setError(null);
      const data = await listNodes(authState.activeHouseholdId ?? undefined);
      setNodes(data);
    } catch {
      setError('Could not load nodes');
    }
  }, [authState.activeHouseholdId]);

  // Reload every time this screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadNodes();
    }, [loadNodes]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNodes();
    setRefreshing(false);
  }, [loadNodes]);

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

  const renderNode = ({ item }: { item: NodeInfo }) => (
    <Card
      style={styles.card}
      onPress={() =>
        navigation.navigate('NodeDetail', {
          nodeId: item.node_id,
        })
      }
    >
      <Card.Content>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{
            width: 10, height: 10, borderRadius: 5,
            backgroundColor: item.online ? '#4CAF50' : theme.colors.outline,
          }} />
          <Text variant="titleMedium">{item.room || item.node_id}</Text>
        </View>
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
        >
          {item.online ? 'Online' : `Offline \u00B7 Last seen ${formatLastSeen(item.last_seen)}`}
        </Text>
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          Mode: {item.voice_mode}
        </Text>
      </Card.Content>
    </Card>
  );

  const emptyComponent = (
    <View style={styles.center}>
      <Text
        variant="bodyLarge"
        style={{
          color: error ? theme.colors.error : theme.colors.onSurfaceVariant,
        }}
      >
        {error || 'No nodes yet. Add your first node.'}
      </Text>
      {error && (
        <Button mode="text" onPress={loadNodes} style={{ marginTop: 8 }}>
          Retry
        </Button>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text
          variant="headlineMedium"
          style={[styles.title, { color: theme.colors.onBackground }]}
        >
          Nodes
        </Text>
        <Button
          icon="key-plus"
          mode="text"
          compact
          onPress={() => navigation.navigate('ImportKey')}
        >
          Import Key
        </Button>
      </View>

      <FlatList
        data={nodes}
        keyExtractor={(n) => n.node_id}
        renderItem={renderNode}
        contentContainerStyle={
          nodes.length === 0 ? styles.emptyList : styles.list
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={emptyComponent}
      />

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        color={theme.colors.onPrimary}
        onPress={() => navigation.navigate('AddNode')}
        label="Add Node"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 64 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: 8,
  },
  title: { fontWeight: 'bold', paddingHorizontal: 16, marginBottom: 12 },
  list: { padding: 16, gap: 12, paddingBottom: 96 },
  emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  card: {},
  fab: { position: 'absolute', right: 16, bottom: 24 },
});

export default NodeListScreen;
