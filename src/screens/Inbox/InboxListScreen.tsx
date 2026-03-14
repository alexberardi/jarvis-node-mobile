import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Button, Card, Chip, Text, useTheme } from 'react-native-paper';

import { InboxItem, listInboxItems } from '../../api/inboxApi';
import { useAuth } from '../../auth/AuthContext';
import { InboxStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<InboxStackParamList>;

const CATEGORY_COLORS: Record<string, string> = {
  deep_research: '#6366f1',
  alert: '#ef4444',
  reminder: '#f59e0b',
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
      const data = await listInboxItems(authState.accessToken);
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

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHrs = diffMs / (1000 * 60 * 60);

    if (diffHrs < 1) return `${Math.round(diffHrs * 60)}m ago`;
    if (diffHrs < 24) return `${Math.round(diffHrs)}h ago`;
    if (diffHrs < 48) return 'Yesterday';
    return date.toLocaleDateString();
  };

  const renderItem = ({ item }: { item: InboxItem }) => (
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
          {item.summary}
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
      <Text
        variant="headlineMedium"
        style={[styles.title, { color: theme.colors.onBackground }]}
      >
        Inbox
      </Text>

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
  container: { flex: 1, paddingTop: 64 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontWeight: 'bold', paddingHorizontal: 16, marginBottom: 12 },
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
  chip: { height: 24 },
  chipText: { fontSize: 10, color: '#fff' },
});

export default InboxListScreen;
