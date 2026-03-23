import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Divider,
  HelperText,
  Icon,
  IconButton,
  Portal,
  SegmentedButtons,
  Switch,
  Text,
  TextInput,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';

import { useAuth } from '../../auth/AuthContext';
import authApi from '../../api/authApi';
import { useConfig } from '../../contexts/ConfigContext';
import { useThemePreference, ThemePreference } from '../../theme/ThemeProvider';
import {
  getSmartHomeConfig,
  updateSmartHomeConfig,
  type SmartHomeConfig,
} from '../../api/smartHomeApi';

import type { RootStackParamList } from '../../navigation/types';
import { AUTO_PLAY_TTS_KEY } from '../../config/storageKeys';
import {
  arePushNotificationsEnabled,
  setPushNotificationsEnabled,
} from '../../services/pushNotificationService';

const THEME_BUTTONS = [
  { value: 'light', label: 'Light', icon: 'white-balance-sunny' },
  { value: 'dark', label: 'Dark', icon: 'moon-waning-crescent' },
  { value: 'system', label: 'System', icon: 'cellphone' },
] as const;

const SettingsScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const theme = useTheme();
  const { state: authState, logout, switchHousehold, fetchHouseholds } = useAuth();
  const { config, isUsingCloud, manualUrl, rediscover, setManualUrl } =
    useConfig();
  const { paperTheme, themePreference, setThemePreference } = useThemePreference();

  const [urlInput, setUrlInput] = useState(manualUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [autoPlayTTS, setAutoPlayTTS] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);

  // Household join flow
  const [joinCode, setJoinCode] = useState('');
  const [joinStatus, setJoinStatus] = useState<{ valid: boolean; household_name: string | null } | null>(null);
  const [joinError, setJoinError] = useState('');

  // Household create flow
  const [newHouseholdName, setNewHouseholdName] = useState('');
  const [creatingHousehold, setCreatingHousehold] = useState(false);

  const handleValidateJoin = useCallback(async () => {
    const code = joinCode.trim();
    if (!code) { setJoinStatus(null); return; }
    try {
      const res = await authApi.get<{ valid: boolean; household_name: string | null }>(`/invites/${code}/validate`, {
        headers: { Authorization: `Bearer ${authState.accessToken}` },
      });
      setJoinStatus(res.data);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404 || status === 422) {
        setJoinStatus({ valid: false, household_name: null });
      } else {
        console.error('[SettingsScreen] Failed to validate invite code', err);
        setJoinError('Could not validate code. Check your connection.');
      }
    }
  }, [joinCode, authState.accessToken]);

  const handleJoinHousehold = useCallback(async () => {
    const code = joinCode.trim();
    if (!code) return;
    setJoinError('');
    try {
      await authApi.post('/households/join', { invite_code: code }, {
        headers: { Authorization: `Bearer ${authState.accessToken}` },
      });
      setJoinCode('');
      setJoinStatus(null);
      fetchHouseholds();
      Alert.alert('Joined!', 'You have joined the household.');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Failed to join';
      setJoinError(msg);
    }
  }, [joinCode, authState.accessToken, fetchHouseholds]);

  const handleCreateHousehold = useCallback(async () => {
    const name = newHouseholdName.trim();
    if (!name) return;
    setCreatingHousehold(true);
    try {
      await authApi.post('/households', { name }, {
        headers: { Authorization: `Bearer ${authState.accessToken}` },
      });
      setNewHouseholdName('');
      fetchHouseholds();
      Alert.alert('Created!', `Household "${name}" has been created.`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Failed to create household';
      Alert.alert('Error', msg);
    } finally {
      setCreatingHousehold(false);
    }
  }, [newHouseholdName, authState.accessToken, fetchHouseholds]);

  // Smart Home config (device manager + primary node)
  const [smartHomeConfig, setSmartHomeConfig] = useState<SmartHomeConfig | null>(null);
  const [smartHomeLoading, setSmartHomeLoading] = useState(false);

  const householdId = authState.activeHouseholdId;

  // Load settings
  useEffect(() => {
    AsyncStorage.getItem(AUTO_PLAY_TTS_KEY)
      .then((val) => setAutoPlayTTS(val === 'true'))
      .catch((err) => console.error('[SettingsScreen] Failed to load auto-play setting', err));
    arePushNotificationsEnabled()
      .then(setPushEnabled)
      .catch((err) => console.error('[SettingsScreen] Failed to load push setting', err));
  }, []);

  const handleAutoPlayToggle = useCallback(async (value: boolean) => {
    setAutoPlayTTS(value);
    try {
      await AsyncStorage.setItem(AUTO_PLAY_TTS_KEY, value ? 'true' : 'false');
    } catch (err) {
      console.error('[SettingsScreen] Failed to save auto-play setting', err);
    }
  }, []);

  const handlePushToggle = useCallback(async (value: boolean) => {
    setPushEnabled(value);
    await setPushNotificationsEnabled(value);
    if (!value) {
      Alert.alert(
        'Notifications Disabled',
        'Push notifications have been turned off. Restart the app for this to take full effect.',
      );
    }
  }, []);

  useEffect(() => {
    if (!householdId) return;
    setSmartHomeLoading(true);
    getSmartHomeConfig(householdId)
      .then(setSmartHomeConfig)
      .catch((err) => console.error('[SettingsScreen] Failed to load smart home config', err))
      .finally(() => setSmartHomeLoading(false));
  }, [householdId]);

  const handlePrimaryNodeChange = useCallback(
    async (newNodeId: string) => {
      if (!householdId || !smartHomeConfig) return;
      const prev = smartHomeConfig.primary_node_id;
      setSmartHomeConfig((c) => c ? { ...c, primary_node_id: newNodeId } : c);
      try {
        const updated = await updateSmartHomeConfig(householdId, { primary_node_id: newNodeId });
        setSmartHomeConfig((c) => c ? { ...c, ...updated } : c);
      } catch (err) {
        console.error('[SettingsScreen] Failed to update primary node', err);
        setSmartHomeConfig((c) => c ? { ...c, primary_node_id: prev } : c);
        Alert.alert('Error', 'Could not update primary node.');
      }
    },
    [householdId, smartHomeConfig],
  );

  const handleExternalDevicesToggle = useCallback(
    async (value: boolean) => {
      if (!householdId || !smartHomeConfig) return;
      const prev = smartHomeConfig.use_external_devices;
      setSmartHomeConfig((c) => c ? { ...c, use_external_devices: value } : c);
      try {
        const updated = await updateSmartHomeConfig(householdId, { use_external_devices: value });
        setSmartHomeConfig((c) => c ? { ...c, ...updated } : c);
      } catch (err) {
        console.error('[SettingsScreen] Failed to toggle external devices', err);
        setSmartHomeConfig((c) => c ? { ...c, use_external_devices: prev } : c);
        Alert.alert('Error', 'Could not update device management setting.');
      }
    },
    [householdId, smartHomeConfig],
  );

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
    } catch (err) {
      console.error('[SettingsScreen] Failed to clear config URL', err);
      Alert.alert('Error', 'Could not clear the config URL.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Portal.Host>
    <ScrollView style={[styles.container, { backgroundColor: paperTheme.colors.background }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text variant="headlineMedium" style={styles.title}>
          Settings
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton} testID="settings-close">
          <Icon source="close" size={24} color={theme.colors.onSurface} />
        </TouchableOpacity>
      </View>

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

      {/* Household */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Household
          </Text>

          {/* Household switcher */}
          {authState.households.length > 0 && (
            <>
              {authState.households.map((h) => {
                const isActive = h.id === authState.activeHouseholdId;
                return (
                  <View key={h.id} style={styles.radioRow} testID={`household-row-${h.id}`}>
                    <TouchableRipple
                      onPress={() => !isActive && switchHousehold(h.id)}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        <Icon
                          source={isActive ? 'radiobox-marked' : 'radiobox-blank'}
                          size={22}
                          color={isActive ? theme.colors.primary : theme.colors.onSurfaceVariant}
                        />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text variant="bodyMedium" style={{ fontWeight: '500' }} testID={`household-name-${h.id}`}>
                            {h.name}
                          </Text>
                          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} testID={`household-role-${h.id}`}>
                            {h.role.replace('_', ' ')}
                          </Text>
                        </View>
                      </View>
                    </TouchableRipple>
                    {(h.role === 'admin' || h.role === 'power_user') && (
                      <IconButton
                        icon="pencil"
                        size={18}
                        onPress={() => navigation.navigate('HouseholdEdit', { householdId: h.id, householdName: h.name })}
                        testID={`household-edit-${h.id}`}
                        accessibilityLabel="Edit household"
                      />
                    )}
                  </View>
                );
              })}
              <Divider style={{ marginVertical: 12 }} />
            </>
          )}

          {/* Join another household */}
          <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 4 }}>
            Join Another Household
          </Text>
          <TextInput
            mode="outlined"
            label="Invite Code"
            value={joinCode}
            onChangeText={(t) => { setJoinCode(t.toUpperCase()); setJoinStatus(null); setJoinError(''); }}
            onBlur={handleValidateJoin}
            maxLength={8}
            autoCapitalize="characters"
            autoCorrect={false}
            style={{ fontFamily: 'monospace', letterSpacing: 4, marginBottom: 4 }}
            testID="join-invite-code"
          />
          {joinStatus?.valid && (
            <HelperText type="info" visible style={{ color: theme.colors.primary }}>
              You'll join: {joinStatus.household_name}
            </HelperText>
          )}
          {joinStatus && !joinStatus.valid && (
            <HelperText type="error" visible>
              Invalid or expired invite code
            </HelperText>
          )}
          {joinError ? <HelperText type="error" visible>{joinError}</HelperText> : null}
          <Button
            mode="contained"
            onPress={handleJoinHousehold}
            disabled={!joinStatus?.valid}
            style={{ alignSelf: 'flex-start', marginTop: 4 }}
            testID="join-household-button"
          >
            Join
          </Button>

          {/* Create new household */}
          <Text variant="titleSmall" style={{ fontWeight: '600', marginTop: 16, marginBottom: 4 }}>
            Create New Household
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput
              mode="outlined"
              label="Household name"
              value={newHouseholdName}
              onChangeText={setNewHouseholdName}
              dense
              style={{ flex: 1 }}
              onSubmitEditing={handleCreateHousehold}
            />
            <Button
              mode="contained"
              onPress={handleCreateHousehold}
              loading={creatingHousehold}
              disabled={!newHouseholdName.trim() || creatingHousehold}
              compact
            >
              Create
            </Button>
          </View>
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

      {/* Chat */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Chat
          </Text>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text variant="bodyMedium">Auto-play responses</Text>
              <Text variant="bodySmall" style={styles.hint}>
                Automatically speak Jarvis responses aloud
              </Text>
            </View>
            <Switch
              value={autoPlayTTS}
              onValueChange={handleAutoPlayToggle}
              testID={autoPlayTTS ? 'auto-play-on' : 'auto-play-off'}
            />
          </View>
        </Card.Content>
      </Card>

      {/* Privacy */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Privacy
          </Text>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text variant="bodyMedium">Push notifications</Text>
              <Text variant="bodySmall" style={styles.hint}>
                When enabled, alerts are delivered through Expo's push service. Disable for a fully local experience.
              </Text>
            </View>
            <Switch
              value={pushEnabled}
              onValueChange={handlePushToggle}
            />
          </View>
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

      {/* Smart Home */}
      {householdId && (
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Smart Home
            </Text>

            {smartHomeLoading ? (
              <ActivityIndicator size="small" style={{ marginVertical: 12 }} />
            ) : smartHomeConfig ? (
              <>
                {/* Primary Node */}
                {smartHomeConfig.nodes.length > 0 && (
                  <>
                    <Divider style={{ marginVertical: 12 }} />
                    <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 4 }}>
                      Primary Node
                    </Text>
                    <Text variant="bodySmall" style={[styles.hint, { marginBottom: 8 }]}>
                      The node that handles device discovery for your household
                    </Text>
                    {smartHomeConfig.nodes.map((node, i, arr) => {
                      const isSelected = node.node_id === smartHomeConfig.primary_node_id;
                      const label = node.room
                        ? `${node.room} (${node.node_id.slice(0, 8)}…)`
                        : node.node_id.slice(0, 16) + '…';
                      return (
                        <View key={node.node_id}>
                          <TouchableRipple onPress={() => handlePrimaryNodeChange(node.node_id)}>
                            <View style={styles.radioRow}>
                              <Icon
                                source={isSelected ? 'radiobox-marked' : 'radiobox-blank'}
                                size={22}
                                color={isSelected ? theme.colors.primary : theme.colors.onSurfaceVariant}
                              />
                              <Text variant="bodyMedium" style={{ flex: 1, marginLeft: 12, fontWeight: '500' }}>
                                {label}
                              </Text>
                            </View>
                          </TouchableRipple>
                          {i < arr.length - 1 && <Divider style={{ marginVertical: 2 }} />}
                        </View>
                      );
                    })}
                  </>
                )}

                {/* Use External Devices toggle */}
                <Divider style={{ marginVertical: 12 }} />
                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium">Use External Devices</Text>
                    <Text variant="bodySmall" style={styles.hint}>
                      Show devices from your device manager (read-only)
                    </Text>
                  </View>
                  <Switch
                    value={smartHomeConfig.use_external_devices}
                    onValueChange={handleExternalDevicesToggle}
                    testID="use-external-devices-toggle"
                  />
                </View>
              </>
            ) : (
              <Text variant="bodySmall" style={styles.hint}>
                Could not load smart home settings
              </Text>
            )}
          </Card.Content>
        </Card>
      )}

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

    </Portal.Host>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 48,
    marginBottom: 16,
  },
  closeButton: { padding: 4 },
  title: { fontWeight: 'bold' },
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  hint: { opacity: 0.5, marginBottom: 12 },
  input: { marginBottom: 12 },
  urlActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  saveButton: { flex: 0 },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  divider: { marginVertical: 16 },
  version: { textAlign: 'center', opacity: 0.4 },
});

export default SettingsScreen;
