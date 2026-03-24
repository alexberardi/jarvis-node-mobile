import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import {
  Appbar,
  ActivityIndicator,
  Button,
  Checkbox,
  Divider,
  Icon,
  Menu,
  Modal,
  Portal,
  Surface,
  Switch,
  Text,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';
import Markdown from 'react-native-markdown-display';

import { useAuth } from '../../auth/AuthContext';
import { NodesStackParamList } from '../../navigation/types';
import {
  requestSettingsSnapshot,
  pollSettingsResult,
} from '../../api/nodeSettingsApi';
import {
  decryptSettingsSnapshot,
  CommandSettingsEntry,
  CommandSecretEntry,
  DeviceFamilyEntry,
} from '../../services/settingsDecryptService';
import { listNodes, NodeInfo } from '../../api/nodeApi';
import { hasK2, generateK2, storeK2 } from '../../services/k2Service';
import { provisionK2ToNode } from '../../api/nodeSettingsApi';
import SecretEditDialog from '../../components/SecretEditDialog';
import { encryptAndPushConfig } from '../../services/configPushService';
import type { AuthenticationConfig } from '../../types/SmartHome';

type ScreenRoute = RouteProp<NodesStackParamList, 'NodeSettings'>;

type LoadState = 'loading' | 'loaded' | 'error' | 'timeout' | 'needs_k2';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 30000;

/** A group of deduplicated secrets + optional auth, keyed by service name. */
interface ServiceGroup {
  serviceName: string;
  secrets: CommandSecretEntry[];
  auth?: AuthenticationConfig;
  authUrlSecret?: CommandSecretEntry;
  setupGuide?: string;
  commands: string[];
  /** Maps command_name (raw) to enabled state */
  commandStates: Record<string, boolean>;
}

const NodeSettingsScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<NodesStackParamList>>();
  const route = useRoute<ScreenRoute>();
  const theme = useTheme();
  const { state: authState } = useAuth();
  const { nodeId, room } = route.params;

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [commands, setCommands] = useState<CommandSettingsEntry[]>([]);
  const [deviceFamilies, setDeviceFamilies] = useState<DeviceFamilyEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Secret edit dialog state
  const [editingSecret, setEditingSecret] = useState<{
    key: string;
    description: string;
    valueType: string;
    isSet: boolean;
    currentValue?: string;
  } | null>(null);

  // Track enabled/disabled state per command (keyed by raw command_name)
  const [commandStates, setCommandStates] = useState<Record<string, boolean>>({});

  // Setup guide modal
  const [guideContent, setGuideContent] = useState<{ title: string; markdown: string } | null>(null);

  // Ellipsis menu state (which group's menu is open)
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  // Sync flow state
  const [householdNodes, setHouseholdNodes] = useState<(NodeInfo & { hasK2: boolean })[]>([]);
  const [syncGroup, setSyncGroup] = useState<ServiceGroup | null>(null);
  const [syncStep, setSyncStep] = useState<'nodes' | 'secrets' | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [selectedSecretKeys, setSelectedSecretKeys] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);

  // Group commands by associated_service, dedup secrets within each group
  const serviceGroups = useMemo(() => {
    const groupMap = new Map<string, ServiceGroup>();

    for (const cmd of commands) {
      const serviceName =
        cmd.associated_service ??
        cmd.command_name.replace(/_/g, ' ');

      let group = groupMap.get(serviceName);
      if (!group) {
        group = { serviceName, secrets: [], commands: [], commandStates: {}, auth: undefined, setupGuide: undefined };
        groupMap.set(serviceName, group);
      }

      // Take first setup guide for the group
      if (cmd.setup_guide && !group.setupGuide) {
        group.setupGuide = cmd.setup_guide;
      }

      // Dedup secrets by key within the group
      const existingKeys = new Set(group.secrets.map((s) => s.key));
      for (const secret of cmd.secrets) {
        if (!existingKeys.has(secret.key)) {
          group.secrets.push(secret);
          existingKeys.add(secret.key);
        }
      }

      // Take first auth config for the group
      if (cmd.authentication && !group.auth) {
        group.auth = cmd.authentication;
        group.authUrlSecret = cmd.secrets.find(
          (s) => (s.key.endsWith('_REST_URL') || s.key.endsWith('_URL')) && s.is_set && s.value,
        );
      }

      const displayName = cmd.command_name.replace(/_/g, ' ');
      if (!group.commands.includes(displayName)) {
        group.commands.push(displayName);
      }

      // Track enabled state per raw command_name
      group.commandStates[cmd.command_name] = commandStates[cmd.command_name] !== false;
    }

    // Sort: integrations with secrets on top, then integrations without secrets,
    // then standalone commands without secrets at the bottom
    const groups = Array.from(groupMap.values());
    groups.sort((a, b) => {
      const aHasSecrets = a.secrets.length > 0;
      const bHasSecrets = b.secrets.length > 0;
      const aIsGroup = Object.keys(a.commandStates).length > 1;
      const bIsGroup = Object.keys(b.commandStates).length > 1;

      // Tier: 0 = has secrets (complex), 1 = multi-command group (integration),
      //        2 = standalone (simple)
      const tierA = aHasSecrets ? 0 : aIsGroup ? 1 : 2;
      const tierB = bHasSecrets ? 0 : bIsGroup ? 1 : 2;

      if (tierA !== tierB) return tierA - tierB;
      return a.serviceName.localeCompare(b.serviceName);
    });

    return groups;
  }, [commands, commandStates]);

  const cleanup = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const [provisioningK2, setProvisioningK2] = useState(false);

  const provisionAndLoad = useCallback(async () => {
    setProvisioningK2(true);
    try {
      const keyPair = await generateK2(nodeId);
      await provisionK2ToNode(nodeId, keyPair.k2, keyPair.kid, keyPair.createdAt);
      await storeK2(keyPair);
      // Small delay for node to process K2
      await new Promise((r) => setTimeout(r, 1000));
      setLoadState('loading');
      loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to provision encryption key');
      setLoadState('error');
    } finally {
      setProvisioningK2(false);
    }
  }, [nodeId]);

  const loadSettings = useCallback(async () => {
    const token = authState.accessToken;
    if (!token) {
      setError('Not authenticated');
      setLoadState('error');
      return;
    }

    // Check if we have K2 for this node
    const k2Exists = await hasK2(nodeId);
    if (!k2Exists) {
      setLoadState('needs_k2');
      return;
    }

    setError(null);
    setLoadState('loading');

    try {
      const { request_id } = await requestSettingsSnapshot(nodeId);
      const startTime = Date.now();

      const poll = async () => {
        if (Date.now() - startTime > POLL_TIMEOUT_MS) {
          setError('Node did not respond in time. Is it online?');
          setLoadState('timeout');
          return;
        }

        try {
          const result = await pollSettingsResult(nodeId, request_id);

          if (result.status === 'fulfilled' && result.snapshot) {
            try {
              const snapshot = await decryptSettingsSnapshot(
                nodeId,
                result.snapshot.ciphertext,
                result.snapshot.nonce,
                result.snapshot.tag,
              );
              setCommands(snapshot.commands);
              setDeviceFamilies(snapshot.device_families ?? []);
              const states: Record<string, boolean> = {};
              for (const cmd of snapshot.commands) {
                states[cmd.command_name] = cmd.enabled !== false;
              }
              setCommandStates(states);
              setLoadState('loaded');
            } catch (decryptErr) {
              console.error('Settings decryption failed:', decryptErr);
              setError(
                'Failed to decrypt settings: ' +
                  (decryptErr instanceof Error ? decryptErr.message : String(decryptErr)),
              );
              setLoadState('error');
            }
            return;
          }

          // Still pending — poll again
          pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        } catch {
          // 202 responses may throw in some axios configs — treat as pending
          pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      };

      await poll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request settings');
      setLoadState('error');
    }
  }, [nodeId, authState.accessToken]);

  useEffect(() => {
    loadSettings();
    return cleanup;
  }, [loadSettings, cleanup]);

  // Refresh settings when returning from auth screen
  const hasNavigatedAwayRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (hasNavigatedAwayRef.current) {
        cleanup();
        loadSettings();
      }
      return () => {
        hasNavigatedAwayRef.current = true;
      };
    }, [loadSettings, cleanup]),
  );

  const handleRefresh = useCallback(async () => {
    cleanup();
    await loadSettings();
  }, [loadSettings, cleanup]);

  const handleSecretPress = (secret: CommandSecretEntry) => {
    setEditingSecret({
      key: secret.key,
      description: secret.description,
      valueType: secret.value_type,
      isSet: secret.is_set,
      currentValue: !secret.is_sensitive ? secret.value : undefined,
    });
  };

  const handleSecretSaved = () => {
    setEditingSecret(null);
    cleanup();
    loadSettings();
  };

  const handleAuthenticate = (group: ServiceGroup) => {
    if (!group.auth || !authState.accessToken) return;

    navigation.navigate('IntegrationAuth', {
      authConfig: JSON.stringify(group.auth),
      nodeId,
      accessToken: authState.accessToken,
      providerBaseUrl: group.authUrlSecret?.value,
    });
  };

  const handleScanForDevices = () => {
    // Navigate to SmartHomeSetup navigator > DeviceDiscovery screen
    (navigation as any).navigate('SmartHomeSetup', {
      screen: 'DeviceDiscovery',
      params: { nodeId },
    });
  };

  const handleAuthenticateFamily = (family: DeviceFamilyEntry) => {
    if (!family.authentication || !authState.accessToken) return;

    navigation.navigate('IntegrationAuth', {
      authConfig: JSON.stringify(family.authentication),
      nodeId,
      accessToken: authState.accessToken,
    });
  };

  const handleToggleCommand = useCallback(
    async (commandName: string, enabled: boolean) => {
      const token = authState.accessToken;
      if (!token) return;

      // Optimistic update
      setCommandStates((prev) => ({ ...prev, [commandName]: enabled }));

      try {
        await encryptAndPushConfig(nodeId, 'command_registry', {
          command_name: commandName,
          enabled: enabled ? 'true' : 'false',
        });
      } catch (err) {
        console.error('Failed to toggle command:', err);
        // Revert on error
        setCommandStates((prev) => ({ ...prev, [commandName]: !enabled }));
      }
    },
    [nodeId, authState.accessToken],
  );

  const handleToggleGroup = useCallback(
    (group: ServiceGroup, enabled: boolean) => {
      const rawNames = Object.keys(group.commandStates);
      for (const name of rawNames) {
        handleToggleCommand(name, enabled);
      }
    },
    [handleToggleCommand],
  );

  // ── Sync flow handlers ──────────────────────────────────────────────

  const startSyncFlow = useCallback(async (group: ServiceGroup) => {
    setOpenMenu(null);
    setSyncGroup(group);

    // Fetch sibling nodes in the household
    try {
      const hId = authState.activeHouseholdId;
      const allNodes = await listNodes(hId ?? undefined);
      const siblings = allNodes.filter((n) => n.node_id !== nodeId);

      // Check which siblings have K2 on this device
      const withK2 = await Promise.all(
        siblings.map(async (n) => ({
          ...n,
          hasK2: await hasK2(n.node_id),
        })),
      );
      setHouseholdNodes(withK2);

      // Pre-select all nodes that have K2
      setSelectedNodeIds(new Set(withK2.filter((n) => n.hasK2).map((n) => n.node_id)));
      setSyncStep('nodes');
    } catch {
      Alert.alert('Error', 'Could not load household nodes');
    }
  }, [authState.activeHouseholdId, nodeId]);

  const handleNodeSelectionDone = useCallback(() => {
    if (selectedNodeIds.size === 0) {
      Alert.alert('No Nodes Selected', 'Select at least one node to sync to.');
      return;
    }
    if (!syncGroup) return;

    // Pre-select all secrets that have values
    const setSecrets = syncGroup.secrets.filter((s) => s.is_set).map((s) => s.key);
    setSelectedSecretKeys(new Set(setSecrets));
    setSyncStep('secrets');
  }, [selectedNodeIds, syncGroup]);

  const handleSyncExecute = useCallback(async () => {
    if (!syncGroup || selectedNodeIds.size === 0 || selectedSecretKeys.size === 0) return;

    setSyncing(true);

    // Build the secrets map from the current snapshot
    const secretsMap: Record<string, string> = {};
    for (const secret of syncGroup.secrets) {
      if (selectedSecretKeys.has(secret.key) && secret.value) {
        secretsMap[secret.key] = secret.value;
      }
    }

    // Check if we have sensitive secrets that need include_values
    const hasMissingSensitiveValues = syncGroup.secrets.some(
      (s) => selectedSecretKeys.has(s.key) && s.is_set && !s.value && s.is_sensitive,
    );

    if (hasMissingSensitiveValues) {
      // Re-request snapshot with include_values to get sensitive values
      try {
        const { request_id } = await requestSettingsSnapshot(nodeId, true);
        // Poll for result
        let attempts = 0;
        while (attempts < 15) {
          await new Promise((r) => setTimeout(r, 2000));
          const result = await pollSettingsResult(nodeId, request_id);
          if (result.status === 'fulfilled' && result.snapshot) {
            const snapshot = await decryptSettingsSnapshot(
              nodeId,
              result.snapshot.ciphertext,
              result.snapshot.nonce,
              result.snapshot.tag,
            );
            // Extract values from the full snapshot
            for (const cmd of snapshot.commands) {
              for (const secret of cmd.secrets) {
                if (selectedSecretKeys.has(secret.key) && secret.value) {
                  secretsMap[secret.key] = secret.value;
                }
              }
            }
            break;
          }
          attempts++;
        }
      } catch (err) {
        console.error('Failed to fetch full snapshot for sync:', err);
      }
    }

    if (Object.keys(secretsMap).length === 0) {
      Alert.alert('Nothing to Sync', 'No secret values available to sync.');
      setSyncing(false);
      return;
    }

    // Push to each selected node
    let successCount = 0;
    let failCount = 0;
    for (const targetNodeId of selectedNodeIds) {
      try {
        await encryptAndPushConfig(targetNodeId, 'settings:secrets', secretsMap);
        successCount++;
      } catch (err) {
        console.error(`Sync to ${targetNodeId} failed:`, err);
        failCount++;
      }
    }

    setSyncing(false);
    setSyncStep(null);
    setSyncGroup(null);

    if (failCount === 0) {
      Alert.alert('Sync Complete', `Settings synced to ${successCount} node${successCount > 1 ? 's' : ''}.`);
    } else {
      Alert.alert('Sync Partial', `${successCount} succeeded, ${failCount} failed. Nodes without imported K2 keys cannot receive synced settings.`);
    }
  }, [syncGroup, selectedNodeIds, selectedSecretKeys, nodeId]);

  const toggleNodeSelection = (nid: string) => {
    setSelectedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nid)) next.delete(nid);
      else next.add(nid);
      return next;
    });
  };

  const toggleSecretSelection = (key: string) => {
    setSelectedSecretKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Render helpers ─────────────────────────────────────────────────

  const renderSecretRow = (secret: CommandSecretEntry, isLast: boolean, disabled: boolean = false) => {
    const isSet = secret.is_set;
    const iconName = isSet ? 'check-circle' : secret.required ? 'alert-circle' : 'circle-outline';
    const iconColor = isSet
      ? theme.colors.primary
      : secret.required
        ? theme.colors.error
        : theme.colors.outlineVariant;

    const valuePreview = !secret.is_sensitive && secret.value
      ? secret.value
      : undefined;

    return (
      <View key={secret.key} style={disabled ? { opacity: 0.4 } : undefined}>
        <TouchableRipple onPress={() => handleSecretPress(secret)} disabled={disabled}>
          <View style={styles.secretRow}>
            <Icon source={iconName} size={20} color={iconColor} />
            <View style={styles.secretInfo}>
              <Text variant="bodyMedium" style={{ fontWeight: '500' }}>
                {secret.friendly_name ?? secret.key}
              </Text>
              {valuePreview ? (
                <Text
                  variant="bodySmall"
                  numberOfLines={1}
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  {valuePreview}
                </Text>
              ) : (
                <Text
                  variant="bodySmall"
                  style={{ color: isSet ? theme.colors.onSurfaceVariant : iconColor }}
                >
                  {isSet ? 'Configured' : secret.required ? 'Required' : 'Optional'}
                </Text>
              )}
            </View>
            <Icon source="chevron-right" size={20} color={theme.colors.outlineVariant} />
          </View>
        </TouchableRipple>
        {!isLast && <Divider />}
      </View>
    );
  };

  const renderServiceGroup = (group: ServiceGroup) => {
    const allSet = group.secrets.every((s) => s.is_set);
    const rawNames = Object.keys(group.commandStates);
    const groupEnabled = rawNames.some((n) => commandStates[n] !== false);
    const hasMultipleCommands = rawNames.length > 1;
    const menuKey = group.serviceName;
    const hasConfiguredSecrets = group.secrets.some((s) => s.is_set);

    return (
      <View key={group.serviceName} style={styles.groupContainer}>
        <View style={styles.groupHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}>
            <Icon
              source={groupEnabled ? 'check-circle' : 'circle-outline'}
              size={20}
              color={groupEnabled ? (allSet ? theme.colors.primary : theme.colors.onSurfaceVariant) : theme.colors.outlineVariant}
            />
            <Text variant="titleMedium" style={{ fontWeight: '600' }}>
              {group.serviceName}
            </Text>
          </View>
          <Menu
            visible={openMenu === menuKey}
            onDismiss={() => setOpenMenu(null)}
            anchor={
              <TouchableRipple onPress={() => setOpenMenu(menuKey)} style={styles.menuAnchor}>
                <Icon source="dots-vertical" size={22} color={theme.colors.onSurfaceVariant} />
              </TouchableRipple>
            }
          >
            <Menu.Item
              leadingIcon={groupEnabled ? 'close-circle-outline' : 'check-circle-outline'}
              title={groupEnabled ? 'Disable' : 'Enable'}
              onPress={() => {
                setOpenMenu(null);
                handleToggleGroup(group, !groupEnabled);
              }}
            />
            {hasConfiguredSecrets && householdNodes.length > 0 ? (
              <Menu.Item
                leadingIcon="sync"
                title="Sync to other nodes"
                onPress={() => startSyncFlow(group)}
              />
            ) : hasConfiguredSecrets ? (
              <Menu.Item
                leadingIcon="sync"
                title="Sync to other nodes"
                onPress={async () => {
                  setOpenMenu(null);
                  // Lazy-load household nodes to check if there are any
                  const hId = authState.activeHouseholdId;
                  const allNodes = await listNodes(hId ?? undefined);
                  const siblings = allNodes.filter((n) => n.node_id !== nodeId);
                  if (siblings.length === 0) {
                    Alert.alert('No Other Nodes', 'This is the only node in the household.');
                  } else {
                    // Store and start flow
                    const withK2 = await Promise.all(
                      siblings.map(async (n) => ({
                        ...n,
                        hasK2: await hasK2(n.node_id),
                      })),
                    );
                    setHouseholdNodes(withK2);
                    setSelectedNodeIds(new Set(withK2.filter((n) => n.hasK2).map((n) => n.node_id)));
                    setSyncGroup(group);
                    setSyncStep('nodes');
                  }
                }}
              />
            ) : null}
          </Menu>
        </View>

        {groupEnabled && hasMultipleCommands && (
          <Surface
            style={[
              styles.commandToggleCard,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            {rawNames.map((name, i) => (
              <View key={name}>
                <View style={styles.commandToggleRow}>
                  <Text variant="bodyMedium" style={{ flex: 1 }}>
                    {name.replace(/_/g, ' ')}
                  </Text>
                  <Switch
                    value={commandStates[name] !== false}
                    onValueChange={(val) => handleToggleCommand(name, val)}
                  />
                </View>
                {i < rawNames.length - 1 && <Divider />}
              </View>
            ))}
          </Surface>
        )}

        {group.secrets.length > 0 && (
          <Surface
            style={[
              styles.groupCard,
              { backgroundColor: theme.colors.surfaceVariant },
              !groupEnabled && styles.disabledCard,
            ]}
          >
            {group.secrets.map((secret, i) =>
              renderSecretRow(secret, i === group.secrets.length - 1, !groupEnabled),
            )}
          </Surface>
        )}

        {group.setupGuide && groupEnabled && (
          <Button
            mode="text"
            icon="help-circle-outline"
            onPress={() => setGuideContent({ title: group.serviceName, markdown: group.setupGuide! })}
            style={styles.setupGuideButton}
            compact
          >
            Setup Help
          </Button>
        )}

        {group.auth && groupEnabled && (
          <Button
            mode="contained-tonal"
            icon="login"
            onPress={() => handleAuthenticate(group)}
            style={styles.authButton}
          >
            Authenticate with {group.auth.friendly_name ?? group.auth.provider ?? 'Provider'}
          </Button>
        )}
      </View>
    );
  };

  const connectionTypeIcon = (type: string) => {
    switch (type) {
      case 'lan': return 'wifi';
      case 'cloud': return 'cloud';
      case 'hybrid': return 'cloud-sync';
      default: return 'devices';
    }
  };

  const renderDeviceFamilyCard = (family: DeviceFamilyEntry) => {
    const hasSecrets = family.secrets.length > 0;

    return (
      <View key={family.family_name} style={styles.groupContainer}>
        <View style={styles.groupHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}>
            <Icon source={connectionTypeIcon(family.connection_type)} size={20} color={theme.colors.onSurfaceVariant} />
            <Text variant="titleMedium" style={{ fontWeight: '600' }}>
              {family.friendly_name}
            </Text>
            {family.is_configured && (
              <Icon source="check-circle" size={18} color={theme.colors.primary} />
            )}
          </View>
        </View>

        {family.description ? (
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8, paddingHorizontal: 4 }}
          >
            {family.description}
          </Text>
        ) : null}

        {hasSecrets ? (
          <Surface
            style={[
              styles.groupCard,
              { backgroundColor: theme.colors.surfaceVariant },
            ]}
          >
            {family.secrets.map((secret, i) =>
              renderSecretRow(secret, i === family.secrets.length - 1),
            )}
          </Surface>
        ) : (
          <Surface
            style={[
              styles.groupCard,
              { backgroundColor: theme.colors.surfaceVariant, padding: 16 },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon source="check-circle" size={18} color={theme.colors.primary} />
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                Ready (no configuration needed)
              </Text>
            </View>
          </Surface>
        )}

        {family.authentication && (
          <Button
            mode="contained-tonal"
            icon="login"
            onPress={() => handleAuthenticateFamily(family)}
            style={styles.authButton}
          >
            Authenticate with {family.authentication.friendly_name ?? family.authentication.provider ?? 'Provider'}
          </Button>
        )}
      </View>
    );
  };

  const headerTitle = room ? `${room} Settings` : 'Node Settings';

  const renderContent = () => {
    if (loadState === 'needs_k2') {
      return (
        <View style={styles.center}>
          <Icon source="key-variant" size={48} color={theme.colors.primary} />
          <Text variant="titleMedium" style={{ marginTop: 16, marginBottom: 8 }}>
            Encryption Key Required
          </Text>
          <Text variant="bodyMedium" style={{ textAlign: 'center', opacity: 0.7, marginBottom: 20, paddingHorizontal: 24 }}>
            This node doesn't have an encryption key yet. Generate one to securely view and edit settings.
          </Text>
          <Button
            mode="contained"
            onPress={provisionAndLoad}
            loading={provisioningK2}
            disabled={provisioningK2}
          >
            Generate Encryption Key
          </Button>
        </View>
      );
    }

    if (loadState === 'loading') {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Requesting settings from node...</Text>
        </View>
      );
    }

    if (loadState === 'error' || loadState === 'timeout') {
      return (
        <View style={styles.center}>
          <Text
            variant="bodyLarge"
            style={{ color: theme.colors.error, textAlign: 'center', marginBottom: 16 }}
          >
            {error}
          </Text>
          <Button mode="contained" onPress={handleRefresh}>
            Retry
          </Button>
        </View>
      );
    }

    if (commands.length === 0) {
      return (
        <View style={styles.center}>
          <Text variant="bodyLarge" style={{ opacity: 0.6 }}>
            No commands with configurable settings.
          </Text>
        </View>
      );
    }

    const commandSecrets = serviceGroups.flatMap((g) => g.secrets);
    const familySecrets = deviceFamilies.flatMap((f) => f.secrets);
    const allSecrets = [...commandSecrets, ...familySecrets];
    const allConfigured = allSecrets.length > 0 && allSecrets.every((s) => s.is_set);
    const missingRequired = allSecrets.filter((s) => s.required && !s.is_set);

    return (
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={undefined}
      >
        {/* Status banner */}
        {allConfigured ? (
          <Surface style={[styles.banner, { backgroundColor: theme.colors.primaryContainer }]}>
            <Icon source="check-circle" size={18} color={theme.colors.primary} />
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onPrimaryContainer, marginLeft: 8, flex: 1 }}
            >
              All settings configured
            </Text>
          </Surface>
        ) : missingRequired.length > 0 ? (
          <Surface style={[styles.banner, { backgroundColor: theme.colors.errorContainer }]}>
            <Icon source="alert-circle" size={18} color={theme.colors.error} />
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onErrorContainer, marginLeft: 8, flex: 1 }}
            >
              {missingRequired.length} required setting{missingRequired.length > 1 ? 's' : ''} not configured
            </Text>
          </Surface>
        ) : null}

        {serviceGroups.map(renderServiceGroup)}

        {deviceFamilies.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text variant="titleSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>
                Device Integrations
              </Text>
            </View>
            {deviceFamilies.map(renderDeviceFamilyCard)}
            <View style={styles.scanButtonContainer}>
              <Button
                mode="contained-tonal"
                icon="radar"
                onPress={handleScanForDevices}
              >
                Scan for Devices
              </Button>
            </View>
          </>
        )}

      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={headerTitle} />
      </Appbar.Header>

      {renderContent()}

      {editingSecret && authState.accessToken && (
        <SecretEditDialog
          visible
          onDismiss={() => setEditingSecret(null)}
          onSaved={handleSecretSaved}
          nodeId={nodeId}
          accessToken={authState.accessToken}
          secretKey={editingSecret.key}
          description={editingSecret.description}
          valueType={editingSecret.valueType}
          isSet={editingSecret.isSet}
          currentValue={editingSecret.currentValue}
        />
      )}

      {/* Sync: Node Picker Modal */}
      <Portal>
        <Modal
          visible={syncStep === 'nodes'}
          onDismiss={() => { setSyncStep(null); setSyncGroup(null); }}
          contentContainerStyle={[styles.guideModal, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="titleLarge" style={{ fontWeight: '600', marginBottom: 4 }}>
            Sync to Other Nodes
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
            Select which nodes should receive {syncGroup?.serviceName} settings.
          </Text>

          <ScrollView style={{ maxHeight: 300 }}>
            {householdNodes.map((n) => (
              <TouchableRipple
                key={n.node_id}
                onPress={() => n.hasK2 && toggleNodeSelection(n.node_id)}
                disabled={!n.hasK2}
              >
                <View style={[styles.syncRow, !n.hasK2 && { opacity: 0.4 }]}>
                  <Checkbox.Android
                    status={selectedNodeIds.has(n.node_id) ? 'checked' : 'unchecked'}
                    onPress={() => n.hasK2 && toggleNodeSelection(n.node_id)}
                    disabled={!n.hasK2}
                  />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium">{n.room || n.node_id.slice(0, 8)}</Text>
                    {!n.hasK2 && (
                      <Text variant="bodySmall" style={{ color: theme.colors.error }}>
                        K2 not imported — import key first
                      </Text>
                    )}
                  </View>
                </View>
              </TouchableRipple>
            ))}
          </ScrollView>

          <View style={styles.syncActions}>
            <Button onPress={() => { setSyncStep(null); setSyncGroup(null); }}>Cancel</Button>
            <Button mode="contained" onPress={handleNodeSelectionDone}>
              Next
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* Sync: Secret Picker Modal */}
      <Portal>
        <Modal
          visible={syncStep === 'secrets'}
          onDismiss={() => setSyncStep('nodes')}
          contentContainerStyle={[styles.guideModal, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="titleLarge" style={{ fontWeight: '600', marginBottom: 4 }}>
            Select Settings to Sync
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
            Syncing to {selectedNodeIds.size} node{selectedNodeIds.size > 1 ? 's' : ''}.
          </Text>

          <ScrollView style={{ maxHeight: 300 }}>
            {syncGroup?.secrets.filter((s) => s.is_set).map((secret) => (
              <TouchableRipple key={secret.key} onPress={() => toggleSecretSelection(secret.key)}>
                <View style={styles.syncRow}>
                  <Checkbox.Android
                    status={selectedSecretKeys.has(secret.key) ? 'checked' : 'unchecked'}
                    onPress={() => toggleSecretSelection(secret.key)}
                  />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium">{secret.friendly_name ?? secret.key}</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {secret.is_sensitive ? 'Sensitive' : secret.value || 'Configured'}
                    </Text>
                  </View>
                </View>
              </TouchableRipple>
            ))}
          </ScrollView>

          <View style={styles.syncActions}>
            <Button onPress={() => setSyncStep('nodes')}>Back</Button>
            <Button
              mode="contained"
              onPress={handleSyncExecute}
              loading={syncing}
              disabled={syncing || selectedSecretKeys.size === 0}
            >
              Sync
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* Setup Guide Modal */}
      <Portal>
        <Modal
          visible={guideContent !== null}
          onDismiss={() => setGuideContent(null)}
          contentContainerStyle={[
            styles.guideModal,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          {guideContent && (
            <>
              <View style={styles.guideHeader}>
                <Text variant="titleLarge" style={{ fontWeight: '600', flex: 1 }}>
                  {guideContent.title}
                </Text>
                <Button compact onPress={() => setGuideContent(null)}>
                  Close
                </Button>
              </View>
              <ScrollView style={styles.guideScroll}>
                <Markdown
                  style={{
                    body: { color: theme.colors.onSurface, fontSize: 15 },
                    heading1: { color: theme.colors.onSurface, fontWeight: '700', marginTop: 16 },
                    heading2: { color: theme.colors.onSurface, fontWeight: '600', marginTop: 12 },
                    heading3: { color: theme.colors.onSurface, fontWeight: '600', marginTop: 8 },
                    link: { color: theme.colors.primary },
                    code_inline: { backgroundColor: theme.colors.surfaceVariant, borderRadius: 4, paddingHorizontal: 4 },
                    fence: { backgroundColor: theme.colors.surfaceVariant, borderRadius: 8, padding: 12 },
                    bullet_list: { marginVertical: 4 },
                    ordered_list: { marginVertical: 4 },
                  }}
                >
                  {guideContent.markdown}
                </Markdown>
              </ScrollView>
            </>
          )}
        </Modal>
      </Portal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    opacity: 0.6,
  },
  list: {
    paddingBottom: 32,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
  },
  sectionHeader: {
    marginTop: 32,
    marginBottom: -8,
    paddingHorizontal: 20,
  },
  groupContainer: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  groupCard: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  commandToggleCard: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
  },
  commandToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  disabledCard: {
    opacity: 0.4,
  },
  authButton: {
    marginTop: 12,
  },
  scanButtonContainer: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  secretRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  secretInfo: {
    flex: 1,
  },
  setupGuideButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  guideModal: {
    margin: 20,
    borderRadius: 16,
    padding: 20,
    minHeight: '50%',
    maxHeight: '85%',
  },
  guideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  guideScroll: {
    flexGrow: 0,
  },
  menuAnchor: {
    padding: 8,
    borderRadius: 20,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingRight: 8,
  },
  syncActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
});

export default NodeSettingsScreen;
