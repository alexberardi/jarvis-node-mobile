import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ActivityIndicator, Button, IconButton, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useInboxMedia } from '../../hooks/useInboxMedia';
import { InboxAttachment, saveMediaToPhotos, shareMedia } from '../../services/inboxMediaService';
import ZoomableImage from './ZoomableImage';

interface Props {
  attachment: InboxAttachment;
  onClose: () => void;
}

const AttachmentVideo: React.FC<{ uri: string }> = ({ uri }) => {
  const player = useVideoPlayer(uri);
  return (
    <VideoView
      testID="attachment-video"
      player={player}
      style={styles.media}
      contentFit="contain"
      nativeControls
      allowsFullscreen
    />
  );
};

/**
 * Full-screen viewer for one inbox attachment: the image with pinch zoom or
 * the video with native controls, plus Save to Photos and Share. The media
 * is downloaded through the authenticated cache first; the photo permission
 * is asked only when Save is pressed.
 */
const AttachmentViewer: React.FC<Props> = ({ attachment, onClose }) => {
  const insets = useSafeAreaInsets();
  const { status, uri, retry } = useInboxMedia(attachment.url, attachment.mime_type);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const noun = attachment.kind === 'video' ? 'video' : 'image';

  useEffect(() => {
    setMessage(null);
  }, [attachment.url]);

  const onSave = useCallback(async () => {
    if (!uri) return;
    setBusy('save');
    setMessage(null);
    try {
      const result = await saveMediaToPhotos(uri);
      setMessage(
        result === 'saved'
          ? 'Saved to Photos.'
          : 'Jarvis needs permission to save to Photos. You can allow it in Settings.',
      );
    } catch {
      setMessage(`Couldn't save the ${noun}.`);
    } finally {
      setBusy(null);
    }
  }, [uri, noun]);

  const onShare = useCallback(async () => {
    if (!uri) return;
    setBusy('share');
    setMessage(null);
    try {
      const shared = await shareMedia(uri, attachment.mime_type);
      if (!shared) setMessage('Sharing is not available on this device.');
    } catch {
      setMessage(`Couldn't share the ${noun}.`);
    } finally {
      setBusy(null);
    }
  }, [uri, attachment.mime_type, noun]);

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <GestureHandlerRootView style={styles.root}>
        <View
          testID="attachment-viewer"
          style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
        >
          <View style={styles.topBar}>
            <IconButton
              icon="close"
              iconColor="#fff"
              onPress={onClose}
              accessibilityLabel="Close"
              testID="attachment-close"
            />
          </View>

          <View style={styles.content}>
            {status === 'loading' ? (
              <ActivityIndicator size="large" color="#fff" testID="attachment-loading" />
            ) : status === 'error' ? (
              <View style={styles.center} testID="attachment-error">
                <Text style={styles.lightText}>Couldn't load the {noun}.</Text>
                <Button mode="outlined" textColor="#fff" onPress={retry} testID="attachment-retry">
                  Retry
                </Button>
              </View>
            ) : uri && attachment.kind === 'video' ? (
              <AttachmentVideo uri={uri} />
            ) : uri ? (
              <ZoomableImage uri={uri} testID="attachment-image" />
            ) : null}
          </View>

          {message ? (
            <Text style={[styles.lightText, styles.message]} testID="attachment-message">
              {message}
            </Text>
          ) : null}

          <View style={styles.bottomBar}>
            <Button
              icon="download"
              textColor="#fff"
              disabled={status !== 'ready' || busy !== null}
              loading={busy === 'save'}
              onPress={onSave}
              testID="attachment-save"
            >
              Save
            </Button>
            <Button
              icon="share-variant"
              textColor="#fff"
              disabled={status !== 'ready' || busy !== null}
              loading={busy === 'share'}
              onPress={onShare}
              testID="attachment-share"
            >
              Share
            </Button>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  media: { width: '100%', height: '100%' },
  center: { alignItems: 'center', gap: 12 },
  lightText: { color: '#fff' },
  message: { textAlign: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  bottomBar: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8 },
});

export default AttachmentViewer;
