import { RouteProp, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Chip,
  Divider,
  Text,
  useTheme,
} from 'react-native-paper';

import { getInboxItem, InboxItem } from '../../api/inboxApi';
import { useAuth } from '../../auth/AuthContext';
import { InboxStackParamList } from '../../navigation/types';

type DetailRoute = RouteProp<InboxStackParamList, 'InboxDetail'>;

const InboxDetailScreen = () => {
  const route = useRoute<DetailRoute>();
  const theme = useTheme();
  const { state: authState } = useAuth();
  const [item, setItem] = useState<InboxItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadItem = useCallback(async () => {
    if (!authState.accessToken) return;
    try {
      setError(null);
      setLoading(true);
      const data = await getInboxItem(authState.accessToken, route.params.itemId);
      setItem(data);
    } catch {
      setError('Could not load item');
    } finally {
      setLoading(false);
    }
  }, [authState.accessToken, route.params.itemId]);

  useEffect(() => {
    loadItem();
  }, [loadItem]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error || !item) {
    return (
      <View style={styles.center}>
        <Text variant="bodyLarge" style={{ color: theme.colors.error }}>
          {error || 'Item not found'}
        </Text>
        <Button mode="text" onPress={loadItem} style={{ marginTop: 8 }}>
          Retry
        </Button>
      </View>
    );
  }

  const sources = item.metadata?.sources as
    | Array<{ title: string; url: string }>
    | undefined;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Chip
        compact
        style={styles.chip}
        textStyle={styles.chipText}
      >
        {item.category.replace(/_/g, ' ')}
      </Chip>

      <Text variant="headlineSmall" style={styles.heading}>
        {item.title}
      </Text>

      <Text
        variant="labelSmall"
        style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}
      >
        {formatDate(item.created_at)} | {item.source_service}
      </Text>

      <Divider style={{ marginBottom: 16 }} />

      <Text variant="bodyMedium" style={styles.body} selectable>
        {item.body}
      </Text>

      {sources && sources.length > 0 && (
        <>
          <Divider style={{ marginVertical: 16 }} />
          <Text variant="titleSmall" style={{ marginBottom: 8 }}>
            Sources
          </Text>
          {sources.map((src, i) => (
            <Text
              key={i}
              variant="bodySmall"
              style={{ color: theme.colors.primary, marginBottom: 4 }}
              selectable
            >
              {i + 1}. {src.title || src.url}
            </Text>
          ))}
        </>
      )}

      {item.metadata?.elapsed_seconds != null && (
        <Text
          variant="labelSmall"
          style={{
            color: theme.colors.onSurfaceVariant,
            marginTop: 16,
            textAlign: 'right',
          }}
        >
          Researched in {item.metadata.elapsed_seconds}s | {item.metadata.pages_scraped}/{item.metadata.pages_attempted} pages
        </Text>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingTop: 64, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heading: { fontWeight: 'bold', marginTop: 8, marginBottom: 4 },
  body: { lineHeight: 22 },
  chip: { alignSelf: 'flex-start', height: 24 },
  chipText: { fontSize: 10 },
});

export default InboxDetailScreen;
