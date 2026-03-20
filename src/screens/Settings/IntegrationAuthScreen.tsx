/**
 * Generic integration auth screen — JCC-backed OAuth flow.
 *
 * Flow:
 * 1. If discovery_port is set → scan network for the service
 * 2. POST /oauth/sessions to JCC with provider + auth config
 * 3. Open authorize_url via openAuthSessionAsync (JCC callback is the redirect)
 * 4. WebView closes when JCC redirects to jarvis://auth-complete
 * 5. Poll GET /oauth/sessions/{id} to confirm ACTIVE
 * 6. Show success
 *
 * Tokens never touch mobile — JCC handles code exchange + storage.
 */
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Text, TextInput } from 'react-native-paper';

import { createAuthSession, exchangeCode, getAuthSessionStatus } from '../../api/authSessionApi';
import { discoverService } from '../../services/networkDiscoveryService';
import type { AuthenticationConfig } from '../../types/SmartHome';

/** Route params — works from any stack that declares these params. */
type IntegrationAuthParams = {
  authConfig: string;          // JSON-serialized AuthenticationConfig
  nodeId: string;
  accessToken: string;
  providerBaseUrl?: string;    // Skip discovery and use this URL directly
};

type IntegrationAuthRoute = RouteProp<
  { IntegrationAuth: IntegrationAuthParams },
  'IntegrationAuth'
>;

type Phase =
  | 'discovering'
  | 'manual_entry'
  | 'creating_session'
  | 'authenticating'
  | 'confirming'
  | 'done';

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 40; // 60 seconds total

const IntegrationAuthScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<IntegrationAuthRoute>();
  const { authConfig: authConfigJson, nodeId, accessToken, providerBaseUrl } = route.params;
  const authConfig: AuthenticationConfig = JSON.parse(authConfigJson);

  const [phase, setPhase] = useState<Phase>(
    providerBaseUrl
      ? 'creating_session'
      : authConfig.discovery_port
        ? 'discovering'
        : 'creating_session',
  );
  const [discoveredUrl, setDiscoveredUrl] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  // --- Discovery phase ---
  const startDiscovery = useCallback(async () => {
    if (!authConfig.discovery_port || !authConfig.discovery_probe_path) return;

    setPhase('discovering');
    setProgress(0);
    setError(null);

    const result = await discoverService(
      authConfig.discovery_port,
      authConfig.discovery_probe_path,
      (scanned, total) => setProgress(Math.round((scanned / total) * 100)),
    );

    if (result.found && result.url) {
      setDiscoveredUrl(result.url);
      startAuthFlow(result.url);
    } else {
      setPhase('manual_entry');
    }
  }, [authConfig]);

  useEffect(() => {
    if (providerBaseUrl) {
      // URL already known — skip discovery entirely
      startAuthFlow(providerBaseUrl);
    } else if (authConfig.discovery_port) {
      startDiscovery();
    } else {
      // No discovery needed — go straight to session creation
      startAuthFlow();
    }
  }, []);

  // --- Auth flow: create session → open WebView → poll status ---
  const startAuthFlow = async (baseUrl?: string) => {
    setPhase('creating_session');
    setError(null);

    try {
      // 1. Create auth session on JCC
      const session = await createAuthSession({
        provider: authConfig.provider,
        nodeId,
        providerBaseUrl: baseUrl ?? undefined,
        authConfig,
      });

      // 2. Open authorize URL in browser/WebView
      //    For local providers: JCC callback exchanges the code and redirects
      //    to jarvis://auth-complete. For external providers (relay bounce):
      //    the relay redirects to jarvis://auth-complete with the code, and
      //    we exchange it with JCC ourselves.
      setPhase('authenticating');

      // For native app redirect (e.g. Google iOS), use the custom URL scheme
      // so iOS intercepts the redirect. Otherwise fall back to jarvis://
      const redirectUri = authConfig.native_redirect_uri ?? 'jarvis://auth-complete';

      const result = await WebBrowser.openAuthSessionAsync(
        session.authorize_url,
        redirectUri,
      );

      if (result.type === 'cancel' || result.type === 'dismiss') {
        // User cancelled
        setPhase(authConfig.discovery_port ? 'manual_entry' : 'creating_session');
        return;
      }

      // 3. If relay bounce flow, extract code and exchange with JCC
      if (session.requires_code_exchange && result.type === 'success' && result.url) {
        const redirectUrl = new URL(result.url);
        const code = redirectUrl.searchParams.get('code');
        if (!code) {
          throw new Error('No authorization code received from provider');
        }
        await exchangeCode(session.session_id, code);
      }

      // 4. Poll JCC to confirm session is active
      setPhase('confirming');
      await pollSessionStatus(session.session_id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Authentication failed';
      setError(msg);
      setPhase(authConfig.discovery_port ? 'manual_entry' : 'creating_session');
      Alert.alert('Error', msg);
    }
  };

  const pollSessionStatus = async (sessionId: string): Promise<void> => {
    let attempts = 0;

    const poll = async (): Promise<void> => {
      try {
        const status = await getAuthSessionStatus(sessionId);

        if (status.status === 'active' || status.status === 'consumed') {
          setPhase('done');
          return;
        }

        if (status.status === 'expired') {
          throw new Error('Auth session expired. Please try again.');
        }

        // Still pending — keep polling
        attempts++;
        if (attempts >= MAX_POLL_ATTEMPTS) {
          throw new Error('Authentication timed out. Please try again.');
        }

        await new Promise<void>((resolve) => {
          pollRef.current = setTimeout(resolve, POLL_INTERVAL_MS);
        });
        return poll();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to confirm authentication';
        setError(msg);
        setPhase(authConfig.discovery_port ? 'manual_entry' : 'creating_session');
        Alert.alert('Error', msg);
      }
    };

    return poll();
  };

  const handleManualConnect = () => {
    const url = manualUrl.trim();
    if (!url) return;
    const fullUrl = url.includes('://') ? url : `http://${url}:${authConfig.discovery_port}`;
    setDiscoveredUrl(fullUrl);
    startAuthFlow(fullUrl);
  };

  // --- Render ---
  const providerLabel = authConfig.provider
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <View style={styles.container}>
      <Text variant="headlineSmall" style={styles.title}>
        Connect {providerLabel}
      </Text>

      {phase === 'discovering' && (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" style={styles.spinner} />
          <Text variant="bodyLarge" style={styles.statusText}>
            Scanning your network...
          </Text>
          <Text variant="bodySmall" style={styles.progressText}>
            {progress}% complete
          </Text>
        </View>
      )}

      {phase === 'manual_entry' && (
        <View style={styles.centerContent}>
          <Text variant="bodyLarge" style={styles.statusText}>
            {providerLabel} not found on your network.
          </Text>
          <Text variant="bodyMedium" style={styles.label}>
            Enter the IP address manually:
          </Text>
          <TextInput
            mode="outlined"
            placeholder="192.168.1.100"
            value={manualUrl}
            onChangeText={setManualUrl}
            keyboardType="url"
            autoCapitalize="none"
            style={styles.input}
          />
          <Button
            mode="contained"
            onPress={handleManualConnect}
            disabled={!manualUrl.trim()}
            style={styles.button}
          >
            Connect
          </Button>
          <Button mode="text" onPress={startDiscovery} style={styles.button}>
            Scan again
          </Button>
        </View>
      )}

      {phase === 'creating_session' && (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" style={styles.spinner} />
          <Text variant="bodyLarge" style={styles.statusText}>
            Setting up authentication...
          </Text>
        </View>
      )}

      {phase === 'authenticating' && (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" style={styles.spinner} />
          <Text variant="bodyLarge" style={styles.statusText}>
            Waiting for authentication...
          </Text>
          {discoveredUrl && (
            <Text variant="bodySmall" style={styles.urlText}>
              {discoveredUrl}
            </Text>
          )}
        </View>
      )}

      {phase === 'confirming' && (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" style={styles.spinner} />
          <Text variant="bodyLarge" style={styles.statusText}>
            Confirming with server...
          </Text>
        </View>
      )}

      {phase === 'done' && (
        <View style={styles.centerContent}>
          <Text variant="headlineMedium" style={styles.doneText}>
            Connected!
          </Text>
          <Text variant="bodyMedium" style={styles.statusText}>
            {providerLabel} authentication complete. Your node will receive credentials shortly.
          </Text>
          <Button
            mode="contained"
            onPress={() => navigation.goBack()}
            style={styles.button}
          >
            Done
          </Button>
        </View>
      )}

      {error && (
        <Text variant="bodySmall" style={styles.errorText}>
          {error}
        </Text>
      )}

      {phase !== 'done' && phase !== 'confirming' && phase !== 'creating_session' && (
        <Button mode="text" onPress={() => navigation.goBack()} style={styles.backButton}>
          Back
        </Button>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 64 },
  title: { fontWeight: 'bold', marginBottom: 32, textAlign: 'center' },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  spinner: { marginBottom: 16 },
  statusText: { textAlign: 'center', opacity: 0.7, marginBottom: 8 },
  progressText: { textAlign: 'center', opacity: 0.5, marginTop: 8 },
  urlText: { textAlign: 'center', opacity: 0.5, marginTop: 4 },
  label: { opacity: 0.7, marginBottom: 8, alignSelf: 'flex-start', width: '100%' },
  input: { marginBottom: 16, width: '100%' },
  button: { marginTop: 8, width: '100%' },
  doneText: { fontWeight: 'bold', marginBottom: 16 },
  errorText: { color: '#d32f2f', textAlign: 'center', marginTop: 8 },
  backButton: { marginBottom: 32 },
});

export default IntegrationAuthScreen;
