import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Badge,
  Button,
  Icon,
  IconButton,
  Modal,
  Portal,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import type { ChatAction, ChatMessage } from '../../api/chatApi';
import { sendNodeAction } from '../../api/commandCenterApi';
import { getNode, type NodeInfo } from '../../api/nodeApi';
import { fetchTestRuns, pollTestInstallStatus, requestTestInstall } from '../../api/testInstallApi';
import { useAuth } from '../../auth/AuthContext';
import ChatBubble from '../../components/ChatBubble';
import KeyboardSafeView from '../../components/KeyboardSafeView';
import ThinkingWave from '../../components/ThinkingWave';
import { useChat } from '../../hooks/useChat';
import { NodesStackParamList } from '../../navigation/types';
import type { InstallStatus } from '../../types/Package';
import { isDesktopAgent, nodeDisplayName } from '../../utils/nodeKind';
import SendToForgeCard from '../Store/SendToForgeCard';

type Nav = NativeStackNavigationProp<NodesStackParamList>;
type Route = RouteProp<NodesStackParamList, 'NodeForgeTest'>;

const POLL_MS = 2000;
const RUNS_MS = 5000;
const LIVE = new Set(['pending', 'restarting']);

const errorDetail = (err: unknown, fallback: string): string =>
  (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? fallback;

/** Share codes are six letters and digits; the Forge shows them in capitals. */
export const normalizeShareCode = (v: string): string =>
  v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

/**
 * NodeForgeTestScreen tries a Forge draft on one node, as the web admin's Nodes page does: the
 * share code, the install, then a chat through that node to run the draft's commands by typing.
 * The header's Send to Forge opens the runs cc recorded and sends them back to the draft.
 */
const NodeForgeTestScreen = () => {
  const navigation = useNavigation<Nav>();
  const { nodeId } = useRoute<Route>().params;
  const theme = useTheme();
  const [node, setNode] = useState<NodeInfo | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  // Kept for Reinstall: the Forge's Fix saves to the same draft, under the same code.
  const [shareCode, setShareCode] = useState('');
  const [reinstalling, setReinstalling] = useState(false);
  const [reinstallError, setReinstallError] = useState<string | null>(null);
  const [install, setInstall] = useState<InstallStatus | null>(null);
  const [runCount, setRunCount] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    getNode(nodeId).then(setNode).catch(() => {});
  }, [nodeId]);

  // Poll the install until the node reports.
  useEffect(() => {
    if (!requestId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const s = await pollTestInstallStatus(nodeId, requestId);
        if (cancelled) return;
        setInstall(s);
        if (LIVE.has(s.status)) timer = setTimeout(tick, POLL_MS);
      } catch (err) {
        if (!cancelled) {
          setInstall({ status: 'failed', request_id: requestId, command_name: '', error_message: errorDetail(err, "Couldn't check the test install."), details: null });
        }
      }
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [nodeId, requestId]);

  const installed = install?.status === 'completed';

  // The header badge: how many runs cc has recorded so far.
  useEffect(() => {
    if (!installed || !requestId) return;
    const refresh = () => fetchTestRuns(nodeId, requestId).then((r) => setRunCount(r.length)).catch(() => {});
    refresh();
    const id = setInterval(refresh, RUNS_MS);
    return () => clearInterval(id);
  }, [installed, nodeId, requestId]);

  const startTest = useCallback((rid: string | null) => {
    setRequestId(rid);
    setInstall(null);
    setRunCount(0);
    setSheetOpen(false);
  }, []);
  const restart = useCallback(() => startTest(null), [startTest]);

  const reinstall = useCallback(async () => {
    setReinstalling(true);
    setReinstallError(null);
    try {
      startTest((await requestTestInstall(nodeId, shareCode)).id);
    } catch (err) {
      setReinstallError(errorDetail(err, "Couldn't reinstall."));
    } finally {
      setReinstalling(false);
    }
  }, [nodeId, shareCode, startTest]);

  const name = node ? nodeDisplayName(node, isDesktopAgent(node) ? 'this computer' : 'this node') : 'this node';
  const commands: string[] = Array.isArray(install?.details?.commands) ? install!.details!.commands : [];
  const protocols: string[] = Array.isArray(install?.details?.protocols) ? install!.details!.protocols : [];
  const agents: string[] = Array.isArray(install?.details?.agents) ? install!.details!.agents : [];

  return (
    <KeyboardSafeView style={styles.container}>
      <View style={[styles.header, { borderBottomColor: theme.colors.outlineVariant }]}>
        <IconButton testID="back-button" icon="arrow-left" accessibilityLabel="Back" onPress={() => navigation.goBack()} />
        <View style={{ flex: 1 }}>
          <Text variant="titleLarge" style={{ fontWeight: 'bold' }} numberOfLines={1}>
            Test a Forge command
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
            On {name}
          </Text>
        </View>
        {installed && (
          <>
            <IconButton
              testID="forge-test-reinstall"
              icon="refresh"
              accessibilityLabel="Reinstall"
              disabled={reinstalling}
              onPress={reinstall}
            />
            <IconButton testID="forge-test-restart" icon="restart" accessibilityLabel="Try another code" onPress={restart} />
            <View>
              <IconButton
                testID="forge-test-send-open"
                icon="send"
                iconColor={theme.colors.primary}
                accessibilityLabel={`Send to Forge, ${runCount} ${runCount === 1 ? 'run' : 'runs'}`}
                onPress={() => setSheetOpen(true)}
              />
              {runCount > 0 && (
                <Badge testID="forge-test-run-count" size={18} style={styles.badge}>
                  {runCount}
                </Badge>
              )}
            </View>
          </>
        )}
      </View>

      {!requestId ? (
        <ShareCodeForm
          nodeId={nodeId}
          name={name}
          offline={node !== null && !node.online}
          onStarted={(rid, code) => {
            setShareCode(code);
            startTest(rid);
          }}
        />
      ) : !install || LIVE.has(install.status) ? (
        <View style={styles.center} testID="forge-test-installing">
          <ActivityIndicator />
          <Text variant="bodyMedium" style={{ marginTop: 12 }}>
            Installing {install?.command_name || 'the draft'}…
          </Text>
        </View>
      ) : !installed ? (
        <View style={styles.center} testID="forge-test-failed">
          <Icon source="alert-circle-outline" size={32} color={theme.colors.error} />
          <Text variant="titleMedium" style={{ marginTop: 8 }}>
            {install.command_name || 'The draft'} didn't install
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 4 }}>
            {install.error_message ?? 'The node reported a failure.'}
          </Text>
          <Button testID="forge-test-reinstall-failed" mode="contained" onPress={reinstall} loading={reinstalling} style={{ marginTop: 16 }}>
            Reinstall
          </Button>
          <Button mode="outlined" onPress={restart} style={{ marginTop: 8 }}>
            Try another code
          </Button>
        </View>
      ) : (
        <>
          {protocols.length > 0 && (
            <View testID="forge-test-protocols" style={[styles.protocols, { borderBottomColor: theme.colors.outlineVariant }]}>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Device protocol {protocols.join(', ')} loaded. Set its settings, then scan for its devices.
              </Text>
              <View style={styles.protocolButtons}>
                <Button
                  testID="forge-test-protocol-settings"
                  mode="outlined"
                  compact
                  icon="cog-outline"
                  onPress={() => navigation.navigate('NodeSettings', { nodeId, room: node?.room ?? null })}
                >
                  Settings
                </Button>
                <Button
                  testID="forge-test-protocol-scan"
                  mode="outlined"
                  compact
                  icon="radar"
                  onPress={() => navigation.getParent()?.navigate('DevicesTab', { screen: 'DeviceDiscovery', params: { nodeId }, initial: false })}
                >
                  Scan for devices
                </Button>
              </View>
            </View>
          )}
          {agents.length > 0 && (
            <View testID="forge-test-agents" style={[styles.protocols, { borderBottomColor: theme.colors.outlineVariant }]}>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Background agent {agents.join(', ')} loaded. It ran once now and then runs on its schedule; Send to Forge
                includes how each run went.
              </Text>
            </View>
          )}
          {/* Keyed by the request: a reinstall starts a fresh chat, whose tools are the new version's. */}
          <TestChat key={requestId} nodeId={nodeId} householdId={node?.household_id ?? null} commands={commands} protocols={protocols} />
        </>
      )}
      {reinstallError && (
        <Text testID="forge-test-reinstall-error" variant="bodySmall" style={[styles.reinstallError, { color: theme.colors.error }]}>
          {reinstallError}
        </Text>
      )}

      <Portal>
        <Modal
          visible={sheetOpen && installed && !!requestId}
          onDismiss={() => setSheetOpen(false)}
          contentContainerStyle={[styles.sheet, { backgroundColor: theme.colors.surface }]}
        >
          <ScrollView>
            {requestId && <SendToForgeCard nodeId={nodeId} requestId={requestId} />}
            <Text variant="bodySmall" style={[styles.sheetHint, { color: theme.colors.onSurfaceVariant }]}>
              After Fix with this report in the Forge, reinstall to try the new version.
            </Text>
            <Button testID="forge-test-reinstall-sheet" mode="outlined" icon="refresh" onPress={reinstall} loading={reinstalling} style={styles.sheetButton}>
              Reinstall
            </Button>
          </ScrollView>
        </Modal>
      </Portal>
    </KeyboardSafeView>
  );
};

const ShareCodeForm = ({
  nodeId,
  name,
  offline,
  onStarted,
}: {
  nodeId: string;
  name: string;
  offline: boolean;
  onStarted: (requestId: string, code: string) => void;
}) => {
  const theme = useTheme();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      onStarted((await requestTestInstall(nodeId, code)).id, code);
    } catch (err) {
      setError(errorDetail(err, "Couldn't start the test install."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      <TextInput
        testID="forge-test-code"
        mode="outlined"
        label="Share code"
        value={code}
        onChangeText={(v) => setCode(normalizeShareCode(v))}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="AB3KM7"
        error={!!error}
        contentStyle={styles.codeContent}
      />
      <Text variant="bodySmall" style={{ color: error ? theme.colors.error : theme.colors.onSurfaceVariant, marginTop: 4 }}>
        {error ?? 'The 6-character code on the Forge page.'}
      </Text>

      <View testID="unverified-warning" style={[styles.warning, { backgroundColor: theme.colors.errorContainer }]}>
        <Icon source="shield-alert-outline" size={18} color={theme.colors.onErrorContainer} />
        <Text variant="bodySmall" style={{ flex: 1, marginLeft: 8, color: theme.colors.onErrorContainer }}>
          <Text variant="bodySmall" style={{ fontWeight: 'bold', color: theme.colors.onErrorContainer }}>
            Unverified code.{' '}
          </Text>
          Pantry hasn't reviewed this draft. It runs on {name} with the same access as any installed command, for 20
          minutes. Only install codes you made or trust.
        </Text>
      </View>

      {offline && (
        <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 12 }}>
          {name} is offline. Test installs need it online.
        </Text>
      )}
      <Button
        testID="forge-test-install"
        mode="contained"
        onPress={start}
        loading={busy}
        disabled={code.length !== 6 || offline || busy}
      >
        Install on {name}
      </Button>
    </ScrollView>
  );
};

/** TestChat is a chat through the test node; it mounts after the install, so its tools include the draft. */
const TestChat = ({
  nodeId,
  householdId,
  commands,
  protocols,
}: {
  nodeId: string;
  householdId: string | null;
  commands: string[];
  protocols: string[];
}) => {
  const theme = useTheme();
  const { state: authState } = useAuth();
  const { messages, isLoading, sendMessage } = useChat({ nodeId, householdId, accessToken: authState.accessToken });
  const [text, setText] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const handleAction = useCallback(
    async (action: ChatAction, commandName: string, context: Record<string, unknown>) => {
      const result = await sendNodeAction(nodeId, { command_name: commandName, action_name: action.button_action, context });
      if (result.success === false) throw new Error(result.error || 'Action failed');
    },
    [nodeId],
  );

  const send = () => {
    if (!text.trim() || isLoading) return;
    sendMessage(text);
    setText('');
  };

  const last = messages[messages.length - 1];
  return (
    <>
      <FlatList
        testID="forge-test-chat"
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item, index }) => (
          <ChatBubble
            message={item}
            isStreaming={isLoading && index === messages.length - 1 && item.role === 'assistant'}
            onAction={handleAction}
          />
        )}
        style={{ flex: 1 }}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.center}>
            <Icon source="message-outline" size={28} color={theme.colors.onSurfaceVariant} />
            <Text variant="titleMedium" style={{ marginTop: 8 }}>
              Try the command
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
              {commands.length > 0
                ? `Type what you'd say to Jarvis to use ${commands.join(' or ')}.`
                : protocols.length > 0
                  ? 'Once its devices are added, control them here, e.g. "turn on the plug".'
                  : "Type what you'd say to Jarvis to use the new command."}
            </Text>
          </View>
        }
      />
      {isLoading && last?.role === 'status' && (
        <View style={styles.typingRow}>
          <ThinkingWave color={theme.colors.primary} />
          <Text variant="bodySmall" style={{ color: theme.colors.outline }}>
            {last.content}
          </Text>
        </View>
      )}
      <View style={[styles.inputBar, { borderTopColor: theme.colors.outlineVariant }]}>
        <TextInput
          testID="forge-test-chat-input"
          mode="outlined"
          dense
          placeholder="Ask Jarvis"
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
          returnKeyType="send"
          editable={!isLoading}
          style={{ flex: 1 }}
        />
        <IconButton
          testID="forge-test-chat-send"
          icon="send"
          accessibilityLabel="Send"
          iconColor={theme.colors.primary}
          disabled={!text.trim() || isLoading}
          onPress={send}
        />
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48 },
  header: { flexDirection: 'row', alignItems: 'center', paddingRight: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  badge: { position: 'absolute', top: 4, right: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  form: { padding: 16, paddingBottom: 32 },
  codeContent: { fontFamily: 'monospace', letterSpacing: 6, fontSize: 20 },
  warning: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 8, marginVertical: 16 },
  messages: { padding: 12, flexGrow: 1 },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
  inputBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
  protocols: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  protocolButtons: { flexDirection: 'row', gap: 8, marginTop: 8 },
  reinstallError: { paddingHorizontal: 16, paddingBottom: 8 },
  sheetHint: { marginHorizontal: 8, marginTop: 12 },
  sheetButton: { margin: 8 },
  sheet: { margin: 16, borderRadius: 16, padding: 8, maxHeight: '80%' },
});

export default NodeForgeTestScreen;
