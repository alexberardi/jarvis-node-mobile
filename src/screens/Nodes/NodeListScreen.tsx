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
import { formatLastSeen } from '../../utils/serverTime';
import { isDesktopAgent, nodeDisplayName } from '../../utils/nodeKind';
import { NodeKindIcon } from '../../components/NodeKindIcon';
import { FAB_OFFSET, FAB_SIZE, fabListPaddingBottom } from '../../theme/fab';

const FAB_ROW_GAP = 12;

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

  const renderNode = ({ item }: { item: NodeInfo }) => (
    <Card
      testID={`node-card-${item.node_id}`}
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
          <NodeKindIcon node={item} size={20} testID={`node-kind-icon-${item.node_id}`} />
          <Text variant="titleMedium">{nodeDisplayName(item, item.node_id)}</Text>
        </View>
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
        >
          {item.online ? 'Online' : `Offline \u00B7 Last seen ${formatLastSeen(item.last_seen, false)}`}
        </Text>
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          {isDesktopAgent(item) ? 'Jarvis Automation agent' : `Mode: ${item.voice_mode}`}
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
          testID="node-import-key-button"
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

      {/* Two ways in: a Raspberry Pi (QR/Wi-Fi provisioning) or a computer running the
          Jarvis Automation agent (code pairing). They wrap onto two lines at large font sizes. */}
      <View style={styles.fabRow} pointerEvents="box-none">
        <FAB
          testID="node-add-computer-fab"
          icon="laptop"
          mode="flat"
          style={{ backgroundColor: theme.colors.secondaryContainer }}
          color={theme.colors.onSecondaryContainer}
          onPress={() => navigation.navigate('AddComputer')}
          label="Add a computer"
        />
        <FAB
          testID="node-add-fab"
          icon="plus"
          style={{ backgroundColor: theme.colors.primary }}
          color={theme.colors.onPrimary}
          onPress={() => navigation.navigate('AddNode')}
          label="Add Node"
        />
      </View>
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
  // Room for the two FABs even when a large font wraps them onto two rows.
  list: { padding: 16, gap: 12, paddingBottom: fabListPaddingBottom + FAB_SIZE + FAB_ROW_GAP },
  emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  card: {},
  fabRow: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: FAB_OFFSET,
    flexDirection: 'row',
    flexWrap: 'wrap-reverse',
    justifyContent: 'flex-end',
    gap: FAB_ROW_GAP,
  },
});

export default NodeListScreen;
