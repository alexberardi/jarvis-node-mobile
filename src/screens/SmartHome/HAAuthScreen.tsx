import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';

import {
  testConnection,
  createLongLivedToken,
} from '../../services/haApiService';
import { deriveHAUrls } from '../../services/haDiscoveryService';
import { performOAuthFlow } from '../../services/oauthService';
import { SmartHomeSetupParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<SmartHomeSetupParamList, 'HAAuth'>;

const HA_CLIENT_ID = 'http://jarvis-node-mobile';

const HAAuthScreen = ({ navigation, route }: Props) => {
  const { haUrl } = route.params;
  const [token, setToken] = useState('');
  const [testing, setTesting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  /**
   * OAuth flow: open HA login in browser, exchange for short-lived token,
   * then mint a long-lived access token via WebSocket.
   */
  const handleOAuthLogin = async () => {
    setOauthLoading(true);
    try {
      const llat = await performOAuthFlow<string>({
        authorizeUrl: `${haUrl}/auth/authorize`,
        exchangeEndpoint: `${haUrl}/auth/token`,
        clientId: HA_CLIENT_ID,
        sendRedirectUriInExchange: false,
        completionHandler: async (tokens) => {
          const { wsUrl } = deriveHAUrls(haUrl);
          return createLongLivedToken(wsUrl, tokens.access_token, 'Jarvis Node');
        },
      });

      setOauthLoading(false);

      if (!llat) return; // User cancelled

      navigation.navigate('HADeviceImport', { haUrl, haToken: llat });
    } catch (e) {
      setOauthLoading(false);
      Alert.alert(
        'Error',
        e instanceof Error ? e.message : 'OAuth flow failed',
      );
    }
  };

  /**
   * Manual token flow: user pastes a long-lived access token.
   */
  const handleTestToken = async () => {
    const trimmed = token.trim();
    if (!trimmed) return;

    setTesting(true);
    const result = await testConnection(haUrl, trimmed);
    setTesting(false);

    if (result.success) {
      navigation.navigate('HADeviceImport', {
        haUrl,
        haToken: trimmed,
      });
    } else {
      Alert.alert('Connection Failed', result.error || 'Could not connect to Home Assistant');
    }
  };

  return (
    <View style={styles.container}>
      <Text variant="headlineSmall" style={styles.title}>
        Connect to Home Assistant
      </Text>

      <Text variant="bodyMedium" style={styles.url}>
        {haUrl}
      </Text>

      <View style={styles.section}>
        <Button
          mode="contained"
          onPress={handleOAuthLogin}
          loading={oauthLoading}
          disabled={oauthLoading || testing}
          style={styles.oauthButton}
          contentStyle={styles.buttonContent}
        >
          Log in with Home Assistant
        </Button>

        <Text variant="bodySmall" style={styles.divider}>
          or enter a long-lived access token
        </Text>

        <TextInput
          mode="outlined"
          label="Access Token"
          placeholder="Paste your HA long-lived access token"
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          secureTextEntry
          style={styles.input}
        />

        <Text variant="bodySmall" style={styles.hint}>
          Create one in HA: Profile &gt; Security &gt; Long-Lived Access Tokens
        </Text>

        <Button
          mode="outlined"
          onPress={handleTestToken}
          loading={testing}
          disabled={!token.trim() || testing || oauthLoading}
          style={styles.button}
        >
          Test Connection
        </Button>
      </View>

      <Button mode="text" onPress={() => navigation.goBack()} style={styles.backButton}>
        Back
      </Button>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 64 },
  title: { fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  url: { textAlign: 'center', opacity: 0.6, marginBottom: 32 },
  section: { flex: 1, gap: 12 },
  oauthButton: {},
  buttonContent: { paddingVertical: 4 },
  divider: { textAlign: 'center', opacity: 0.5, marginVertical: 8 },
  input: {},
  hint: { opacity: 0.5 },
  button: {},
  backButton: { marginBottom: 32 },
});

export default HAAuthScreen;
