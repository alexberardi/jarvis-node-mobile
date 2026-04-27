import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Video, ResizeMode } from 'expo-av';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Appbar, Button, Chip, Text, useTheme } from 'react-native-paper';

import { startCameraStream, stopCameraStream, getCameraStreamUrl } from '../../api/cameraApi';
import { useAuth } from '../../auth/AuthContext';
import type { DevicesStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<DevicesStackParamList, 'CameraView'>;

type Phase = 'starting_stream' | 'streaming' | 'error';

const CameraViewScreen = ({ navigation, route }: Props) => {
  const { deviceId, householdId, deviceName } = route.params;
  const theme = useTheme();
  const { state: authState } = useAuth();
  const videoRef = useRef<Video>(null);

  const [phase, setPhase] = useState<Phase>('starting_stream');
  const [error, setError] = useState<string | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [streamName, setStreamName] = useState<string | null>(null);

  // Start stream on mount — CC handles credential retrieval from the node via MQTT
  useEffect(() => {
    if (phase !== 'starting_stream') return;

    startCameraStream(householdId, deviceId)
      .then((resp) => {
        setStreamName(resp.stream_name);
        const url = getCameraStreamUrl(resp.stream_name, 'stream.m3u8');
        setStreamUrl(url);
        setPhase('streaming');
      })
      .catch((err) => {
        const msg = err?.response?.data?.detail ?? err.message ?? 'Failed to start stream';
        setError(msg);
        setPhase('error');
      });
  }, [phase, householdId, deviceId]);

  // Clean up stream on unmount
  useEffect(() => {
    return () => {
      if (streamName) {
        stopCameraStream(householdId, deviceId).catch(() => {});
      }
    };
  }, [streamName, householdId, deviceId]);

  const handleRetry = () => {
    setError(null);
    setStreamUrl(null);
    setStreamName(null);
    setPhase('starting_stream');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={deviceName} />
      </Appbar.Header>

      <View style={styles.content}>
        {phase === 'starting_stream' && (
          <View style={styles.centered}>
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
              Starting stream...
            </Text>
          </View>
        )}

        {phase === 'streaming' && streamUrl && (
          <View style={styles.videoContainer}>
            <Video
              ref={videoRef}
              source={{
                uri: streamUrl,
                headers: authState.accessToken
                  ? { Authorization: `Bearer ${authState.accessToken}` }
                  : undefined,
              }}
              style={styles.video}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
              isLooping={false}
              useNativeControls={false}
            />
            <View style={styles.liveIndicator}>
              <Chip
                icon="circle"
                style={{ backgroundColor: '#dcfce7' }}
                textStyle={{ color: '#16a34a' }}
              >
                Live
              </Chip>
            </View>
          </View>
        )}

        {phase === 'error' && (
          <View style={styles.centered}>
            <Text
              variant="bodyLarge"
              style={{ color: theme.colors.error, textAlign: 'center', marginBottom: 16 }}
            >
              {error}
            </Text>
            <Button mode="contained" onPress={handleRetry}>
              Retry
            </Button>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  videoContainer: { flex: 1, backgroundColor: '#000' },
  video: { flex: 1 },
  liveIndicator: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
});

export default CameraViewScreen;
