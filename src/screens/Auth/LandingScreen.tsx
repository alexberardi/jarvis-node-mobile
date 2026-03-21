import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import {
  Banner,
  Button,
  Dialog,
  IconButton,
  Portal,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEMO_CONFIG_URL } from '../../config/serviceConfig';
import { useConfig } from '../../contexts/ConfigContext';
import { AuthStackParamList } from '../../navigation/types';
import { useThemePreference } from '../../theme/ThemeProvider';

type Props = NativeStackScreenProps<AuthStackParamList, 'Landing'>;

const LandingScreen = ({ navigation }: Props) => {
  const { isDark, toggleTheme } = useThemePreference();
  const { fallbackMessage, config, manualUrl, setManualUrl, rediscover } = useConfig();
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const [dialogVisible, setDialogVisible] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [scanning, setScanning] = useState(false);

  const displayUrl = manualUrl || config.configServiceUrl || null;

  const handleSaveUrl = async () => {
    const trimmed = urlInput.trim().replace(/\/+$/, '');
    if (!trimmed) {
      Alert.alert('Error', 'Please enter a URL.');
      return;
    }
    setDialogVisible(false);
    await setManualUrl(trimmed);
  };

  const handleClearUrl = async () => {
    setDialogVisible(false);
    setUrlInput('');
    await setManualUrl(null);
  };

  const openDialog = () => {
    setUrlInput(manualUrl || '');
    setDialogVisible(true);
  };

  const handleScanNetwork = async () => {
    setScanning(true);
    await rediscover();
    setScanning(false);
  };

  const handleTryDemo = async () => {
    await setManualUrl(DEMO_CONFIG_URL);
  };

  return (
    <View style={styles.container}>
      {fallbackMessage && (
        <Banner
          visible
          icon="cloud-outline"
          style={[styles.banner, { marginTop: insets.top }]}
        >
          {fallbackMessage}
        </Banner>
      )}
      <View style={[styles.topBar, { top: insets.top + 8 }]}>
        <IconButton
          icon="server-network"
          onPress={openDialog}
          accessibilityLabel="Set server URL"
        />
        <IconButton
          icon={isDark ? 'weather-sunny' : 'weather-night'}
          onPress={toggleTheme}
          accessibilityLabel="Toggle dark mode"
        />
      </View>
      <View style={styles.content}>
        <Text variant="displaySmall" style={styles.title}>
          Jarvis
        </Text>
        <Text variant="bodyLarge" style={styles.subtitle}>
          Your home, your voice, fully private.
        </Text>
        {displayUrl ? (
          <Button
            mode="text"
            compact
            onPress={openDialog}
            icon="pencil-outline"
            labelStyle={{ fontSize: 12, color: theme.colors.onSurfaceVariant }}
            style={styles.serverUrl}
          >
            {displayUrl}
          </Button>
        ) : !config.configServiceUrl && (
          <Button
            mode="outlined"
            compact
            onPress={handleScanNetwork}
            icon="lan"
            loading={scanning}
            disabled={scanning}
            style={styles.serverUrl}
          >
            {scanning ? 'Scanning...' : 'Find Local Server'}
          </Button>
        )}
      </View>

      <View style={styles.buttons}>
        <Button
          mode="contained"
          onPress={() => navigation.navigate('Login')}
          style={styles.button}
        >
          Log In
        </Button>
        <Button
          mode="outlined"
          onPress={() => navigation.navigate('Register')}
          style={styles.button}
        >
          Create Account
        </Button>
        {!displayUrl && (
          <Button
            mode="text"
            compact
            onPress={handleTryDemo}
            labelStyle={{ fontSize: 12, color: theme.colors.onSurfaceVariant }}
          >
            Try Demo
          </Button>
        )}
      </View>

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={() => setDialogVisible(false)}>
          <Dialog.Title>Server URL</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodySmall" style={{ marginBottom: 12, color: theme.colors.onSurfaceVariant }}>
              Enter the URL of your Jarvis config service. Leave blank to auto-discover on your local network.
            </Text>
            <TextInput
              mode="outlined"
              label="Config Service URL"
              value={urlInput}
              onChangeText={setUrlInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="http://192.168.1.100:7700"
            />
          </Dialog.Content>
          <Dialog.Actions>
            {manualUrl && (
              <Button onPress={handleClearUrl} textColor={theme.colors.error}>
                Clear
              </Button>
            )}
            <Button onPress={() => setDialogVisible(false)}>Cancel</Button>
            <Button onPress={handleSaveUrl}>Save</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  topBar: {
    position: 'absolute',
    right: 8,
    flexDirection: 'row',
    zIndex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 16,
  },
  subtitle: {
    textAlign: 'center',
    opacity: 0.7,
    paddingHorizontal: 32,
  },
  serverUrl: {
    marginTop: 12,
  },
  buttons: {
    gap: 12,
    marginBottom: 32,
  },
  button: {},
  banner: {
    marginHorizontal: -24,
  },
});

export default LandingScreen;
