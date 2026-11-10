import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import {
  Banner,
  Button,
  Dialog,
  HelperText,
  IconButton,
  Portal,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../../auth/AuthContext';
import { useConfig } from '../../contexts/ConfigContext';
import { AuthStackParamList } from '../../navigation/types';
import { useThemePreference } from '../../theme/ThemeProvider';

type Props = NativeStackScreenProps<AuthStackParamList, 'Landing'>;

const LandingScreen = ({ navigation }: Props) => {
  const { isDark, toggleTheme } = useThemePreference();
  const { fallbackMessage, config, manualUrl, setManualUrl } = useConfig();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const signOutNotice = useAuth().state.signOutNotice;

  // The app signed the user out on its own (password reset, dead session):
  // skip the landing page and put them on Login, where the notice explains
  // why. Once per notice, so backing out to Landing isn't bounced again.
  useEffect(() => {
    if (signOutNotice) navigation.navigate('Login');
  }, [signOutNotice, navigation]);

  const [dialogVisible, setDialogVisible] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlMissing, setUrlMissing] = useState(false);

  const displayUrl = manualUrl || config.configServiceUrl || null;

  const handleSaveUrl = async () => {
    const trimmed = urlInput.trim().replace(/\/+$/, '');
    if (!trimmed) {
      Alert.alert('Error', 'Please enter a URL.');
      return;
    }
    if (!/^https?:\/\//.test(trimmed)) {
      Alert.alert('Invalid URL', 'URL must start with http:// or https://');
      return;
    }
    setDialogVisible(false);
    setUrlMissing(false);
    await setManualUrl(trimmed);
  };

  const handleClearUrl = async () => {
    setDialogVisible(false);
    setUrlInput('');
    await setManualUrl(null);
  };

  const openDialog = () => {
    setUrlInput(displayUrl || '');
    setDialogVisible(true);
  };

  // Log In and Create Account need a server to talk to.
  const goTo = (screen: 'Login' | 'Register') => {
    if (!displayUrl) {
      setUrlMissing(true);
      return;
    }
    navigation.navigate(screen);
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
            testID="server-url-button"
            mode="text"
            compact
            onPress={openDialog}
            icon="pencil-outline"
            labelStyle={{ fontSize: 12, color: theme.colors.onSurfaceVariant }}
            style={styles.serverUrl}
          >
            {displayUrl}
          </Button>
        ) : (
          <Button
            testID="server-url-button"
            mode="outlined"
            compact
            onPress={openDialog}
            icon="server-network"
            style={styles.serverUrl}
          >
            Set Server URL
          </Button>
        )}
        {urlMissing && !displayUrl && (
          <HelperText type="error" visible>
            Enter your server URL first.
          </HelperText>
        )}
      </View>

      <View style={styles.buttons}>
        <Button
          testID="landing-login-button"
          mode="contained"
          onPress={() => goTo('Login')}
          style={styles.button}
        >
          Log In
        </Button>
        <Button
          testID="landing-register-button"
          mode="outlined"
          onPress={() => goTo('Register')}
          style={styles.button}
        >
          Create Account
        </Button>
      </View>

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={() => setDialogVisible(false)}>
          <Dialog.Title>Server URL</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodySmall" style={{ marginBottom: 12, color: theme.colors.onSurfaceVariant }}>
              Enter the URL of your Jarvis server's config service.
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
