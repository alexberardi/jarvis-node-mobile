import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Checkbox,
  IconButton,
  List,
  Text,
  useTheme,
} from 'react-native-paper';

import { listNodes, NodeInfo } from '../../api/nodeApi';
import { useAuth } from '../../auth/AuthContext';
import { RoutinesStackParamList } from '../../navigation/types';
import { pushRoutineToNodes, PushResult } from '../../services/routinePushService';
import { getRoutine } from '../../services/routineStorageService';
import type { Routine } from '../../types/Routine';

type Nav = NativeStackNavigationProp<RoutinesStackParamList>;
type Route = RouteProp<RoutinesStackParamList, 'RoutineNodePicker'>;

const RoutineNodePickerScreen = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const theme = useTheme();
  const { state: authState } = useAuth();

  const [routine, setRoutine] = useState<Routine | null>(null);
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pushing, setPushing] = useState(false);
  const [results, setResults] = useState<PushResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [r, nodeList] = await Promise.all([
          getRoutine(route.params.routineId),
          listNodes(),
        ]);
        if (!mounted) return;
        setRoutine(r ?? null);
        setNodes(nodeList);
      } catch (err) {
        if (!mounted) return;
        console.error('[RoutineNodePickerScreen] Failed to load data', err);
        setError('Could not load data.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [route.params.routineId]);

  const toggleNode = useCallback((nodeId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selected.size === nodes.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(nodes.map((n) => n.node_id)));
    }
  }, [nodes, selected.size]);

  const handlePush = async () => {
    if (!routine || !authState.accessToken || selected.size === 0) return;

    setPushing(true);
    setResults(null);
    try {
      const pushResults = await pushRoutineToNodes(
        routine,
        Array.from(selected),
      );
      setResults(pushResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Push failed');
    } finally {
      setPushing(false);
    }
  };

  const allDone = results !== null;
  const allSuccess = results?.every((r) => r.success) ?? false;

  const renderNode = ({ item }: { item: NodeInfo }) => {
    const result = results?.find((r) => r.nodeId === item.node_id);
    const statusIcon = result
      ? result.success
        ? 'check-circle'
        : 'alert-circle'
      : undefined;
    const statusColor = result
      ? result.success
        ? theme.colors.primary
        : theme.colors.error
      : undefined;

    return (
      <List.Item
        title={item.room || item.node_id}
        description={result?.error || item.node_id}
        left={() => (
          <Checkbox
            status={selected.has(item.node_id) ? 'checked' : 'unchecked'}
            onPress={() => toggleNode(item.node_id)}
            disabled={pushing || allDone}
          />
        )}
        right={
          statusIcon
            ? () => (
                <List.Icon icon={statusIcon} color={statusColor} />
              )
            : undefined
        }
        onPress={() => !pushing && !allDone && toggleNode(item.node_id)}
      />
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
          <Text variant="headlineSmall" style={{ fontWeight: 'bold', flex: 1 }}>
            Push to Nodes
          </Text>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
        <Text variant="headlineSmall" style={{ fontWeight: 'bold', flex: 1 }}>
          Push to Nodes
        </Text>
      </View>

      {routine && (
        <Text
          variant="bodyMedium"
          style={{ paddingHorizontal: 16, marginBottom: 8, color: theme.colors.onSurfaceVariant }}
        >
          Routine: {routine.name}
        </Text>
      )}

      {error && (
        <Text
          variant="bodySmall"
          style={{ paddingHorizontal: 16, color: theme.colors.error, marginBottom: 8 }}
        >
          {error}
        </Text>
      )}

      {nodes.length > 0 && !allDone && (
        <Button mode="text" onPress={toggleAll} style={{ alignSelf: 'flex-start', marginLeft: 8 }}>
          {selected.size === nodes.length ? 'Deselect All' : 'Select All'}
        </Button>
      )}

      <FlatList
        data={nodes}
        keyExtractor={(n) => n.node_id}
        renderItem={renderNode}
        contentContainerStyle={styles.list}
      />

      <View style={styles.actions}>
        {allDone ? (
          <Button
            mode="contained"
            onPress={() => navigation.navigate('RoutineList')}
            style={styles.actionButton}
          >
            {allSuccess ? 'Done' : 'Back to Routines'}
          </Button>
        ) : (
          <>
            <Button
              mode="text"
              onPress={() => navigation.navigate('RoutineList')}
              style={{ flex: 1 }}
            >
              Skip
            </Button>
            <Button
              mode="contained"
              onPress={handlePush}
              disabled={selected.size === 0 || pushing}
              loading={pushing}
              style={[styles.actionButton, { flex: 2 }]}
            >
              Push to {selected.size} Node{selected.size !== 1 ? 's' : ''}
            </Button>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingBottom: 16 },
  actions: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  actionButton: { flex: 1 },
});

export default RoutineNodePickerScreen;
