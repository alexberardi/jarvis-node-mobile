import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import {
  ActivityIndicator,
  Button,
  Chip,
  Divider,
  Icon,
  Text,
  useTheme,
} from 'react-native-paper';

import { deleteInboxItem, getInboxItem, InboxItem } from '../../api/inboxApi';
import { sendNodeAction } from '../../api/commandCenterApi';
import { useAuth } from '../../auth/AuthContext';
import ActionButtons from '../../components/ActionButtons';
import { InboxStackParamList } from '../../navigation/types';
import { JarvisButton, normalizeButton } from '../../types/SmartHome';

type DetailRoute = RouteProp<InboxStackParamList, 'InboxDetail'>;

const parseThinkBlock = (body: string): { thinking: string | null; content: string } => {
  const match = body.match(/<think>([\s\S]*?)<\/think>/);
  if (!match) {
    return { thinking: null, content: body.trim() };
  }
  const thinking = match[1].trim();
  const content = body.replace(/<think>[\s\S]*?<\/think>/, '').trim();
  return { thinking: thinking || null, content };
};

const InboxDetailScreen = () => {
  const route = useRoute<DetailRoute>();
  const navigation = useNavigation();
  const theme = useTheme();
  const { state: authState } = useAuth();
  const [item, setItem] = useState<InboxItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showThinking, setShowThinking] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionComplete, setActionComplete] = useState(false);

  const loadItem = useCallback(async () => {
    if (!authState.accessToken) return;
    try {
      setError(null);
      setLoading(true);
      const data = await getInboxItem(route.params.itemId);
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

  const handleAction = useCallback(async (action: JarvisButton) => {
    if (!authState.accessToken || !item?.metadata) return;

    const { command_name, node_id, draft } = item.metadata;
    if (!command_name || !node_id) {
      Alert.alert('Error', 'Missing action context');
      return;
    }

    setActionLoading(action.button_action);
    try {
      await sendNodeAction(
        node_id,
        {
          command_name,
          action_name: action.button_action,
          context: { draft },
        },
      );
      setActionComplete(true);

      const isCancel = action.button_action.includes('cancel');
      Alert.alert(
        isCancel ? 'Cancelled' : 'Sent',
        isCancel ? 'Action cancelled.' : 'Action completed successfully.',
      );
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to perform action');
    } finally {
      setActionLoading(null);
    }
  }, [authState.accessToken, item]);

  const markdownStyles = useMemo(
    () => ({
      body: { color: theme.colors.onSurface, fontSize: 14, lineHeight: 20 },
      heading1: {
        color: theme.colors.onSurface,
        fontSize: 20,
        fontWeight: 'bold' as const,
        marginTop: 16,
        marginBottom: 8,
      },
      heading2: {
        color: theme.colors.onSurface,
        fontSize: 18,
        fontWeight: 'bold' as const,
        marginTop: 14,
        marginBottom: 6,
      },
      heading3: {
        color: theme.colors.onSurface,
        fontSize: 16,
        fontWeight: 'bold' as const,
        marginTop: 12,
        marginBottom: 4,
      },
      link: { color: theme.colors.primary },
      bullet_list: { marginLeft: 8 },
      ordered_list: { marginLeft: 8 },
      hr: { backgroundColor: theme.colors.outlineVariant },
      strong: { fontWeight: 'bold' as const },
    }),
    [theme],
  );

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

  const actions: JarvisButton[] = ((item.metadata?.actions ?? []) as any[]).map(normalizeButton);
  const isConfirmation = item.category === 'confirmation' && actions.length > 0;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString();
  };

  const { thinking, content } = parseThinkBlock(item.body);
  const useMarkdown = item.content_format === 'markdown' || item.content_format == null;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { backgroundColor: theme.colors.background }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Icon source="arrow-left" size={24} color={theme.colors.onSurface} />
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, marginLeft: 8 }}>
            Inbox
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            Alert.alert('Delete', `Remove "${item.title}"?`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await deleteInboxItem(item.id);
                    navigation.goBack();
                  } catch {
                    Alert.alert('Error', 'Failed to delete');
                  }
                },
              },
            ]);
          }}
          style={styles.trashButton}
        >
          <Icon source="delete-outline" size={22} color={theme.colors.onSurfaceVariant} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
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

      {useMarkdown ? (
        <Markdown style={markdownStyles}>{content}</Markdown>
      ) : (
        <Text variant="bodyMedium" style={styles.body} selectable>
          {content}
        </Text>
      )}

      {/* Action buttons for confirmation items */}
      {isConfirmation && !actionComplete && (
        <ActionButtons
          actions={actions}
          onPress={handleAction}
          loadingAction={actionLoading}
        />
      )}

      {actionComplete && (
        <View style={{ justifyContent: 'center', marginTop: 24, alignItems: 'center' }}>
          <Chip icon="check" style={{ backgroundColor: '#d1fae5' }} textStyle={{ color: '#065f46' }}>
            Action completed
          </Chip>
        </View>
      )}

      {thinking && (
        <View style={{ marginTop: 16 }}>
          <Button
            mode="text"
            compact
            onPress={() => setShowThinking(!showThinking)}
            icon={showThinking ? 'chevron-up' : 'chevron-down'}
            contentStyle={{ flexDirection: 'row-reverse' }}
          >
            {showThinking ? 'Hide reasoning' : 'Show reasoning'}
          </Button>
          {showThinking && (
            <View
              style={[
                styles.thinkingCard,
                { backgroundColor: theme.colors.surfaceVariant },
              ]}
            >
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant, lineHeight: 18 }}
                selectable
              >
                {thinking}
              </Text>
            </View>
          )}
        </View>
      )}

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
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trashButton: {
    padding: 4,
  },
  content: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heading: { fontWeight: 'bold', marginTop: 8, marginBottom: 4 },
  body: { lineHeight: 22 },
  chip: { alignSelf: 'flex-start' },
  chipText: { fontSize: 10, lineHeight: 14 },
  thinkingCard: {
    marginTop: 8,
    padding: 12,
    borderRadius: 8,
  },
});

export default InboxDetailScreen;
