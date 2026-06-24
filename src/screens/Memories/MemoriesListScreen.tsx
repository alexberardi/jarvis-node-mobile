import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SharedValue } from 'react-native-reanimated';
import {
  Appbar,
  Button,
  Card,
  Chip,
  FAB,
  IconButton,
  Text,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';

import {
  deleteMemory,
  listMemories,
  Memory,
} from '../../api/memoriesApi';
import { useAuth } from '../../auth/AuthContext';
import { MemoriesStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<MemoriesStackParamList, 'MemoriesList'>;

const CATEGORY_COLORS: Record<string, string> = {
  preference: '#6366f1',
  fact: '#10b981',
  note: '#f59e0b',
  general: '#64748b',
  agent_context: '#0ea5e9',
};

const MemoriesListScreen = () => {
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const { state: authState } = useAuth();
  const [items, setItems] = useState<Memory[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const householdId = authState.activeHouseholdId;
  const activeRole = useMemo(
    () => authState.households.find((h) => h.id === householdId)?.role ?? 'member',
    [authState.households, householdId],
  );
  const elevated = activeRole === 'admin' || activeRole === 'power_user';

  const load = useCallback(async () => {
    if (!householdId) {
      setItems([]);
      return;
    }
    try {
      setError(null);
      const data = await listMemories(householdId);
      setItems(data);
    } catch {
      setError('Could not load memories');
    }
  }, [householdId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleDelete = useCallback(
    (memory: Memory) => {
      if (!householdId) return;
      Alert.alert(
        'Forget',
        `Delete "${memory.content.slice(0, 60)}${memory.content.length > 60 ? '…' : ''}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteMemory(memory.id, householdId);
                setItems((prev) => prev.filter((m) => m.id !== memory.id));
              } catch {
                Alert.alert('Error', 'Failed to delete');
              }
            },
          },
        ],
      );
    },
    [householdId],
  );

  const { ownItems, householdItems } = useMemo(() => {
    const own: Memory[] = [];
    const hh: Memory[] = [];
    for (const m of items) {
      if (m.user_id === null) hh.push(m);
      else own.push(m);
    }
    return { ownItems: own, householdItems: hh };
  }, [items]);

  const renderCard = (memory: Memory) => {
    const isAgent = memory.source === 'agent' || memory.category === 'agent_context';
    return (
      <Card
        testID={`memory-card-${memory.id}`}
        style={[styles.card, !memory.editable && styles.readOnlyCard]}
        onPress={() =>
          navigation.navigate('MemoryEdit', { memoryId: memory.id })
        }
      >
        <Card.Content>
          <View style={styles.cardHeader}>
            <View style={styles.chipRow}>
              <Chip
                compact
                textStyle={styles.chipText}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      CATEGORY_COLORS[memory.category] ?? theme.colors.secondaryContainer,
                  },
                ]}
              >
                {memory.category.replace(/_/g, ' ')}
              </Chip>
              {memory.is_pinned && (
                <Chip
                  compact
                  icon="pin"
                  textStyle={styles.chipText}
                  style={[styles.chip, { backgroundColor: '#dc2626' }]}
                >
                  pinned
                </Chip>
              )}
              {isAgent && (
                <Chip
                  compact
                  icon="robot"
                  textStyle={styles.chipText}
                  style={[styles.chip, { backgroundColor: '#0ea5e9' }]}
                >
                  agent
                </Chip>
              )}
              {!memory.editable && (
                <Chip
                  compact
                  icon="lock"
                  textStyle={styles.chipText}
                  style={[styles.chip, { backgroundColor: '#64748b' }]}
                >
                  read-only
                </Chip>
              )}
            </View>
          </View>
          <Text variant="bodyMedium" style={styles.content} numberOfLines={3}>
            {memory.content}
          </Text>
        </Card.Content>
      </Card>
    );
  };

  const renderItem = ({ item }: { item: Memory }) => {
    if (!item.editable) {
      return renderCard(item);
    }
    const renderRight =
      (_progress: SharedValue<number>, _drag: SharedValue<number>) => (
        <TouchableRipple
          testID={`memory-delete-${item.id}`}
          style={styles.deleteAction}
          onPress={() => handleDelete(item)}
        >
          <IconButton icon="delete-outline" iconColor="#fff" size={24} />
        </TouchableRipple>
      );
    return (
      <ReanimatedSwipeable renderRightActions={renderRight} overshootRight={false}>
        {renderCard(item)}
      </ReanimatedSwipeable>
    );
  };

  const data = useMemo(() => {
    const sections: Array<{ key: string; type: 'header' | 'item'; memory?: Memory; label?: string }> = [];
    if (ownItems.length > 0) {
      sections.push({ key: 'own-header', type: 'header', label: 'My Memories' });
      for (const m of ownItems) {
        sections.push({ key: `own-${m.id}`, type: 'item', memory: m });
      }
    }
    if (elevated && householdItems.length > 0) {
      sections.push({ key: 'hh-header', type: 'header', label: 'Household' });
      for (const m of householdItems) {
        sections.push({ key: `hh-${m.id}`, type: 'item', memory: m });
      }
    }
    return sections;
  }, [ownItems, householdItems, elevated]);

  const emptyComponent = (
    <View style={styles.center}>
      <Text
        variant="bodyLarge"
        style={{
          color: error ? theme.colors.error : theme.colors.onSurfaceVariant,
        }}
      >
        {error || (householdId ? 'No memories yet — add one!' : 'Select a household first')}
      </Text>
      {error && (
        <Button mode="text" onPress={load} style={{ marginTop: 8 }}>
          Retry
        </Button>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header mode="small">
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Memories" />
      </Appbar.Header>

      <FlatList
        data={data}
        keyExtractor={(s) => s.key}
        renderItem={({ item }) =>
          item.type === 'header' ? (
            <Text variant="titleSmall" style={styles.sectionHeader}>
              {item.label}
            </Text>
          ) : (
            renderItem({ item: item.memory! })
          )
        }
        contentContainerStyle={
          data.length === 0 ? styles.emptyList : styles.list
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={emptyComponent}
      />

      {householdId && (
        <FAB
          testID="memory-add-fab"
          icon="plus"
          style={styles.fab}
          onPress={() => navigation.navigate('MemoryEdit', {})}
          accessibilityLabel="Add memory"
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, gap: 12, paddingBottom: 96 },
  emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sectionHeader: {
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 4,
    opacity: 0.7,
    paddingHorizontal: 4,
  },
  card: { marginBottom: 12 },
  readOnlyCard: { opacity: 0.85 },
  cardHeader: { marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {},
  chipText: { fontSize: 10, lineHeight: 14, color: '#fff' },
  content: { marginTop: 4 },
  deleteAction: {
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderRadius: 12,
    marginLeft: 8,
    marginBottom: 12,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
  },
});

export default MemoriesListScreen;
