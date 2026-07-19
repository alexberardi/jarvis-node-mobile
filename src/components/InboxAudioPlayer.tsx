import Slider from '@react-native-community/slider';
import { Audio, AVPlaybackStatus } from 'expo-av';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, IconButton, Text, useTheme } from 'react-native-paper';

import { downloadInboxAudio, InboxAudioRef } from '../services/inboxAudioService';

interface Props {
  audio: InboxAudioRef;
}

const formatClock = (millis: number): string => {
  const totalSeconds = Math.max(0, Math.floor(millis / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * Inline player for inbox audio attachments (metadata.audio — phone-call
 * recordings). Downloads the WAV through the authenticated cache path on
 * first play (multi-minute files — never streamed straight into expo-av,
 * which can't attach the JWT), then plays locally with play/pause + scrub.
 */
const InboxAudioPlayer: React.FC<Props> = ({ audio }) => {
  const theme = useTheme();
  const soundRef = useRef<Audio.Sound | null>(null);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(
    audio.duration_seconds != null ? audio.duration_seconds * 1000 : 0,
  );
  const [seeking, setSeeking] = useState(false);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync()?.catch?.(() => {});
      soundRef.current = null;
    };
  }, []);

  const onStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      if (!seeking) setPositionMillis(status.positionMillis);
      if (status.durationMillis != null) setDurationMillis(status.durationMillis);
      setIsPlaying(status.isPlaying);
      if (status.didJustFinish) {
        setIsPlaying(false);
        setPositionMillis(0);
        soundRef.current?.setPositionAsync(0).catch(() => {});
      }
    },
    [seeking],
  );

  const ensureLoaded = useCallback(async (): Promise<Audio.Sound | null> => {
    if (soundRef.current) return soundRef.current;
    setPhase('loading');
    try {
      const fileUri = await downloadInboxAudio(audio.url);
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: fileUri },
        { shouldPlay: false },
        onStatus,
      );
      soundRef.current = sound;
      setPhase('ready');
      return sound;
    } catch {
      setPhase('error');
      return null;
    }
  }, [audio.url, onStatus]);

  const togglePlay = useCallback(async () => {
    const sound = await ensureLoaded();
    if (!sound) return;
    try {
      if (isPlaying) {
        await sound.pauseAsync();
      } else {
        await sound.playAsync();
      }
    } catch {
      setPhase('error');
    }
  }, [ensureLoaded, isPlaying]);

  const onSeekComplete = useCallback(async (value: number) => {
    setSeeking(false);
    setPositionMillis(value);
    try {
      await soundRef.current?.setPositionAsync(value);
    } catch {
      // Non-fatal — the next status update resyncs the slider.
    }
  }, []);

  if (phase === 'error') {
    return (
      <View style={styles.container} testID="inbox-audio-player">
        <Text variant="bodySmall" style={{ color: theme.colors.error }}>
          Couldn't load the audio.
        </Text>
        <IconButton
          icon="refresh"
          size={20}
          onPress={() => {
            soundRef.current = null;
            setPhase('idle');
          }}
          accessibilityLabel="Retry loading audio"
        />
      </View>
    );
  }

  return (
    <View style={styles.container} testID="inbox-audio-player">
      {audio.title ? (
        <Text variant="titleSmall" style={styles.title}>
          {audio.title}
        </Text>
      ) : null}
      <View style={styles.row}>
        {phase === 'loading' ? (
          <ActivityIndicator size={24} style={styles.playButton} testID="inbox-audio-loading" />
        ) : (
          <IconButton
            icon={isPlaying ? 'pause' : 'play'}
            size={28}
            onPress={togglePlay}
            style={styles.playButton}
            accessibilityLabel={isPlaying ? 'Pause audio' : 'Play audio'}
            testID="inbox-audio-toggle"
          />
        )}
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={Math.max(durationMillis, 1)}
          value={Math.min(positionMillis, durationMillis)}
          disabled={phase !== 'ready'}
          onSlidingStart={() => setSeeking(true)}
          onSlidingComplete={onSeekComplete}
          minimumTrackTintColor={theme.colors.primary}
          maximumTrackTintColor={theme.colors.surfaceVariant}
          thumbTintColor={theme.colors.primary}
          testID="inbox-audio-slider"
        />
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {formatClock(positionMillis)} / {formatClock(durationMillis)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginTop: 16 },
  title: { marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center' },
  playButton: { margin: 0 },
  slider: { flex: 1, marginHorizontal: 8 },
});

export default InboxAudioPlayer;
