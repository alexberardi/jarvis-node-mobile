import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { Badge, Button, IconButton, Snackbar, Text, TextInput, useTheme } from 'react-native-paper';

import { Audio } from 'expo-av';

import { getUnreadCount } from '../../api/inboxApi';
import { sendNodeAction } from '../../api/commandCenterApi';
import { getTTSConfig, transcribeAudio } from '../../api/chatApi';
import type { ChatAction, ChatMessage } from '../../api/chatApi';

/** Strip markdown + think tags for clean TTS input. */
function cleanForTTS(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>\s*/g, '')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
import { useAuth } from '../../auth/AuthContext';
import ChatBubble from '../../components/ChatBubble';
import NodeSelector from '../../components/NodeSelector';
import QuickActions from '../../components/QuickActions';
import { useChat } from '../../hooks/useChat';
import { useVoiceRecording } from '../../hooks/useVoiceRecording';
import { RootStackParamList } from '../../navigation/types';
import { AUTO_PLAY_TTS_KEY } from '../../config/storageKeys';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const HomeScreen = () => {
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const { state: authState } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [autoPlayTTS, setAutoPlayTTS] = useState(false);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const [snackbar, setSnackbar] = useState('');
  const [nodeCount, setNodeCount] = useState<number | null>(null);
  const householdId = authState.activeHouseholdId;
  const { isRecording, startRecording, stopRecording } = useVoiceRecording();

  // Reset node selection and chat state when household changes
  useEffect(() => {
    setSelectedNodeId(null);
    setNodeCount(null);
  }, [householdId]);

  // Load auto-play preference
  useEffect(() => {
    AsyncStorage.getItem(AUTO_PLAY_TTS_KEY).then((val) => setAutoPlayTTS(val === 'true'));
  }, []);

  // Re-read setting when returning from Settings
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(AUTO_PLAY_TTS_KEY).then((val) => setAutoPlayTTS(val === 'true'));
    }, []),
  );

  // Use ref so the callback doesn't need handlePlayTTS in deps (defined later)
  const autoPlayRef = useRef(autoPlayTTS);
  autoPlayRef.current = autoPlayTTS;
  const playTTSRef = useRef<(text: string) => void>(() => {});

  const handleAutoPlay = useCallback((text: string) => {
    if (autoPlayRef.current && text) {
      playTTSRef.current(text);
    }
  }, []);

  const { messages, isLoading, warmupState, toolCount, toolNames, sendMessage, clearConversation, refreshTools } = useChat({
    nodeId: selectedNodeId,
    householdId,
    accessToken: authState.accessToken,
    onAssistantDone: handleAutoPlay,
  });

  // Refresh unread count + tools on focus
  const hasNavigatedAway = useRef(false);
  const accessTokenRef = useRef(authState.accessToken);
  accessTokenRef.current = authState.accessToken;

  useFocusEffect(
    useCallback(() => {
      if (!accessTokenRef.current) return;
      getUnreadCount().then(setUnreadCount).catch(() => {});

      // Re-warmup when returning from another tab (e.g., after Pantry install)
      // to pick up newly installed/removed commands.
      if (hasNavigatedAway.current) {
        refreshTools();
      }
      return () => {
        hasNavigatedAway.current = true;
      };
    }, [refreshTools]),
  );

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    sendMessage(text);
  }, [inputText, sendMessage]);

  const handleMicPress = useCallback(async () => {
    if (isRecording) {
      const uri = await stopRecording();
      if (uri && householdId) {
        try {
          const result = await transcribeAudio(uri, householdId);
          if (result.text.trim()) {
            sendMessage(result.text.trim());
          }
        } catch (error) {
          console.error('[HomeScreen] Transcription failed', error);
          setSnackbar('Could not transcribe audio. Please try again.');
        }
      }
    } else {
      await startRecording();
    }
  }, [isRecording, stopRecording, startRecording, householdId, sendMessage]);

  const handlePlayTTS = useCallback(
    async (rawText: string, msgId?: string) => {
      if (!householdId || !authState.accessToken) return;
      const text = cleanForTTS(rawText);

      // Stop any currently playing audio
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      // If tapping the same message that's speaking, just stop
      if (speakingMsgId === msgId) {
        setSpeakingMsgId(null);
        return;
      }

      try {
        setSpeakingMsgId(msgId ?? null);

        const ttsConfig = getTTSConfig(text, householdId, authState.accessToken);

        // Fetch audio as blob, convert to base64 data URI for expo-av
        const response = await fetch(ttsConfig.url, {
          method: 'POST',
          headers: ttsConfig.headers,
          body: ttsConfig.body,
        });

        if (!response.ok) throw new Error('TTS request failed');

        const blob = await response.blob();
        const reader = new FileReader();
        const dataUri = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        const { sound } = await Audio.Sound.createAsync(
          { uri: dataUri },
          { shouldPlay: true },
        );
        soundRef.current = sound;

        // Clean up when playback finishes
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            setSpeakingMsgId(null);
            sound.unloadAsync();
            soundRef.current = null;
          }
        });
      } catch (error) {
        console.error('[HomeScreen] TTS playback failed', error);
        setSpeakingMsgId(null);
        setSnackbar('Could not play audio.');
      }
    },
    [householdId, authState.accessToken, speakingMsgId],
  );

  // Wire up auto-play ref now that handlePlayTTS is defined
  playTTSRef.current = handlePlayTTS;

  const handleAction = useCallback(
    async (action: ChatAction, commandName: string, context: Record<string, unknown>) => {
      if (!selectedNodeId) return;
      const result = await sendNodeAction(selectedNodeId, {
        command_name: commandName,
        action_name: action.button_action,
        context,
      });
      // Throw on failure so ChatBubble shows error state
      if (result.success === false) {
        throw new Error(result.error || 'Action failed');
      }
    },
    [selectedNodeId],
  );

  const renderMessage = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => {
      const isLast = index === messages.length - 1;
      const isStreamingThis = isLoading && isLast && item.role === 'assistant';

      return (
        <ChatBubble
          message={item}
          isStreaming={isStreamingThis}
          onPlayTTS={(text) => handlePlayTTS(text, item.id)}
          isSpeaking={speakingMsgId === item.id}
          onAction={handleAction}
        />
      );
    },
    [messages.length, isLoading, handlePlayTTS, speakingMsgId, handleAction],
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.outlineVariant }]}>
        <Text variant="headlineSmall" style={styles.title}>
          Jarvis
        </Text>
        <View style={styles.headerActions}>
          <IconButton
            icon="plus-circle-outline"
            size={22}
            onPress={clearConversation}
            iconColor={theme.colors.onSurface}
          />
          <IconButton
            icon="cog-outline"
            size={22}
            onPress={() => navigation.navigate('Settings')}
            iconColor={theme.colors.onSurface}
            testID="settings-button"
          />
          <View>
            <IconButton
              icon="bell-outline"
              size={22}
              onPress={() => navigation.navigate('Inbox', { screen: 'InboxList' })}
              iconColor={theme.colors.onSurface}
              testID="inbox-button"
            />
            {unreadCount > 0 && (
              <Badge size={16} style={styles.badge}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            )}
          </View>
        </View>
      </View>

      {/* Node selector + warmup indicator */}
      {householdId && (
        <View style={styles.nodeRow}>
          <NodeSelector
            householdId={householdId}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            onNodesLoaded={setNodeCount}
          />
          {selectedNodeId && warmupState !== 'idle' && (
            <View style={styles.warmupIndicator}>
              {warmupState === 'ready' ? (
                <Text variant="labelSmall" style={{ color: theme.colors.primary }}>
                  {toolCount} tools loaded
                </Text>
              ) : (
                <View style={styles.warmupLoading}>
                  <ActivityIndicator size={10} color={theme.colors.outline} />
                  <Text variant="labelSmall" style={{ color: theme.colors.outline }}>
                    {warmupState === 'loading_tools' ? 'Loading tools...' : 'Warming up...'}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* Connection errors now handled by global ConnectionBanner in App.tsx */}

      {/* Message list */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        style={styles.messageList}
        contentContainerStyle={styles.messageContent}
        inverted={false}
        onContentSizeChange={() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }}
        ListEmptyComponent={
          nodeCount === 0 ? (
            <View style={styles.onboarding}>
              <Text variant="headlineSmall" style={{ fontWeight: 'bold', marginBottom: 8 }}>
                Welcome to Jarvis
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginBottom: 20 }}>
                Pair a voice node to get started. You can use a Pi Zero or this device as a node.
              </Text>
              <Button
                mode="contained"
                icon="plus"
                onPress={() => navigation.getParent()?.navigate('NodesTab', { screen: 'AddNode' })}
              >
                Add Your First Node
              </Button>
            </View>
          ) : (
            <QuickActions
              availableTools={toolNames}
              onSelect={sendMessage}
            />
          )
        }
      />

      {/* Typing indicator */}
      {isLoading && messages.length > 0 && messages[messages.length - 1]?.role === 'status' && (
        <View style={styles.typingRow}>
          <Text variant="bodySmall" style={{ color: theme.colors.outline }}>
            {messages[messages.length - 1]?.content}
          </Text>
        </View>
      )}

      {/* Input bar */}
      <View style={[styles.inputBar, { borderTopColor: theme.colors.outlineVariant }]}>
        <TextInput
          mode="outlined"
          placeholder={selectedNodeId ? 'Message Jarvis...' : 'Select a node first'}
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          editable={!!selectedNodeId && !isLoading}
          style={styles.textInput}
          dense
          outlineStyle={styles.inputOutline}
        />
        <IconButton
          icon={isRecording ? 'microphone-off' : 'microphone'}
          size={24}
          onPress={handleMicPress}
          disabled={!selectedNodeId || isLoading}
          iconColor={isRecording ? theme.colors.error : theme.colors.outline}
        />
        <IconButton
          icon="send"
          size={24}
          onPress={handleSend}
          disabled={!inputText.trim() || !selectedNodeId || isLoading}
          iconColor={theme.colors.primary}
        />
      </View>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar('')}
        duration={3000}
      >
        {snackbar}
      </Snackbar>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontWeight: 'bold',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  warmupIndicator: {
    flexShrink: 1,
  },
  warmupLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  messageList: {
    flex: 1,
  },
  messageContent: {
    paddingVertical: 8,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  typingRow: {
    paddingHorizontal: 24,
    paddingBottom: 4,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    paddingBottom: Platform.OS === 'ios' ? 24 : 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  textInput: {
    flex: 1,
  },
  inputOutline: {
    borderRadius: 24,
  },
  onboarding: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
});

export default HomeScreen;
