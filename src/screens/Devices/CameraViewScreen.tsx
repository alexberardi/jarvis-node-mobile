import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Video, ResizeMode } from 'expo-av';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Appbar, Button, Chip, Text, useTheme } from 'react-native-paper';

import { startCameraStream, stopCameraStream, getCameraStreamUrl } from '../../api/cameraApi';
import { useAuth } from '../../auth/AuthContext';
import { useSettingsSnapshot } from '../../hooks/useSettingsSnapshot';
import type { DevicesStackParamList } from '../../navigation/types';
import type { CommandSecretEntry, DeviceFamilyEntry } from '../../services/settingsDecryptService';

type Props = NativeStackScreenProps<DevicesStackParamList, 'CameraView'>;

type Phase = 'loading_creds' | 'starting_stream' | 'streaming' | 'error';

const CameraViewScreen = ({ navigation, route }: Props) => {
  const { deviceId, householdId, deviceName } = route.params;
  const theme = useTheme();
  const { state: authState } = useAuth();
  const videoRef = useRef<Video>(null);

  const [phase, setPhase] = useState<Phase>('loading_creds');
  const [error, setError] = useState<string | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [streamName, setStreamName] = useState<string | null>(null);

  // Fetch and decrypt node settings to get Nest credentials
  const { snapshot, state: snapshotState, error: snapshotError } = useSettingsSnapshot({
    includeValues: true,
    enabled: phase === 'loading_creds',
  });

  // Extract Nest credentials from decrypted settings snapshot
  const getNestCredentials = useCallback(() => {
    if (!snapshot?.device_families) return null;

    const nestFamily: DeviceFamilyEntry | undefined = snapshot.device_families.find(
      (f) => f.family_name === 'nest',
    );
    if (!nestFamily) return null;

    const getSecret = (key: string): string | undefined => {
      const entry: CommandSecretEntry | undefined = nestFamily.secrets.find(
        (s) => s.key === key,
      );
      return entry?.value;
    };

    const refreshToken = getSecret('NEST_REFRESH_TOKEN');
    const clientId = getSecret('NEST_WEB_CLIENT_ID');
    const clientSecret = getSecret('NEST_WEB_CLIENT_SECRET');
    const projectId = getSecret('NEST_PROJECT_ID');

    if (!refreshToken || !clientId || !clientSecret || !projectId) {
      return null;
    }

    return { refreshToken, clientId, clientSecret, projectId };
  }, [snapshot]);

  // Start stream once credentials are available
  useEffect(() => {
    if (phase !== 'loading_creds') return;

    if (snapshotState === 'loaded' && snapshot) {
      const creds = getNestCredentials();
      if (!creds) {
        setError('Nest camera credentials not found. Set up Web OAuth in Node Settings.');
        setPhase('error');
        return;
      }

      setPhase('starting_stream');

      startCameraStream(householdId, deviceId, {
        refresh_token: creds.refreshToken,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        project_id: creds.projectId,
        protocols: 'RTSP',
      })
        .then((resp) => {
          setStreamName(resp.stream_name);
          // Build the full proxied stream URL with auth token
          const url = getCameraStreamUrl(resp.stream_name, 'stream.m3u8');
          setStreamUrl(url);
          setPhase('streaming');
        })
        .catch((err) => {
          const msg = err?.response?.data?.detail ?? err.message ?? 'Failed to start stream';
          setError(msg);
          setPhase('error');
        });
    } else if (snapshotState === 'error' || snapshotState === 'timeout') {
      setError(snapshotError ?? 'Failed to load credentials');
      setPhase('error');
    }
  }, [phase, snapshotState, snapshot, getNestCredentials, householdId, deviceId, snapshotError]);

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
    setPhase('loading_creds');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={deviceName} />
      </Appbar.Header>

      <View style={styles.content}>
        {(phase === 'loading_creds' || phase === 'starting_stream') && (
          <View style={styles.centered}>
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
              {phase === 'loading_creds' ? 'Loading credentials...' : 'Starting stream...'}
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
