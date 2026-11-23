import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, SectionList, StyleSheet, TouchableOpacity, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SharedValue } from 'react-native-reanimated';
import {
  Button,
  Card,
  Checkbox,
  Chip,
  Icon,
  IconButton,
  Menu,
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
import InboxAttachmentThumb from '../../components/inbox/InboxAttachmentThumb';
import { helpCopy } from '../../copy/help';
import { useFirstRun } from '../../hooks/useFirstRun';
import { InboxStackParamList } from '../../navigation/types';
import { parseInboxAttachments } from '../../services/inboxMediaService';
import { CHIP_FILLS } from '../../theme/categoryChip';
import { parseServerDate } from '../../utils/serverTime';

type Nav = NativeStackNavigationProp<InboxStackParamList>;

const CATEGORY_COLORS: Record<string, string> = {
  deep_research: CHIP_FILLS.indigo,
  alert: CHIP_FILLS.red,
  reminder: CHIP_FILLS.amber,
  confirmation: CHIP_FILLS.blue,
  adapter_proposal: CHIP_FILLS.emerald,
  adapter_deployed: CHIP_FILLS.sky,
  adapter_reverted: CHIP_FILLS.slate,
  interactive_list: CHIP_FILLS.violet,
};

const CATEGORY_ICONS: Record<string, string> = {
  deep_research: 'magnify',
  alert: 'alert-outline',
  reminder: 'bell-ring-outline',
  confirmation: 'check-decagram-outline',
  adapter_proposal: 'lightbulb-on-outline',
  adapter_deployed: 'arrow-up-circle-outline',
  adapter_reverted: 'undo-variant',
  interactive_list: 'format-list-checks',
};

const categoryLabel = (category: string) => {
  const s = category.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/**
 * Whether an item still asks for an answer: unread, carrying buttons or a list, and not
 * expired. A guess: the server doesn't record that an action was taken, so opening the
 * item (which marks it read) is what clears it.
 */
export const wantsResponse = (item: InboxItem): boolean => {
  if (item.is_read) return false;
  const m = item.metadata ?? {};
  const expires = m.expires_at ? parseServerDate(m.expires_at) : null;
  if (expires && expires.getTime() <= Date.now()) return false;
  return (
    (Array.isArray(m.actions) && m.actions.length > 0) ||
    (Array.isArray(m.interactive_elements) && m.interactive_elements.length > 0) ||
    item.category === 'adapter_proposal' ||
    item.category === 'interactive_list'
  );
};

type Filter = 'all' | 'unread' | string;

const routeForCategory = (category: string): keyof InboxStackParamList => {
  switch (category) {
    case 'adapter_proposal':
      return 'AdapterProposal';
    case 'adapter_deployed':
      return 'AdapterDeployed';
    case 'interactive_list':
      return 'InteractiveList';
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
  const [filter, setFilter] = useState<Filter>('all');
  const [menuOpen, setMenuOpen] = useState(false);

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
    const date = parseServerDate(iso) ?? new Date(iso);
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
    const kindColor = CATEGORY_COLORS[item.category] ?? theme.colors.primary;
    const firstAttachment = parseInboxAttachments(item)[0];
    return (
      <Card
        testID={`inbox-item-${item.id}`}
        style={[
          styles.card,
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
          } else if (route === 'InteractiveList') {
            navigation.navigate('InteractiveList', { itemId: item.id });
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
                testID={`inbox-checkbox-${item.id}`}
                status={isSelected ? 'checked' : 'unchecked'}
                onPress={() => toggleSelected(item.id)}
              />
            )}
            {!selectMode && (
              <View style={[styles.kindIcon, { backgroundColor: `${kindColor}26` }]}>
                <Icon source={CATEGORY_ICONS[item.category] ?? 'email-outline'} size={20} color={kindColor} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <View style={styles.cardHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6 }}>
                  {!item.is_read && (
                    <View testID={`inbox-unread-${item.id}`} style={[styles.unreadDot, { backgroundColor: theme.colors.primary }]} />
                  )}
                  <Text
                    variant="titleMedium"
                    style={[{ flex: 1 }, !item.is_read && styles.unreadTitle]}
                    numberOfLines={2}
                  >
                    {item.title}
                  </Text>
                </View>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 8 }}>
                  {formatDate(item.created_at)}
                </Text>
              </View>
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
                numberOfLines={2}
              >
                {stripThinkTags(item.summary)}
              </Text>
              {!selectMode && wantsResponse(item) && (
                <Text testID={`inbox-respond-${item.id}`} variant="labelLarge" style={{ color: theme.colors.primary, marginTop: 6 }}>
                  Respond ›
                </Text>
              )}
            </View>
            {firstAttachment && (
              <View style={styles.thumb}>
                <InboxAttachmentThumb
                  attachment={firstAttachment}
                  size={56}
                  testID={`inbox-item-thumb-${item.id}`}
                />
              </View>
            )}
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

  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category))).sort(),
    [items],
  );
  const unreadCount = items.filter((i) => !i.is_read).length;
  const sections = useMemo(() => {
    const shown = items.filter((i) =>
      filter === 'all' ? true : filter === 'unread' ? !i.is_read : i.category === filter,
    );
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const isToday = (i: InboxItem) => (parseServerDate(i.created_at) ?? new Date(i.created_at)) >= startOfToday;
    return [
      { title: 'Today', data: shown.filter(isToday) },
      { title: 'Earlier', data: shown.filter((i) => !isToday(i)) },
    ].filter((sec) => sec.data.length > 0);
  }, [items, filter]);
  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: unreadCount ? `Unread ${unreadCount}` : 'Unread' },
    ...categories.map((c) => ({ key: c, label: categoryLabel(c) })),
  ];

  const emptyComponent = (
    <View style={styles.center}>
      <Text
        variant="bodyLarge"
        style={{
          color: error ? theme.colors.error : theme.colors.onSurfaceVariant,
        }}
      >
        {error || (filter === 'all' ? 'No messages yet' : 'Nothing here')}
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
        {!selectMode && (
          <IconButton testID="inbox-close" icon="close" onPress={() => navigation.getParent()?.goBack()} accessibilityLabel="Close" />
        )}
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
              testID="inbox-select-all"
              compact
              mode="text"
              onPress={toggleSelectAll}
              disabled={items.length === 0}
            >
              {allSelected ? 'Clear' : 'All'}
            </Button>
            <Button testID="inbox-select-cancel" compact mode="text" onPress={exitSelectMode}>
              Cancel
            </Button>
          </View>
        ) : (
          <Menu
            visible={menuOpen}
            onDismiss={() => setMenuOpen(false)}
            anchor={<IconButton testID="inbox-menu" icon="dots-vertical" onPress={() => setMenuOpen(true)} accessibilityLabel="More" />}
          >
            <Menu.Item
              testID="inbox-select"
              leadingIcon="checkbox-multiple-outline"
              title="Select messages"
              disabled={items.length === 0}
              onPress={() => {
                setMenuOpen(false);
                setSelectMode(true);
              }}
            />
            <Menu.Item
              testID="open-suppressed-suggestions"
              leadingIcon="bell-off-outline"
              title="Suppressed suggestions"
              onPress={() => {
                setMenuOpen(false);
                navigation.navigate('SuppressedSuggestions');
              }}
            />
          </Menu>
        )}
      </View>

      <FirstRunCard
        visible={firstRun.visible}
        onDismiss={firstRun.dismiss}
        title={helpCopy.inbox.firstRunTitle}
        body={helpCopy.inbox.firstRun}
      />

      {items.length > 0 && !selectMode && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters} contentContainerStyle={styles.filterRow}>
          {filters.map((f) => (
            <Chip
              key={f.key}
              testID={`inbox-filter-${f.key}`}
              selected={filter === f.key}
              showSelectedOverlay
              onPress={() => setFilter(f.key)}
            >
              {f.label}
            </Chip>
          ))}
        </ScrollView>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <Text variant="labelLarge" style={[styles.sectionHeader, { color: theme.colors.onSurfaceVariant }]}>
            {section.title}
          </Text>
        )}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={sections.length === 0 ? styles.emptyList : styles.list}
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
            testID="inbox-bulk-mark-read"
            mode="text"
            icon="email-open-outline"
            onPress={handleBulkMarkRead}
            disabled={selectedIds.size === 0 || bulkBusy}
            loading={bulkBusy}
          >
            Mark read
          </Button>
          <Button
            testID="inbox-bulk-delete"
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
    paddingLeft: 4,
  },
  // A horizontal ScrollView may shrink by default: a long list squeezed the chips.
  filters: { flexGrow: 0, flexShrink: 0 },
  filterRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 6 },
  sectionHeader: { marginTop: 8, marginBottom: -4, marginLeft: 4 },
  kindIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontWeight: 'bold', flex: 1 },
  titleGroup: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  list: { padding: 16, gap: 12, paddingBottom: 32 },
  emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  card: {},
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  thumb: { marginLeft: 8, alignSelf: 'center' },
  unreadTitle: { fontWeight: '700' },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
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
