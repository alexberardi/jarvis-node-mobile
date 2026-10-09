import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Badge, Button, Divider, IconButton, Modal, Portal, Snackbar, Text, TextInput, TouchableRipple, useTheme } from 'react-native-paper';

import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';

import { getUnreadCount } from '../../api/inboxApi';
import { sendNodeAction } from '../../api/commandCenterApi';
import { getTTSConfig, transcribeAudio } from '../../api/chatApi';
import type { ChatAction, ChatImageErrorCode, ChatMessage } from '../../api/chatApi';
import { refreshAuthToken } from '../../api/apiClient';

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
import { FirstRunCard } from '../../components/FirstRunCard';
import NodeSelector, { NodeSelectorHandle } from '../../components/NodeSelector';
import QuickActions from '../../components/QuickActions';
import type { NodeOption } from '../../api/smartHomeApi';
import { usePendingNode } from '../../contexts/PendingNodeContext';
import { helpCopy } from '../../copy/help';
import { useChat } from '../../hooks/useChat';
import { useChatCapabilities } from '../../hooks/useChatCapabilities';
import { useFirstRun } from '../../hooks/useFirstRun';
import { useVoiceRecording } from '../../hooks/useVoiceRecording';
import { RootStackParamList } from '../../navigation/types';
import {
  consumePendingIntent,
  peekPendingIntent,
  subscribePendingIntent,
} from '../../navigation/deepLinks';
import { AUTO_PLAY_TTS_KEY, LAST_NODE_KEY } from '../../config/storageKeys';
import {
  PendingChatImage,
  PickSource,
  pickChatImages,
  prepareChatImage,
} from '../../services/chatImageService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const HomeScreen = () => {
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const theme = useTheme();
  const { state: authState } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [autoPlayTTS, setAutoPlayTTS] = useState(false);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const nodeSelectorRef = useRef<NodeSelectorHandle>(null);

  const [snackbar, setSnackbar] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [nodeCount, setNodeCount] = useState<number | null>(null);
  const householdId = authState.activeHouseholdId;
  const { pendingNodeId, pendingHouseholdId } = usePendingNode();
  // A node was just provisioned for this household and is still booting — used
  // to show a "starting up" state instead of the "add your first node" card.
  const awaitingNewNode =
    !!pendingNodeId && (!pendingHouseholdId || pendingHouseholdId === householdId);
  const { isRecording, startRecording, stopRecording } = useVoiceRecording();
  const firstRun = useFirstRun('chat_intro');

  // Quick-open (com.jarvis.app://stt) auto-listen state.
  const [pendingAutoListen, setPendingAutoListen] = useState(false);
  const isFocusedRef = useRef(isFocused);
  isFocusedRef.current = isFocused;

  // iOS can't activate the audio session while the app is backgrounded. When a
  // Shortcut/Action Button launches us, the app briefly isn't foreground yet,
  // so auto-listen must wait until AppState is 'active'.
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setIsAppActive(state === 'active');
    });
    return () => sub.remove();
  }, []);

  // Drain a stashed quick-open intent. HomeScreen is the authoritative
  // consumer: 'stt' arms auto-listen, 'chat' just means "you're here now".
  const drainPendingIntent = useCallback(() => {
    if (!peekPendingIntent()) return;
    const intent = consumePendingIntent();
    if (intent === 'stt') setPendingAutoListen(true);
  }, []);

  // Drain when the screen gains focus — covers login -> Home, cross-tab, and
  // cold start (independent of the Auth->Main navigator swap timing).
  useFocusEffect(
    useCallback(() => {
      drainPendingIntent();
    }, [drainPendingIntent]),
  );

  // Drain when a new intent is stashed while Home is already focused (the
  // deep link arrives with the chat screen already open).
  useEffect(() => {
    return subscribePendingIntent(() => {
      if (isFocusedRef.current) drainPendingIntent();
    });
  }, [drainPendingIntent]);

  // Reset node selection and chat state when household changes
  useEffect(() => {
    setSelectedNodeId(null);
    setNodeCount(null);
  }, [householdId]);

  // Persist the selected node so the next launch / quick-open lands on it.
  useEffect(() => {
    if (selectedNodeId) {
      AsyncStorage.setItem(LAST_NODE_KEY, selectedNodeId).catch(() => {});
    }
  }, [selectedNodeId]);

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

  const [showToolsModal, setShowToolsModal] = useState(false);

  // Image attachments — offered only when the server's chat capabilities say
  // so (a legacy server 404s the capabilities read → no attach button at all).
  const {
    capabilities: chatCaps,
    refresh: refreshChatCaps,
    disableImages,
  } = useChatCapabilities(!!authState.accessToken);
  const imagesEnabled = chatCaps.images;
  const [pendingImages, setPendingImages] = useState<PendingChatImage[]>([]);
  const [showAttachSheet, setShowAttachSheet] = useState(false);
  const [preparingImages, setPreparingImages] = useState(false);

  // Server turned vision off → drop anything staged so it can't be sent.
  useEffect(() => {
    if (!imagesEnabled) setPendingImages([]);
  }, [imagesEnabled]);

  const handleImagesRejected = useCallback(
    (code: ChatImageErrorCode) => {
      if (code === 'images_unavailable') {
        disableImages();
        refreshChatCaps().catch(() => {});
        setSnackbar('Images are turned off on the Jarvis server.');
      } else {
        setSnackbar('The server rejected those images. Try fewer or smaller photos.');
      }
    },
    [disableImages, refreshChatCaps],
  );
  // The selected node is a present + online member of this household. Reported
  // by NodeSelector; false while a just-provisioned node is still coming online
  // (or if it's offline / registered elsewhere) — gates the chat composer so a
  // send can't 404.
  const [selectedNodeReady, setSelectedNodeReady] = useState(false);

  const {
    messages,
    isLoading,
    warmupState,
    toolCount,
    toolNames,
    toolInfos,
    toolsPending,
    sendMessage,
    clearConversation,
    refreshTools,
  } = useChat({
    nodeId: selectedNodeId,
    householdId,
    accessToken: authState.accessToken,
    onAssistantDone: handleAutoPlay,
    onImagesRejected: handleImagesRejected,
  });

  // Tools have been reported by the node (or we've stopped waiting). Until then
  // the chat input is disabled so users can't send before tools are available.
  const toolsReady = warmupState === 'ready' && !(toolCount === 0 && toolsPending);

  // The composer is usable only when the node is a live member of this
  // household AND its tools are in. Either one missing → disabled, so a send
  // can never bomb against a still-provisioning / offline / wrong-household node.
  const inputReady = selectedNodeReady && toolsReady;

  // Start recording for a pending quick-open once the app is foreground and a
  // node is selected. Node auto-selection is async (NodeSelector), so we wait
  // for it; bail with a hint if the household has no nodes at all.
  useEffect(() => {
    if (!pendingAutoListen || isLoading) return;
    if (isRecording) {
      setPendingAutoListen(false);
      return;
    }
    if (!isAppActive) return; // wait for foreground — see isAppActive above
    if (!selectedNodeId) {
      if (nodeCount === 0) {
        setPendingAutoListen(false);
        setSnackbar('Add a node before using the quick command.');
      }
      return; // wait for NodeSelector to auto-select a node
    }

    // Small settle delay: right after a Shortcut foregrounds the app, the iOS
    // audio session can need a beat before it will activate even once 'active'.
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      setPendingAutoListen(false);
      startRecording().then((ok) => {
        if (cancelled) return;
        setSnackbar(
          ok
            ? 'Listening… tap the mic to send.'
            : 'Couldn’t start listening. Tap the mic to try again.',
        );
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pendingAutoListen, selectedNodeId, isLoading, isRecording, isAppActive, nodeCount, startRecording]);

  // Refresh unread count on focus (but NOT tools — those persist across tabs
  // and only re-warmup when toolsVersion changes via ToolsContext).
  const accessTokenRef = useRef(authState.accessToken);
  accessTokenRef.current = authState.accessToken;

  const refreshUnreadCount = useCallback(() => {
    if (!accessTokenRef.current) return;
    getUnreadCount().then(setUnreadCount).catch(() => {});
  }, []);

  // Pull-to-refresh: re-fetch the node list (and unread badge). Lets the user
  // manually surface a just-provisioned node if they don't want to wait for the
  // automatic poll.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await nodeSelectorRef.current?.refresh();
      refreshTools();
      refreshUnreadCount();
    } finally {
      setRefreshing(false);
    }
  }, [refreshUnreadCount, refreshTools]);

  // A just-provisioned node finished booting and was auto-selected — celebrate
  // it so the chat screen visibly "comes alive" without an app restart.
  const handlePendingNodeReady = useCallback((node: NodeOption) => {
    const where = node.room
      ? node.room.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
      : 'Your new node';
    setSnackbar(`${where} is ready — say hi to Jarvis!`);
  }, []);

  // While home is the focused screen, refresh the unread count on a 15s
  // interval in addition to the on-focus fetch. Push-driven refresh
  // (below) only fires when an inbox item *also* requests a push, which
  // many commands opt out of — without polling, the badge would only
  // update when the user navigated away and back. 15s is short enough
  // to feel near-real-time without burning round trips while idle.
  useFocusEffect(
    useCallback(() => {
      refreshUnreadCount();
      const intervalId = setInterval(refreshUnreadCount, 15_000);
      return () => clearInterval(intervalId);
    }, [refreshUnreadCount]),
  );

  // Two cases useFocusEffect alone misses:
  //   1. A push arrives while the user is already sitting on home (the
  //      screen is already "focused", so useFocusEffect doesn't re-fire).
  //   2. The app returns from background with home already focused.
  // Both need an explicit refresh to bump the badge.
  useEffect(() => {
    const notifSub = Notifications.addNotificationReceivedListener(() => {
      refreshUnreadCount();
    });
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshUnreadCount();
    });
    return () => {
      notifSub.remove();
      appStateSub.remove();
    };
  }, [refreshUnreadCount]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    const images = imagesEnabled ? pendingImages : [];
    if (!text && images.length === 0) return;

    if (images.length === 0) {
      setInputText('');
      sendMessage(text);
      return;
    }

    // Downscale + compress before sending; on failure keep the draft intact.
    setPreparingImages(true);
    let payload;
    try {
      payload = await Promise.all(
        images.map((img) => prepareChatImage(img, chatCaps.max_image_bytes)),
      );
    } catch (error) {
      setSnackbar(
        error instanceof Error && error.message
          ? error.message
          : 'Could not prepare the image. Try a different photo.',
      );
      return;
    } finally {
      setPreparingImages(false);
    }

    setInputText('');
    setPendingImages([]);
    sendMessage(text, {
      refs: images.map(({ uri, width, height }) => ({ uri, width, height })),
      payload,
    });
  }, [inputText, imagesEnabled, pendingImages, chatCaps.max_image_bytes, sendMessage]);

  const remainingImageSlots = Math.max(0, chatCaps.max_images - pendingImages.length);

  const handlePickImages = useCallback(
    async (source: PickSource) => {
      setShowAttachSheet(false);
      try {
        const picked = await pickChatImages(source, remainingImageSlots);
        if (picked.length > 0) {
          setPendingImages((prev) => [...prev, ...picked].slice(0, chatCaps.max_images));
        }
      } catch (error) {
        setSnackbar(
          error instanceof Error && error.message ? error.message : 'Could not open the picker.',
        );
      }
    },
    [remainingImageSlots, chatCaps.max_images],
  );

  const removePendingImage = useCallback((index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

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

        // Fetch audio as blob, convert to base64 data URI for expo-av. This
        // raw fetch bypasses the apiClient interceptor, so handle a stale-token
        // 401 here: refresh once (shared single-flight; force-logs-out a dead
        // session) and retry, rather than just snackbar-ing "Could not play".
        let response = await fetch(ttsConfig.url, {
          method: 'POST',
          headers: ttsConfig.headers,
          body: ttsConfig.body,
        });

        if (response.status === 401) {
          const fresh = await refreshAuthToken();
          if (fresh) {
            const retry = getTTSConfig(text, householdId, fresh);
            response = await fetch(retry.url, {
              method: 'POST',
              headers: retry.headers,
              body: retry.body,
            });
          }
        }

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
        <View style={styles.titleRow}>
          <Text variant="headlineSmall" style={styles.title}>
            Jarvis
          </Text>
          <IconButton
            icon="help-circle-outline"
            size={18}
            onPress={firstRun.showAgain}
            iconColor={theme.colors.onSurfaceVariant}
            accessibilityLabel="What is the chat for?"
            style={{ margin: 0 }}
          />
        </View>
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
            ref={nodeSelectorRef}
            householdId={householdId}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            onNodesLoaded={setNodeCount}
            onPendingNodeReady={handlePendingNodeReady}
            onSelectedNodeReadyChange={setSelectedNodeReady}
          />
          {selectedNodeId && warmupState !== 'idle' && (
            <View style={styles.warmupIndicator}>
              {toolsReady ? (
                <TouchableRipple onPress={() => setShowToolsModal(true)} borderless>
                  <Text variant="labelSmall" style={{ color: theme.colors.primary }}>
                    {toolCount} tools loaded
                  </Text>
                </TouchableRipple>
              ) : (
                <View style={styles.warmupLoading}>
                  <ActivityIndicator size={10} color={theme.colors.outline} />
                  <Text variant="labelSmall" style={{ color: theme.colors.outline }}>
                    {warmupState === 'warming_up' ? 'Warming up...' : 'Loading tools...'}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* Connection errors now handled by global ConnectionBanner in App.tsx */}

      <FirstRunCard
        visible={firstRun.visible}
        onDismiss={firstRun.dismiss}
        title={helpCopy.home.firstRunTitle}
        body={helpCopy.home.firstRun}
      />

      {/* Message list */}
      <FlatList
        testID="chat-list"
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        style={styles.messageList}
        contentContainerStyle={styles.messageContent}
        inverted={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onContentSizeChange={() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }}
        ListEmptyComponent={
          nodeCount === 0 ? (
            awaitingNewNode ? (
              <View style={styles.onboarding}>
                <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginBottom: 20 }} />
                <Text variant="headlineSmall" style={{ fontWeight: 'bold', marginBottom: 8 }}>
                  Setting up your new node
                </Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
                  This usually takes about a minute while it powers on and connects. It’ll appear here automatically — no need to restart.
                </Text>
              </View>
            ) : (
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
                  onPress={() =>
                    navigation.navigate('Main', {
                      screen: 'NodesTab',
                      params: { screen: 'AddNode' },
                    })
                  }
                >
                  Add Your First Node
                </Button>
              </View>
            )
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

      {/* Listening banner — shown while recording (incl. quick-open auto-listen) */}
      {isRecording && (
        <View style={[styles.listeningBar, { backgroundColor: theme.colors.errorContainer }]}>
          <Text variant="labelLarge" style={{ color: theme.colors.onErrorContainer }}>
            Listening… tap the mic to send
          </Text>
        </View>
      )}

      {/* Staged image thumbnails */}
      {imagesEnabled && pendingImages.length > 0 && (
        <View style={styles.thumbRow} testID="pending-images">
          {pendingImages.map((img, i) => (
            <View key={`${img.uri}-${i}`} style={styles.thumbWrap}>
              <Image
                source={{ uri: img.uri }}
                style={styles.thumb}
                testID="pending-image-thumb"
                accessibilityLabel={`Attached image ${i + 1}`}
              />
              <IconButton
                icon="close-circle"
                size={18}
                onPress={() => removePendingImage(i)}
                style={styles.thumbRemove}
                iconColor={theme.colors.onSurface}
                containerColor={theme.colors.surface}
                accessibilityLabel={`Remove image ${i + 1}`}
                testID={`remove-image-${i}`}
              />
            </View>
          ))}
        </View>
      )}

      {/* Input bar */}
      <View style={[styles.inputBar, { borderTopColor: theme.colors.outlineVariant }]}>
        {imagesEnabled && (
          <IconButton
            icon="image-plus"
            size={24}
            onPress={() => setShowAttachSheet(true)}
            disabled={!inputReady || isLoading || preparingImages || remainingImageSlots === 0}
            iconColor={theme.colors.outline}
            accessibilityLabel="Attach image"
            testID="attach-image-button"
          />
        )}
        <TextInput
          mode="outlined"
          placeholder={
            !selectedNodeId
              ? 'Select a node first'
              : !selectedNodeReady
                ? 'Waiting for node…'
                : !toolsReady
                  ? 'Loading tools…'
                  : 'Message Jarvis...'
          }
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          editable={inputReady && !isLoading}
          style={styles.textInput}
          dense
          outlineStyle={styles.inputOutline}
        />
        <IconButton
          icon={isRecording ? 'microphone-off' : 'microphone'}
          size={24}
          onPress={handleMicPress}
          disabled={!inputReady || isLoading}
          iconColor={isRecording ? theme.colors.error : theme.colors.outline}
        />
        <IconButton
          icon="send"
          size={24}
          onPress={handleSend}
          disabled={
            (!inputText.trim() && !(imagesEnabled && pendingImages.length > 0)) ||
            !inputReady ||
            isLoading ||
            preparingImages
          }
          iconColor={theme.colors.primary}
          testID="send-button"
        />
      </View>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar('')}
        duration={3000}
      >
        {snackbar}
      </Snackbar>

      <Portal>
        <Modal
          visible={showAttachSheet}
          onDismiss={() => setShowAttachSheet(false)}
          contentContainerStyle={[styles.attachSheet, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="titleMedium" style={{ fontWeight: '600', marginBottom: 8 }}>
            Attach an image
          </Text>
          <Button
            icon="camera"
            mode="text"
            contentStyle={styles.attachOption}
            onPress={() => handlePickImages('camera')}
            testID="attach-camera"
          >
            Camera
          </Button>
          <Button
            icon="image-multiple"
            mode="text"
            contentStyle={styles.attachOption}
            onPress={() => handlePickImages('library')}
            testID="attach-library"
          >
            Photo library
          </Button>
        </Modal>
        <Modal
          visible={showToolsModal}
          onDismiss={() => setShowToolsModal(false)}
          contentContainerStyle={[styles.toolsModal, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="titleMedium" style={{ fontWeight: '600', marginBottom: 12 }}>
            Enabled Commands ({toolInfos.length})
          </Text>
          <ScrollView style={{ flex: 1 }}>
            {toolInfos.map((tool, i) => (
              <View key={tool.name}>
                {i > 0 && <Divider />}
                <View style={styles.toolRow}>
                  <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                    {tool.name.replace(/_/g, ' ')}
                  </Text>
                  {!!tool.description && (
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                      {tool.description}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </ScrollView>
          <Button onPress={() => setShowToolsModal(false)} style={{ marginTop: 12 }}>
            Close
          </Button>
        </Modal>
      </Portal>
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
  titleRow: {
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
  listeningBar: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
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
  thumbRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  thumbWrap: {
    width: 64,
    height: 64,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
  },
  thumbRemove: {
    position: 'absolute',
    top: -14,
    right: -14,
    margin: 0,
  },
  attachSheet: {
    margin: 20,
    borderRadius: 16,
    padding: 20,
  },
  attachOption: {
    justifyContent: 'flex-start',
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
  toolsModal: {
    margin: 20,
    borderRadius: 16,
    padding: 20,
    height: '75%',
  },
  toolRow: {
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
});

export default HomeScreen;
