import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  Chip,
  Divider,
  SegmentedButtons,
  Text,
  TextInput,
} from 'react-native-paper';

import { useAuth } from '../../auth/AuthContext';
import { useConfig } from '../../contexts/ConfigContext';
import { useThemePreference, ThemePreference } from '../../theme/ThemeProvider';

const THEME_BUTTONS = [
  { value: 'light', label: 'Light', icon: 'white-balance-sunny' },
  { value: 'dark', label: 'Dark', icon: 'moon-waning-crescent' },
  { value: 'system', label: 'System', icon: 'cellphone' },
] as const;

const SettingsScreen = () => {
  const { state: authState, logout } = useAuth();
  const { config, isUsingCloud, manualUrl, rediscover, setManualUrl } =
    useConfig();
  const { paperTheme, themePreference, setThemePreference } = useThemePreference();

  const [urlInput, setUrlInput] = useState(manualUrl ?? '');
  const [saving, setSaving] = useState(false);

  const handleSaveUrl = async () => {
    const trimmed = urlInput.trim();
    if (trimmed && !trimmed.startsWith('http')) {
      Alert.alert('Invalid URL', 'URL must start with http:// or https://');
      return;
    }
    setSaving(true);
    try {
      await setManualUrl(trimmed || null);
    } catch {
      Alert.alert('Error', 'Failed to connect to that config service URL.');
    } finally {
      setSaving(false);
    }
  };

  const handleClearUrl = async () => {
    setUrlInput('');
    setSaving(true);
    try {
      await setManualUrl(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: paperTheme.colors.background }]} contentContainerStyle={styles.content}>
      <Text variant="headlineMedium" style={styles.title}>
        Settings
      </Text>

      {/* Account */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Account
          </Text>
          <Text variant="bodyMedium" style={styles.label}>
            {authState.user?.username || authState.user?.email}
          </Text>
          <Button
            mode="outlined"
            onPress={logout}
            style={styles.logoutButton}
          >
            Log Out
          </Button>
        </Card.Content>
      </Card>

      {/* Appearance */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Appearance
          </Text>
          <SegmentedButtons
            value={themePreference}
            onValueChange={(v) => setThemePreference(v as ThemePreference)}
            buttons={THEME_BUTTONS as unknown as Parameters<typeof SegmentedButtons>[0]['buttons']}
          />
        </Card.Content>
      </Card>

      {/* Connection Status */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Connection
          </Text>
          <View style={styles.statusRow}>
            <Text variant="bodyMedium">Status:</Text>
            <Chip
              compact
              icon={isUsingCloud ? 'cloud-outline' : 'lan'}
              style={styles.statusChip}
            >
              {isUsingCloud ? 'Cloud' : 'Local'}
            </Chip>
          </View>
          {config.configServiceUrl && (
            <Text variant="bodySmall" style={styles.urlText}>
              Config: {config.configServiceUrl}
            </Text>
          )}
          {config.authBaseUrl && (
            <Text variant="bodySmall" style={styles.urlText}>
              Auth: {config.authBaseUrl}
            </Text>
          )}
          {config.commandCenterUrl && (
            <Text variant="bodySmall" style={styles.urlText}>
              Command Center: {config.commandCenterUrl}
            </Text>
          )}
          <Button
            mode="outlined"
            onPress={rediscover}
            style={styles.rediscoverButton}
            icon="refresh"
          >
            Re-discover Services
          </Button>
        </Card.Content>
      </Card>

      {/* Manual Config URL */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Config Service URL
          </Text>
          <Text variant="bodySmall" style={styles.hint}>
            Override auto-discovery with a specific URL. Leave empty to
            auto-discover on the local network.
          </Text>
          <TextInput
            mode="outlined"
            label="Config Service URL"
            placeholder="http://192.168.1.100:7700"
            value={urlInput}
            onChangeText={setUrlInput}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
          />
          <View style={styles.urlActions}>
            <Button
              mode="contained"
              onPress={handleSaveUrl}
              loading={saving}
              disabled={saving}
              style={styles.saveButton}
            >
              Save & Connect
            </Button>
            {manualUrl && (
              <Button
                mode="text"
                onPress={handleClearUrl}
                disabled={saving}
              >
                Clear Override
              </Button>
            )}
          </View>
        </Card.Content>
      </Card>

      <Divider style={styles.divider} />
      <Text variant="bodySmall" style={styles.version}>
        Jarvis Mobile v0.1.0
      </Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  title: { fontWeight: 'bold', marginTop: 48, marginBottom: 16 },
  card: { marginBottom: 16 },
  sectionTitle: { fontWeight: '600', marginBottom: 8 },
  label: { opacity: 0.7, marginBottom: 8 },
  logoutButton: { alignSelf: 'flex-start', marginTop: 4 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  statusChip: {},
  urlText: { opacity: 0.5, marginBottom: 2, fontFamily: 'monospace' },
  rediscoverButton: { marginTop: 12, alignSelf: 'flex-start' },
  hint: { opacity: 0.5, marginBottom: 12 },
  input: { marginBottom: 12 },
  urlActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  saveButton: { flex: 0 },
  divider: { marginVertical: 16 },
  version: { textAlign: 'center', opacity: 0.4 },
});

export default SettingsScreen;
