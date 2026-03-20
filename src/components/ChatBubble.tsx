import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { Button, IconButton, Text, useTheme } from 'react-native-paper';

import type { ChatAction, ChatMessage } from '../api/chatApi';

/** Strip <think>...</think> blocks from LLM output (Qwen3 reasoning traces). */
function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
}

/** Strip markdown formatting for TTS (so it doesn't read "asterisk asterisk bold asterisk asterisk"). */
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')          // headers
    .replace(/\*\*(.+?)\*\*/g, '$1')    // bold
    .replace(/\*(.+?)\*/g, '$1')        // italic
    .replace(/__(.+?)__/g, '$1')        // bold alt
    .replace(/_(.+?)_/g, '$1')          // italic alt
    .replace(/~~(.+?)~~/g, '$1')        // strikethrough
    .replace(/`(.+?)`/g, '$1')          // inline code
    .replace(/^\s*[-*+]\s+/gm, '')      // bullet lists
    .replace(/^\s*\d+\.\s+/gm, '')      // numbered lists
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
    .replace(/\n{3,}/g, '\n\n')         // excess newlines
    .trim();
}

interface ChatBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  onPlayTTS?: (text: string) => void;
  isSpeaking?: boolean;
  onAction?: (action: ChatAction, commandName: string, context: Record<string, unknown>) => Promise<void>;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  isStreaming = false,
  onPlayTTS,
  isSpeaking = false,
  onAction,
}) => {
  const theme = useTheme();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [completionText, setCompletionText] = useState<string | null>(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);

  const mdStyles = useMemo(
    () => ({
      body: { color: theme.colors.onSurface, fontSize: 14, lineHeight: 20 },
      strong: { fontWeight: 'bold' as const },
      link: { color: theme.colors.primary },
      bullet_list: { marginLeft: 4 },
      ordered_list: { marginLeft: 4 },
      list_item: { marginVertical: 1 },
      heading1: { color: theme.colors.onSurface, fontSize: 18, fontWeight: 'bold' as const, marginTop: 8, marginBottom: 4 },
      heading2: { color: theme.colors.onSurface, fontSize: 16, fontWeight: 'bold' as const, marginTop: 6, marginBottom: 3 },
      heading3: { color: theme.colors.onSurface, fontSize: 15, fontWeight: 'bold' as const, marginTop: 4, marginBottom: 2 },
      code_inline: { backgroundColor: 'rgba(0,0,0,0.1)', paddingHorizontal: 4, borderRadius: 3, fontSize: 13 },
      fence: { backgroundColor: 'rgba(0,0,0,0.1)', padding: 8, borderRadius: 6, fontSize: 13 },
      paragraph: { marginTop: 0, marginBottom: 4 },
    }),
    [theme],
  );

  if (message.role === 'status') {
    return (
      <View style={styles.statusContainer}>
        <Text variant="bodySmall" style={[styles.statusText, { color: theme.colors.outline }]}>
          {message.content}
        </Text>
      </View>
    );
  }

  const isUser = message.role === 'user';
  const hasActions = !isUser && !isStreaming && message.actions && message.actions.length > 0 && !completionText;

  const handleActionPress = async (action: ChatAction) => {
    if (!onAction || !message.actionContext) return;
    setLoadingAction(action.button_action);
    try {
      await onAction(action, message.actionContext.command_name, message.actionContext.context);
      setCompletionText(
        action.completion_message
        ?? (action.button_action.includes('cancel') ? 'Cancelled.' : 'Done!'),
      );
    } catch {
      setCompletionText('Action failed.');
    } finally {
      setLoadingAction(null);
    }
  };

  const getButtonStyle = (type: ChatAction['button_type']) => {
    switch (type) {
      case 'primary':
        return { bg: theme.colors.primary, text: theme.colors.onPrimary };
      case 'destructive':
        return { bg: theme.colors.error, text: theme.colors.onError };
      default:
        return { bg: theme.colors.surfaceVariant, text: theme.colors.onSurface };
    }
  };

  return (
    <View style={[styles.row, isUser ? styles.rowRight : styles.rowLeft]}>
      <View
        style={[
          styles.bubble,
          isUser
            ? [styles.userBubble, { backgroundColor: theme.colors.primary }]
            : [styles.assistantBubble, { backgroundColor: theme.colors.surfaceVariant }],
        ]}
      >
        {!isUser && (
          <Text
            variant="labelSmall"
            style={[styles.label, { color: theme.colors.outline }]}
          >
            Jarvis
          </Text>
        )}
        {isUser ? (
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onPrimary }}
          >
            {message.content}
          </Text>
        ) : (
          <Markdown style={mdStyles}>
            {stripThinkTags(message.content) + (isStreaming ? '\u258C' : '')}
          </Markdown>
        )}

        {/* Preview card (e.g., email draft) */}
        {hasActions && message.actionPreview && (
          <Pressable
            onPress={() => setPreviewExpanded((p) => !p)}
            style={[styles.previewCard, { backgroundColor: 'rgba(0,0,0,0.1)' }]}
          >
            <Text
              variant="bodySmall"
              numberOfLines={previewExpanded ? undefined : 4}
              style={{ color: theme.colors.onSurface, opacity: 0.85 }}
            >
              {message.actionPreview}
            </Text>
            {!previewExpanded && message.actionPreview.length > 200 && (
              <Text variant="labelSmall" style={{ color: theme.colors.primary, marginTop: 4 }}>
                Tap to expand
              </Text>
            )}
          </Pressable>
        )}

        {/* Completion message (shown after action taken) */}
        {completionText && (
          <View style={styles.completionContainer}>
            <Text variant="labelSmall" style={{ color: theme.colors.primary, fontWeight: '600' }}>
              {completionText}
            </Text>
          </View>
        )}

        {/* Inline action buttons */}
        {hasActions && (
          <View style={styles.actionsContainer}>
            <View style={[
              styles.actionsRow,
              { flexDirection: message.actions!.length === 2 ? 'row' : 'column' },
            ]}>
              {message.actions!.map((action) => {
                const colors = getButtonStyle(action.button_type);
                return (
                  <Button
                    key={action.button_action}
                    mode="contained"
                    compact
                    onPress={() => handleActionPress(action)}
                    loading={loadingAction === action.button_action}
                    disabled={loadingAction !== null}
                    icon={action.button_icon || undefined}
                    style={[
                      styles.actionButton,
                      message.actions!.length === 2 && styles.actionButtonRow,
                      { backgroundColor: colors.bg },
                    ]}
                    labelStyle={{ color: colors.text, fontSize: 13 }}
                  >
                    {action.button_text}
                  </Button>
                );
              })}
            </View>
          </View>
        )}

        {!isUser && message.content.length > 0 && !isStreaming && !hasActions && onPlayTTS && (
          <View style={styles.ttsRow}>
            <IconButton
              icon={isSpeaking ? 'stop' : 'volume-high'}
              size={16}
              onPress={() => onPlayTTS(stripMarkdown(stripThinkTags(message.content)))}
              iconColor={theme.colors.outline}
              style={styles.ttsButton}
            />
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  statusContainer: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  statusText: {
    fontStyle: 'italic',
  },
  row: {
    marginVertical: 4,
    paddingHorizontal: 12,
  },
  rowLeft: {
    alignItems: 'flex-start',
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    borderBottomLeftRadius: 4,
  },
  label: {
    marginBottom: 2,
  },
  previewCard: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
  },
  completionContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  actionsContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  actionsRow: {
    gap: 8,
  },
  actionButton: {
    borderRadius: 8,
  },
  actionButtonRow: {
    flex: 1,
  },
  ttsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
    marginBottom: -4,
    marginRight: -8,
  },
  ttsButton: {
    margin: 0,
  },
});

export default ChatBubble;
