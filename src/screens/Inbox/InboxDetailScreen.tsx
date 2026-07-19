import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import {
  ActivityIndicator,
  Button,
  Chip,
  Divider,
  Icon,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import { deleteInboxItem, getInboxItem, InboxItem } from '../../api/inboxApi';
import {
  InteractiveElement,
  normalizeInteractiveElements,
  sendNodeAction,
} from '../../api/commandCenterApi';
import { useAuth } from '../../auth/AuthContext';
import ActionButtons from '../../components/ActionButtons';
import InboxAudioPlayer from '../../components/InboxAudioPlayer';
import InteractiveElementsSection from '../../components/InteractiveElementsSection';
import { InboxStackParamList } from '../../navigation/types';
import { JarvisButton, normalizeButton } from '../../types/SmartHome';
import { parseInboxAudio } from '../../services/inboxAudioService';
import {
  parseExpiresAt,
  parseInboxEditors,
  type EditorField,
} from '../../utils/inboxEditors';

type DetailRoute = RouteProp<InboxStackParamList, 'InboxDetail'>;

// Editable-text/fields affordances (metadata.editable_text — legacy single
// multiline editor — and metadata.editable_fields — typed multi-field, e.g.
// the phone-call confirm card's tel-keyboard number + multiline details).
// Parsing, the fail-closed unsupported-editor rule, and the expiry
// affordance all live in utils/inboxEditors — see that module's docs.

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
  // Live values of the editable fields keyed by data_key (seeded on load)
  // and whether an interactive callback is in flight (editors disabled
  // meanwhile).
  const [editorValues, setEditorValues] = useState<Record<string, string>>({});
  const [callbackPending, setCallbackPending] = useState(false);
  // Set when a tap comes back with "plan expired" (410 / expired detail) —
  // proactive expiry uses metadata.expires_at below.
  const [expiredByServer, setExpiredByServer] = useState(false);

  const loadItem = useCallback(async () => {
    if (!authState.accessToken) return;
    try {
      setError(null);
      setLoading(true);
      const data = await getInboxItem(route.params.itemId);
      setItem(data);
      const seeded: Record<string, string> = {};
      for (const field of parseInboxEditors(data.metadata).fields) {
        seeded[field.data_key] = field.initial;
      }
      setEditorValues(seeded);
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
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to perform action');
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

  const actions: JarvisButton[] = ((item.metadata?.actions ?? []) as unknown[]).map(normalizeButton);
  const isConfirmation = item.category === 'confirmation' && actions.length > 0;

  const interactiveElements: InteractiveElement[] = normalizeInteractiveElements(
    item.metadata?.interactive_elements,
  );
  const interactiveTargetNodeId: string | null =
    typeof item.metadata?.node_id === 'string' ? item.metadata.node_id : null;
  const editorParse = parseInboxEditors(item.metadata);
  const editorFields: EditorField[] = editorParse.fields;
  const expiresAt = parseExpiresAt(item.metadata);
  const isExpired =
    expiredByServer || (expiresAt !== null && expiresAt.getTime() <= Date.now());
  const inboxAudio = parseInboxAudio(item.metadata);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString();
  };

  const { thinking, content } = parseThinkBlock(item.body);
  const useMarkdown = item.content_format === 'markdown' || item.content_format == null;

  const linkUrl =
    item.category === 'link'
      ? (typeof item.metadata?.url === 'string' ? item.metadata.url : null) ||
        (item.body.startsWith('http://') || item.body.startsWith('https://') ? item.body.trim() : null)
      : null;

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

      {linkUrl ? (
        <>
          {item.summary && item.summary !== linkUrl && (
            <Text variant="bodyMedium" style={[styles.body, { marginBottom: 16 }]}>
              {item.summary}
            </Text>
          )}
          <Button
            mode="contained"
            icon="open-in-new"
            onPress={() => {
              Linking.openURL(linkUrl).catch(() =>
                Alert.alert('Error', 'Could not open the link.'),
              );
            }}
            style={{ marginBottom: 12 }}
          >
            Open in browser
          </Button>
          <Text
            variant="labelSmall"
            style={{ color: theme.colors.onSurfaceVariant }}
            selectable
            numberOfLines={2}
          >
            {linkUrl}
          </Text>
        </>
      ) : useMarkdown ? (
        <Markdown style={markdownStyles}>{content}</Markdown>
      ) : (
        <Text variant="bodyMedium" style={styles.body} selectable>
          {content}
        </Text>
      )}

      {/* Inline audio attachment (metadata.audio — e.g. a phone-call
          recording). Downloaded through the authenticated cache path;
          absent metadata renders nothing. */}
      {inboxAudio && <InboxAudioPlayer audio={inboxAudio} />}

      {/* FAIL-CLOSED editor guard: this card declares editors the build
          can't render (unknown field type / newer editor_schema). Submitting
          without them is exactly the unsafe path (e.g. dialing a number the
          user couldn't see or edit) — so say why, and disable the elements
          below instead of hiding the problem. */}
      {editorParse.unsupported && (
        <View
          style={[styles.noticeCard, { backgroundColor: theme.colors.surfaceVariant }]}
          testID="unsupported-editor-notice"
        >
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            This card needs a newer version of the app to respond. Update the
            app, then open it again.
          </Text>
        </View>
      )}

      {/* TTL'd cards (metadata.expires_at, or the server rejecting the tap
          as expired): dead buttons explain themselves instead of failing
          silently. */}
      {isExpired && (
        <View
          style={[styles.noticeCard, { backgroundColor: theme.colors.surfaceVariant }]}
          testID="expired-card-notice"
        >
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            This card has expired. Ask Jarvis again to get a fresh one.
          </Text>
        </View>
      )}

      {/* Editable field block (metadata.editable_text — legacy single
          multiline draft — or metadata.editable_fields — typed fields, e.g.
          the phone-call confirm card's number + details). The editors hold
          the live values that InteractiveElementsSection merges into tapped
          elements whose data carries each field's data_key. Back-compat:
          items without editors render exactly as before. */}
      {editorFields.map((field) => (
        <View style={styles.editableSection} key={field.key}>
          {field.label ? (
            <Text variant="titleSmall" style={styles.editableLabel}>
              {field.label}
            </Text>
          ) : null}
          <TextInput
            mode="outlined"
            multiline={field.input_type !== 'tel'}
            keyboardType={field.input_type === 'tel' ? 'phone-pad' : 'default'}
            value={editorValues[field.data_key] ?? ''}
            onChangeText={(text) =>
              setEditorValues((prev) => ({ ...prev, [field.data_key]: text }))
            }
            disabled={callbackPending || isExpired}
            style={field.input_type === 'tel' ? styles.editableInputSingle : styles.editableInput}
            testID={field.legacy ? 'editable-text-input' : `editable-field-${field.key}`}
          />
        </View>
      ))}

      {/* Tappable interactive elements (actor cards, "expand similar",
          phone-call confirm, etc.). Hidden when metadata.interactive_elements
          is absent — preserves back-compat for inbox items that predate this
          feature. Node-plane elements need metadata.node_id; server-plane
          elements (target: "server") use the item's household. */}
      {interactiveElements.length > 0 && (
        <InteractiveElementsSection
          elements={interactiveElements}
          targetNodeId={interactiveTargetNodeId}
          serverHouseholdId={item.household_id ?? null}
          editors={
            editorFields.length > 0
              ? { fields: editorFields, values: editorValues }
              : undefined
          }
          disabled={editorParse.unsupported || isExpired}
          onExpired={() => setExpiredByServer(true)}
          onPendingChange={setCallbackPending}
        />
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
  editableSection: { marginTop: 16 },
  editableLabel: { marginBottom: 8 },
  // multiline Paper TextInput grows with content; minHeight gives the empty
  // editor a sensible starting size.
  editableInput: { minHeight: 100 },
  // Single-line fields (tel keypad) don't need the multiline minimum.
  editableInputSingle: {},
  noticeCard: { marginTop: 16, padding: 12, borderRadius: 8 },
});

export default InboxDetailScreen;
