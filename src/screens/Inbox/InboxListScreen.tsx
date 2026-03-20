import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SharedValue } from 'react-native-reanimated';
import { Button, Card, Chip, IconButton, Text, useTheme } from 'react-native-paper';

import { deleteInboxItem, InboxItem, listInboxItems } from '../../api/inboxApi';
import { useAuth } from '../../auth/AuthContext';
import { InboxStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<InboxStackParamList>;

const CATEGORY_COLORS: Record<string, string> = {
  deep_research: '#6366f1',
  alert: '#ef4444',
  reminder: '#f59e0b',
  confirmation: '#3b82f6',
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

  const renderItem = ({ item }: { item: InboxItem }) => (
    <ReanimatedSwipeable
      renderRightActions={makeRightActions(item)}
      overshootRight={false}
    >
      <Card
        style={[styles.card, !item.is_read && styles.unreadCard]}
        onPress={() => navigation.navigate('InboxDetail', { itemId: item.id })}
      >
        <Card.Content>
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
        </Card.Content>
      </Card>
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
        <Text
          variant="headlineMedium"
          style={[styles.title, { color: theme.colors.onBackground }]}
        >
          Inbox
        </Text>
        <IconButton icon="close" onPress={() => navigation.getParent()?.goBack()} />
      </View>

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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontWeight: 'bold', flex: 1 },
  list: { padding: 16, gap: 12, paddingBottom: 32 },
  emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  card: {},
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
});

export default InboxListScreen;
