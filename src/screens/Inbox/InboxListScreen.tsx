import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SharedValue } from 'react-native-reanimated';
import {
  Button,
  Card,
  Checkbox,
  Chip,
  IconButton,
  Text,
  useTheme,
} from 'react-native-paper';

import {
  bulkDeleteInboxItems,
  bulkMarkItemsRead,
  deleteInboxItem,
  InboxItem,
  listInboxItems,
} from '../../api/inboxApi';
import { useAuth } from '../../auth/AuthContext';
import { FirstRunCard } from '../../components/FirstRunCard';
import { helpCopy } from '../../copy/help';
import { useFirstRun } from '../../hooks/useFirstRun';
import { InboxStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<InboxStackParamList>;

const CATEGORY_COLORS: Record<string, string> = {
  deep_research: '#6366f1',
  alert: '#ef4444',
  reminder: '#f59e0b',
  confirmation: '#3b82f6',
  adapter_proposal: '#10b981',
  adapter_deployed: '#0ea5e9',
  adapter_reverted: '#64748b',
  shopping_list_export: '#f97316',
};

const routeForCategory = (category: string): keyof InboxStackParamList => {
  switch (category) {
    case 'adapter_proposal':
      return 'AdapterProposal';
    case 'adapter_deployed':
      return 'AdapterDeployed';
    case 'shopping_list_export':
      return 'ExportShoppingList';
    default:
      return 'InboxDetail';
  }
};

const stripThinkTags = (text: string): string => {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  cleaned = cleaned.replace(/<think>[\s\S]*/g, '');
  return cleaned.trim();
};

const InboxListScreen = () => {
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const { state: authState } = useAuth();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const firstRun = useFirstRun('inbox');

  const loadItems = useCallback(async () => {
    if (!authState.accessToken) return;
    try {
      setError(null);
      const data = await listInboxItems();
      setItems(data);
    } catch {
      setError('Could not load inbox');
    }
  }, [authState.accessToken]);

  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [loadItems]),
  );

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadItems();
    setRefreshing(false);
  }, [loadItems]);

  const handleDelete = useCallback(
    (item: InboxItem) => {
      Alert.alert(
        'Delete',
        `Remove "${item.title}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteInboxItem(item.id);
                setItems((prev) => prev.filter((i) => i.id !== item.id));
              } catch {
                Alert.alert('Error', 'Failed to delete');
              }
            },
          },
        ],
      );
    },
    [],
  );

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const enterSelectModeWith = useCallback((id: string) => {
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  }, []);

  const allSelected = useMemo(
    () => items.length > 0 && selectedIds.size === items.length,
    [items.length, selectedIds.size],
  );

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  }, [allSelected, items]);

  const handleBulkMarkRead = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      await bulkMarkItemsRead(ids);
      setItems((prev) =>
        prev.map((i) => (selectedIds.has(i.id) ? { ...i, is_read: true } : i)),
      );
      exitSelectMode();
    } catch {
      Alert.alert('Error', 'Failed to mark as read');
    } finally {
      setBulkBusy(false);
    }
  }, [selectedIds, exitSelectMode]);

  const handleBulkDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    Alert.alert(
      'Delete',
      `Remove ${ids.length} message${ids.length === 1 ? '' : 's'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBulkBusy(true);
            try {
              await bulkDeleteInboxItems(ids);
              setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
              exitSelectMode();
            } catch {
              Alert.alert('Error', 'Failed to delete');
            } finally {
              setBulkBusy(false);
            }
          },
        },
      ],
    );
  }, [selectedIds, exitSelectMode]);

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.abs(Math.round(diffMs / (1000 * 60)));
    const diffHrs = Math.abs(diffMs / (1000 * 60 * 60));

    if (diffHrs < 1) return `${diffMins}m ago`;
    if (diffHrs < 24) return `${Math.round(diffHrs)}h ago`;
    if (diffHrs < 48) return 'Yesterday';
    return date.toLocaleDateString();
  };

  const renderRightActions = (item: InboxItem) => () => (
    <TouchableOpacity style={styles.deleteAction} onPress={() => handleDelete(item)} activeOpacity={0.7}>
      <IconButton icon="delete-outline" iconColor="#fff" size={24} />
    </TouchableOpacity>
  );

  // Wrap to match ReanimatedSwipeable's renderRightActions signature
  const makeRightActions = (item: InboxItem) =>
    (_progress: SharedValue<number>, _drag: SharedValue<number>) =>
      renderRightActions(item)();

  const renderCard = (item: InboxItem) => {
    const isSelected = selectedIds.has(item.id);
    return (
      <Card
        style={[
          styles.card,
          !item.is_read && styles.unreadCard,
          selectMode && isSelected && {
            backgroundColor: theme.colors.secondaryContainer,
          },
        ]}
        onPress={() => {
          if (selectMode) {
            toggleSelected(item.id);
            return;
          }
          const route = routeForCategory(item.category);
          if (route === 'InboxDetail') {
            navigation.navigate('InboxDetail', { itemId: item.id });
          } else if (route === 'AdapterProposal') {
            navigation.navigate('AdapterProposal', { itemId: item.id });
          } else if (route === 'AdapterDeployed') {
            navigation.navigate('AdapterDeployed', { itemId: item.id });
          } else if (route === 'ExportShoppingList') {
            navigation.navigate('ExportShoppingList', { itemId: item.id });
          }
        }}
        onLongPress={() => {
          if (!selectMode) enterSelectModeWith(item.id);
        }}
      >
        <Card.Content>
          <View style={styles.cardRow}>
            {selectMode && (
              <Checkbox
                status={isSelected ? 'checked' : 'unchecked'}
                onPress={() => toggleSelected(item.id)}
              />
            )}
            <View style={{ flex: 1 }}>
              <View style={styles.cardHeader}>
                <Chip
                  compact
                  textStyle={styles.chipText}
                  style={[
                    styles.chip,
                    { backgroundColor: CATEGORY_COLORS[item.category] ?? theme.colors.secondaryContainer },
                  ]}
                >
                  {item.category.replace(/_/g, ' ')}
                </Chip>
                <Text
                  variant="labelSmall"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  {formatDate(item.created_at)}
                </Text>
              </View>
              <Text
                variant="titleMedium"
                style={[!item.is_read && styles.unreadTitle]}
                numberOfLines={2}
              >
                {item.title}
              </Text>
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
                numberOfLines={2}
              >
                {stripThinkTags(item.summary)}
              </Text>
            </View>
          </View>
        </Card.Content>
      </Card>
    );
  };

  const renderItem = ({ item }: { item: InboxItem }) =>
    selectMode ? (
      renderCard(item)
    ) : (
      <ReanimatedSwipeable
        renderRightActions={makeRightActions(item)}
        overshootRight={false}
      >
        {renderCard(item)}
      </ReanimatedSwipeable>
    );

  const emptyComponent = (
    <View style={styles.center}>
      <Text
        variant="bodyLarge"
        style={{
          color: error ? theme.colors.error : theme.colors.onSurfaceVariant,
        }}
      >
        {error || 'No messages yet'}
      </Text>
      {error && (
        <Button mode="text" onPress={loadItems} style={{ marginTop: 8 }}>
          Retry
        </Button>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text
            variant="headlineMedium"
            style={[styles.title, { color: theme.colors.onBackground, flex: 0 }]}
          >
            {selectMode
              ? selectedIds.size === 0
                ? 'Select items'
                : `${selectedIds.size} selected`
              : 'Inbox'}
          </Text>
          {!selectMode && (
            <IconButton
              icon="help-circle-outline"
              size={20}
              onPress={firstRun.showAgain}
              accessibilityLabel="What is the inbox?"
              style={{ margin: 0 }}
            />
          )}
        </View>
        {selectMode ? (
          <View style={styles.headerActions}>
            <Button
              compact
              mode="text"
              onPress={toggleSelectAll}
              disabled={items.length === 0}
            >
              {allSelected ? 'Clear' : 'All'}
            </Button>
            <Button compact mode="text" onPress={exitSelectMode}>
              Cancel
            </Button>
          </View>
        ) : (
          <View style={styles.headerActions}>
            <IconButton
              icon="checkbox-multiple-outline"
              onPress={() => setSelectMode(true)}
              accessibilityLabel="Select messages"
              disabled={items.length === 0}
            />
            <IconButton icon="close" onPress={() => navigation.getParent()?.goBack()} />
          </View>
        )}
      </View>

      <FirstRunCard
        visible={firstRun.visible}
        onDismiss={firstRun.dismiss}
        title={helpCopy.inbox.firstRunTitle}
        body={helpCopy.inbox.firstRun}
      />

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={
          items.length === 0 ? styles.emptyList : styles.list
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={emptyComponent}
      />

      {selectMode && (
        <View
          style={[
            styles.actionBar,
            {
              backgroundColor: theme.colors.elevation.level2,
              borderTopColor: theme.colors.outlineVariant,
            },
          ]}
        >
          <Button
            mode="text"
            icon="email-open-outline"
            onPress={handleBulkMarkRead}
            disabled={selectedIds.size === 0 || bulkBusy}
            loading={bulkBusy}
          >
            Mark read
          </Button>
          <Button
            mode="text"
            icon="delete-outline"
            textColor={theme.colors.error}
            onPress={handleBulkDelete}
            disabled={selectedIds.size === 0 || bulkBusy}
          >
            Delete
          </Button>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingLeft: 16,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontWeight: 'bold', flex: 1 },
  titleGroup: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  list: { padding: 16, gap: 12, paddingBottom: 32 },
  emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  card: {},
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  unreadCard: { borderLeftWidth: 3, borderLeftColor: '#6366f1' },
  unreadTitle: { fontWeight: '700' },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  chip: {},
  chipText: { fontSize: 10, lineHeight: 14, color: '#fff' },
  deleteAction: {
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderRadius: 12,
    marginLeft: 8,
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

export default InboxListScreen;
