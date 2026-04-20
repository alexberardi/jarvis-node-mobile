import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Card, IconButton, Text, useTheme } from 'react-native-paper';

import { listRecentTranscripts, rateTranscript, Rating, Transcript } from '../../api/transcriptsApi';
import { useAuth } from '../../auth/AuthContext';
import { RecentCommandsStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RecentCommandsStackParamList>;

const formatRelative = (iso: string): string => {
  const now = Date.now();
  const ts = new Date(iso).getTime();
  const diffMin = Math.round((now - ts) / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
};

const summarizeToolCall = (item: Transcript): string => {
  if (!item.tool_calls || item.tool_calls.length === 0) return 'no tool call';
  const first = item.tool_calls[0];
  const name = String(first?.name ?? 'tool');
  const args = first?.arguments ?? {};
  const argSummary = Object.keys(args)
    .slice(0, 3)
    .map((k) => `${k}=${String((args as Record<string, unknown>)[k]).slice(0, 20)}`)
    .join(', ');
  return argSummary ? `${name}(${argSummary})` : name;
};

const RecentCommandsListScreen = () => {
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const { state: authState } = useAuth();
  const [items, setItems] = useState<Transcript[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratingInFlight, setRatingInFlight] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    if (!authState.accessToken) return;
    try {
      setError(null);
      const data = await listRecentTranscripts({ limit: 50 });
      setItems(data);
    } catch {
      setError('Could not load recent commands');
    }
  }, [authState.accessToken]);

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

  const handleRate = useCallback(
    async (item: Transcript, rating: Rating) => {
      // Toggle off if tapping the same rating again
      const effective: Rating = item.user_rating === rating ? 0 : rating;
      setRatingInFlight((prev) => new Set(prev).add(item.id));
      try {
        const updated = await rateTranscript(item.id, effective);
        setItems((prev) => prev.map((t) => (t.id === item.id ? updated : t)));
      } catch {
        setError('Rating failed — try again');
      } finally {
        setRatingInFlight((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    },
    [],
  );

  const renderItem = ({ item }: { item: Transcript }) => {
    const upActive = item.user_rating === 1;
    const downActive = item.user_rating === -1;
    const inFlight = ratingInFlight.has(item.id);
    return (
      <Card
        style={styles.card}
        onPress={() => navigation.navigate('RecentCommandDetail', { transcriptId: item.id })}
      >
        <Card.Content>
          <View style={styles.header}>
            <Text style={styles.timestamp}>{formatRelative(item.created_at)}</Text>
            <View style={styles.ratingRow}>
              <IconButton
                icon={upActive ? 'thumb-up' : 'thumb-up-outline'}
                size={20}
                iconColor={upActive ? theme.colors.primary : theme.colors.onSurfaceVariant}
                disabled={inFlight}
                onPress={() => handleRate(item, 1)}
              />
              <IconButton
                icon={downActive ? 'thumb-down' : 'thumb-down-outline'}
                size={20}
                iconColor={downActive ? theme.colors.error : theme.colors.onSurfaceVariant}
                disabled={inFlight}
                onPress={() => handleRate(item, -1)}
              />
            </View>
          </View>
          <Text style={styles.userMessage} numberOfLines={2}>
            “{item.user_message}”
          </Text>
          <Text style={[styles.toolSummary, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
            → {summarizeToolCall(item)}
          </Text>
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      {error ? (
        <Text style={[styles.error, { color: theme.colors.error }]}>{error}</Text>
      ) : null}
      <FlatList
        data={items}
        keyExtractor={(t) => String(t.id)}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}>
            No recent commands yet. Talk to Jarvis and they'll show up here.
          </Text>
        }
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : undefined}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 8 },
  card: { marginVertical: 4, marginHorizontal: 4 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timestamp: { fontSize: 12, opacity: 0.7 },
  ratingRow: { flexDirection: 'row' },
  userMessage: { fontSize: 15, marginTop: 4 },
  toolSummary: { fontSize: 13, marginTop: 4, fontFamily: 'System' },
  error: { padding: 8, textAlign: 'center' },
  empty: { textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
});

export default RecentCommandsListScreen;
