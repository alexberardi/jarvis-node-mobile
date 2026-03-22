import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import {
  ActivityIndicator,
  Button,
  Chip,
  IconButton,
  Menu,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import { listNodes, NodeInfo } from '../../api/nodeApi';
import {
  GeneratedRoutine,
  RoutineStreamEvent,
  sendRoutineBuilderMessage,
  StepResult,
  testRoutine,
} from '../../api/routineBuilderApi';
import { useAuth } from '../../auth/AuthContext';
import { RoutinesStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RoutinesStackParamList>;
type Provider = 'jarvis' | 'claude' | 'openai';

const SECURE_STORE_KEY = 'jarvis_routine_api_key';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'status';
  content: string;
  routine?: GeneratedRoutine;
  testResults?: StepResult[];
  testPassed?: number;
  testTotal?: number;
  validationWarnings?: string[];
}

const RoutineBuilderScreen = () => {
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const { state: authState } = useAuth();
  const flatListRef = useRef<FlatList>(null);

  // Node state
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeMenuVisible, setNodeMenuVisible] = useState(false);
  const [nodeError, setNodeError] = useState<string | null>(null);

  // Provider state
  const [provider, setProvider] = useState<Provider>('jarvis');
  const [apiKey, setApiKey] = useState('');
  const [showProviderConfig, setShowProviderConfig] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const streamingRef = useRef<XMLHttpRequest | null>(null);
  const messageIdCounter = useRef(0);

  // Step feedback state (for marking false positives)
  const [feedbackStep, setFeedbackStep] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState('');

  const nextId = () => {
    messageIdCounter.current += 1;
    return `msg-${messageIdCounter.current}`;
  };

  // Load nodes on mount
  useEffect(() => {
    const init = async () => {
      try {
        const nodeList = await listNodes();
        setNodes(nodeList);
        if (nodeList.length > 0) setSelectedNodeId(nodeList[0].node_id);
      } catch (error) {
        console.error('[RoutineBuilderScreen] Failed to load nodes', error);
        setNodeError('Could not load nodes.');
      }
      try {
        const cached = await SecureStore.getItemAsync(SECURE_STORE_KEY);
        if (cached) setApiKey(cached);
      } catch {
        // ignore
      }
    };
    init();
  }, []);

  const selectedNode = nodes.find((n) => n.node_id === selectedNodeId);
  const nodeLabel = selectedNode
    ? `${selectedNode.room || 'Unknown'} — ${selectedNode.user || selectedNode.node_id.slice(0, 8)}`
    : 'Select node...';

  const needsApiKey = provider !== 'jarvis';
  const canSend =
    selectedNodeId !== null &&
    inputText.trim().length > 0 &&
    !isStreaming &&
    !isTesting &&
    (!needsApiKey || apiKey.trim().length > 0);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  // ── Send Message ────────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    if (!canSend || !selectedNodeId || !authState.activeHouseholdId) return;

    const userMsg = inputText.trim();
    setInputText('');

    // Add user message
    const userMsgObj: ChatMessage = { id: nextId(), role: 'user', content: userMsg };
    setMessages((prev) => [...prev, userMsgObj]);

    // Add streaming placeholder
    const assistantId = nextId();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '' },
    ]);
    setIsStreaming(true);
    scrollToBottom();

    // Cache API key if using cloud provider
    if (needsApiKey && apiKey.trim()) {
      SecureStore.setItemAsync(SECURE_STORE_KEY, apiKey.trim()).catch(() => {});
    }

    const xhr = sendRoutineBuilderMessage(
      {
        message: userMsg,
        node_id: selectedNodeId,
        household_id: authState.activeHouseholdId,
        conversation_id: conversationId,
        provider,
        api_key: needsApiKey ? apiKey.trim() : undefined,
      },
      (event: RoutineStreamEvent) => {
        if (event.type === 'delta') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + event.text } : m,
            ),
          );
          scrollToBottom();
        } else if (event.type === 'done') {
          setConversationId(event.conversation_id);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: event.full_text,
                    routine: event.routine,
                    validationWarnings: event.validation_warnings,
                  }
                : m,
            ),
          );
          setIsStreaming(false);
          scrollToBottom();
        } else if (event.type === 'error') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: `Error: ${event.message}` }
                : m,
            ),
          );
          setIsStreaming(false);
        } else if (event.type === 'status') {
          // Update placeholder with status
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId && m.content === ''
                ? { ...m, content: `_${event.message}_` }
                : m,
            ),
          );
        }
      },
      (error: string) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: `Error: ${error}` } : m,
          ),
        );
        setIsStreaming(false);
      },
    );

    streamingRef.current = xhr;
  }, [
    canSend,
    selectedNodeId,
    authState.activeHouseholdId,
    inputText,
    conversationId,
    provider,
    apiKey,
    needsApiKey,
    scrollToBottom,
  ]);

  // ── Test Routine ──────────────────────────────────────────────────────────

  const handleTest = useCallback(
    (routine: GeneratedRoutine) => {
      if (!selectedNodeId || !authState.activeHouseholdId || isTesting) return;

      const testMsgId = nextId();
      setMessages((prev) => [
        ...prev,
        { id: testMsgId, role: 'status', content: `Testing "${routine.name}"...` },
      ]);
      setIsTesting(true);
      scrollToBottom();

      const resultMsgId = nextId();
      setMessages((prev) => [
        ...prev,
        { id: resultMsgId, role: 'assistant', content: '', testResults: [], testPassed: 0, testTotal: 0 },
      ]);

      testRoutine(
        {
          routine: routine as unknown as Record<string, unknown>,
          node_id: selectedNodeId,
          household_id: authState.activeHouseholdId,
        },
        (event: RoutineStreamEvent) => {
          if (event.type === 'step_result') {
            const result = event as unknown as StepResult;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === resultMsgId
                  ? { ...m, testResults: [...(m.testResults || []), result] }
                  : m,
              ),
            );
            scrollToBottom();
          } else if (event.type === 'test_done') {
            const doneEvent = event as { type: 'test_done'; results: StepResult[]; passed: number; total: number };
            setMessages((prev) =>
              prev.map((m) =>
                m.id === resultMsgId
                  ? {
                      ...m,
                      content: `Test complete: ${doneEvent.passed}/${doneEvent.total} passed`,
                      testResults: doneEvent.results,
                      testPassed: doneEvent.passed,
                      testTotal: doneEvent.total,
                    }
                  : m,
              ),
            );
            setIsTesting(false);
            scrollToBottom();
          }
        },
        (error: string) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === resultMsgId ? { ...m, content: `Test error: ${error}` } : m,
            ),
          );
          setIsTesting(false);
        },
      );
    },
    [selectedNodeId, authState.activeHouseholdId, isTesting, scrollToBottom],
  );

  // ── Fix Errors ────────────────────────────────────────────────────────────

  const handleFixErrors = useCallback(
    (testResults: StepResult[], userFeedback?: Record<number, string>) => {
      const errorLines: string[] = [];
      for (const r of testResults) {
        const feedback = userFeedback?.[r.step_index];
        if (!r.success || feedback) {
          const status = feedback ? 'FAILED (user feedback)' : 'FAILED';
          const detail = feedback || r.error || 'unknown error';
          const outputStr = r.output ? ` — response was: ${JSON.stringify(r.output).slice(0, 200)}` : '';
          errorLines.push(`Step ${r.step_index + 1} (${r.label}) ${status}: ${detail}${outputStr}`);
        } else {
          errorLines.push(`Step ${r.step_index + 1} (${r.label}): passed`);
        }
      }
      const fixMessage = `Test results:\n${errorLines.join('\n')}\n\nFix the failing steps in the routine.`;
      setInputText(fixMessage);
    },
    [],
  );

  // ── Use Routine ───────────────────────────────────────────────────────────

  const handleUseRoutine = useCallback(
    (routine: GeneratedRoutine) => {
      const routineForEdit = { ...routine, background: routine.background ?? null };
      navigation.navigate('RoutineEdit', {
        routineData: JSON.stringify(routineForEdit),
      });
    },
    [navigation],
  );

  // ── Render Messages ───────────────────────────────────────────────────────

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    if (item.role === 'status') {
      return (
        <View style={styles.statusContainer}>
          <Text variant="bodySmall" style={{ color: theme.colors.outline, fontStyle: 'italic' }}>
            {item.content}
          </Text>
        </View>
      );
    }

    const isUser = item.role === 'user';
    const isStreamingMsg = isStreaming && item === messages[messages.length - 1] && !isUser;
    const hasRichContent = !isUser && (item.routine || (item.testResults && item.testResults.length > 0));

    return (
      <View style={[styles.row, isUser ? styles.rowRight : styles.rowLeft]}>
        {/* Text bubble */}
        {(item.content || isStreamingMsg) && (
          <View
            style={[
              styles.bubble,
              hasRichContent && styles.bubbleWide,
              isUser
                ? [styles.userBubble, { backgroundColor: theme.colors.primary }]
                : [styles.assistantBubble, { backgroundColor: theme.colors.surfaceVariant }],
            ]}
          >
            <Text
              variant="bodyMedium"
              style={{ color: isUser ? theme.colors.onPrimary : theme.colors.onSurface }}
            >
              {item.content}
              {isStreamingMsg ? '\u258C' : ''}
            </Text>
          </View>
        )}

        {/* Routine card — full-width, outside bubble */}
        {item.routine && (
          <View style={[styles.routineCard, { backgroundColor: `${theme.colors.primary}10`, borderColor: `${theme.colors.primary}30` }]}>
            <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 6 }}>
              {item.routine.name}
            </Text>
            <View style={styles.chips}>
              {item.routine.trigger_phrases.slice(0, 3).map((p) => (
                <Chip key={p} compact style={styles.chip} textStyle={styles.chipText}>{p}</Chip>
              ))}
            </View>
            <View style={styles.stepsPreview}>
              {item.routine.steps.map((step, i) => (
                <Text key={i} variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {i + 1}. {step.label || step.command}
                  {step.args.length > 0 ? ` (${step.args.map((a) => `${a.key}=${a.value}`).join(', ')})` : ''}
                </Text>
              ))}
            </View>
            <Chip compact style={[styles.chip, { marginTop: 6 }]} textStyle={styles.chipText}>
              {item.routine.response_length}
            </Chip>

            {/* Validation warnings */}
            {item.validationWarnings && item.validationWarnings.length > 0 && (
              <View style={[styles.warningBox, { backgroundColor: `${theme.colors.error}10` }]}>
                {item.validationWarnings.map((w, i) => (
                  <Text key={i} variant="bodySmall" style={{ color: theme.colors.error }}>
                    {w}
                  </Text>
                ))}
              </View>
            )}

            <View style={styles.routineActions}>
              <Button
                mode="contained-tonal"
                compact
                icon="play-circle-outline"
                onPress={() => handleTest(item.routine!)}
                disabled={isTesting}
                style={{ flex: 1, marginRight: 6 }}
                labelStyle={{ fontSize: 12 }}
              >
                Test
              </Button>
              <Button
                mode="contained"
                compact
                icon="pencil-outline"
                onPress={() => handleUseRoutine(item.routine!)}
                style={{ flex: 1, marginLeft: 6 }}
                labelStyle={{ fontSize: 12 }}
              >
                Edit & Save
              </Button>
            </View>
          </View>
        )}

        {/* Test results — full-width, outside bubble */}
        {item.testResults && item.testResults.length > 0 && (
          <View style={[styles.testResultsCard, { backgroundColor: theme.colors.surfaceVariant }]}>
            {item.testPassed !== undefined && (
              <Text
                variant="labelMedium"
                style={{
                  color: item.testPassed === item.testTotal ? theme.colors.primary : theme.colors.error,
                  fontWeight: '600',
                  marginBottom: 6,
                }}
              >
                {item.testPassed}/{item.testTotal} steps passed
              </Text>
            )}
            {item.testResults.map((r) => (
              <View key={r.step_index} style={styles.testResultRow}>
                <Text variant="bodySmall" style={{ flex: 1 }}>
                  {r.success ? '\u2713' : '\u2717'} Step {r.step_index + 1} ({r.label})
                  {r.error ? `: ${r.error}` : ''}
                </Text>
                {r.success && (
                  <Button
                    mode="text"
                    compact
                    onPress={() => {
                      setFeedbackStep(r.step_index);
                      setFeedbackText('');
                    }}
                    labelStyle={{ fontSize: 10, color: theme.colors.outline }}
                  >
                    Mark Failed
                  </Button>
                )}
                {feedbackStep === r.step_index && (
                  <View style={styles.feedbackRow}>
                    <TextInput
                      mode="flat"
                      dense
                      placeholder="What went wrong?"
                      value={feedbackText}
                      onChangeText={setFeedbackText}
                      style={{ flex: 1, fontSize: 12 }}
                    />
                    <IconButton
                      icon="check"
                      size={16}
                      onPress={() => {
                        setMessages((prev) =>
                          prev.map((m) =>
                            m.id === item.id && m.testResults
                              ? {
                                  ...m,
                                  testResults: m.testResults.map((tr) =>
                                    tr.step_index === r.step_index
                                      ? { ...tr, success: false, error: feedbackText || 'User marked as failed' }
                                      : tr,
                                  ),
                                  testPassed: (m.testPassed ?? 0) - 1,
                                }
                              : m,
                          ),
                        );
                        setFeedbackStep(null);
                      }}
                    />
                  </View>
                )}
              </View>
            ))}
            {item.testResults.some((r) => !r.success) && (
              <Button
                mode="contained-tonal"
                compact
                icon="wrench"
                onPress={() => handleFixErrors(item.testResults!)}
                style={{ marginTop: 8, alignSelf: 'flex-start' }}
                labelStyle={{ fontSize: 12 }}
              >
                Fix Errors
              </Button>
            )}
          </View>
        )}
      </View>
    );
  };

  // ── Main Render ───────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View
        style={[
          styles.fixedHeader,
          { backgroundColor: theme.colors.background, borderBottomColor: theme.colors.outlineVariant },
        ]}
      >
        <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
        <Text variant="headlineSmall" style={{ fontWeight: 'bold', flex: 1 }}>
          AI Routine Builder
        </Text>
        <IconButton
          icon={showProviderConfig ? 'chevron-up' : 'cog-outline'}
          onPress={() => setShowProviderConfig((p) => !p)}
        />
      </View>

      {/* Provider config (collapsible) */}
      {showProviderConfig && (
        <View style={[styles.configPanel, { borderBottomColor: theme.colors.outlineVariant }]}>
          {/* Node selector */}
          <View style={styles.configRow}>
            <Text variant="labelMedium" style={{ marginRight: 8 }}>Node:</Text>
            <Menu
              visible={nodeMenuVisible}
              onDismiss={() => setNodeMenuVisible(false)}
              anchor={
                <Button mode="outlined" compact onPress={() => setNodeMenuVisible(true)} labelStyle={{ fontSize: 12 }}>
                  {nodeLabel}
                </Button>
              }
            >
              {nodes.map((n) => (
                <Menu.Item
                  key={n.node_id}
                  title={`${n.room || 'Unknown'} — ${n.user || n.node_id.slice(0, 8)}`}
                  onPress={() => { setSelectedNodeId(n.node_id); setNodeMenuVisible(false); }}
                />
              ))}
            </Menu>
          </View>

          {/* Provider toggle */}
          <SegmentedButtons
            value={provider}
            onValueChange={(v) => setProvider(v as Provider)}
            density="small"
            buttons={[
              { value: 'jarvis', label: 'Jarvis' },
              { value: 'claude', label: 'Claude' },
              { value: 'openai', label: 'OpenAI' },
            ]}
          />

          {/* API key (only for cloud providers) */}
          {needsApiKey && (
            <TextInput
              mode="flat"
              dense
              label="API Key"
              value={apiKey}
              onChangeText={setApiKey}
              secureTextEntry
              placeholder={provider === 'claude' ? 'sk-ant-...' : 'sk-...'}
              style={{ marginTop: 8 }}
            />
          )}
        </View>
      )}

      {/* Node error */}
      {nodeError && (
        <View style={styles.nodeErrorBanner}>
          <Text variant="bodySmall" style={{ color: theme.colors.error }}>{nodeError}</Text>
        </View>
      )}

      {/* Chat messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderMessage}
        contentContainerStyle={messages.length === 0 ? styles.emptyList : styles.messageList}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginBottom: 8 }}>
              Describe the routine you want
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.outline, textAlign: 'center' }}>
              e.g., "Make me a morning routine with weather, calendar, and news"
            </Text>
          </View>
        }
        onContentSizeChange={scrollToBottom}
      />

      {/* Loading indicator */}
      {isTesting && (
        <View style={styles.testingBar}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 8 }}>
            Running test...
          </Text>
        </View>
      )}

      {/* Input bar */}
      <View style={[styles.inputBar, { borderTopColor: theme.colors.outlineVariant }]}>
        <TextInput
          mode="flat"
          dense
          placeholder="Describe your routine..."
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleSend}
          multiline
          style={styles.textInput}
          disabled={isStreaming || isTesting}
        />
        <IconButton
          icon="send"
          onPress={handleSend}
          disabled={!canSend}
          iconColor={canSend ? theme.colors.primary : theme.colors.outline}
        />
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48 },
  fixedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 1,
  },
  configPanel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nodeErrorBanner: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },

  // Chat
  messageList: { paddingVertical: 12, paddingBottom: 8 },
  emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { paddingHorizontal: 48 },
  statusContainer: { alignItems: 'center', paddingVertical: 4 },
  row: { marginVertical: 4, paddingHorizontal: 12 },
  rowLeft: { alignItems: 'flex-start' },
  rowRight: { alignItems: 'flex-end' },
  bubble: { maxWidth: '85%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleWide: { maxWidth: '95%' },
  userBubble: { borderBottomRightRadius: 4 },
  assistantBubble: { borderBottomLeftRadius: 4 },

  // Routine card (full-width, below bubble)
  routineCard: {
    marginTop: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    width: '95%',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 },
  chip: { height: 26, paddingHorizontal: 2 },
  chipText: { fontSize: 10 },
  stepsPreview: { gap: 2, marginBottom: 4 },
  routineActions: { flexDirection: 'row', marginTop: 10 },

  // Warnings
  warningBox: { marginTop: 8, padding: 8, borderRadius: 6 },

  // Test results (full-width card, below bubble)
  testResultsCard: { marginTop: 8, padding: 12, borderRadius: 10, width: '95%' },
  testResultRow: { marginBottom: 4 },
  feedbackRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },

  // Testing bar
  testingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },

  // Input
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  textInput: {
    flex: 1,
    maxHeight: 100,
    backgroundColor: 'transparent',
    fontSize: 14,
  },
});

export default RoutineBuilderScreen;
