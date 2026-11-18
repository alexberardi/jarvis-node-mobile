import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Divider,
  Icon,
  IconButton,
  List,
  Modal,
  Portal,
  Surface,
  Text,
  useTheme,
} from 'react-native-paper';

import { fetchNodeTools, type InstalledPackage } from '../../api/chatApi';
import { loadPantryStores, storeNote, usePantryStores } from '../../services/pantryStores';
import {
  getNode,
  NodeInfo,
  nodeErrorMessage,
  removeNode,
  signOutNode,
  startFactoryReset,
  waitForFactoryReset,
} from '../../api/nodeApi';
import type { NodeTaskState } from '../../api/nodeUpdateApi';
import { NodeUpdateSection } from '../../components/NodeUpdateSection';
import { helpCopy } from '../../copy/help';
import { NodeHardwarePart, NodeSettingsTab, NodesStackParamList } from '../../navigation/types';
import { deleteK2, getK2, hasK2, type K2KeyPair } from '../../services/k2Service';
import { K2BackupCard } from '../../components/K2QRCode';
import { formatLastSeen } from '../../utils/serverTime';
import { canSignOutDesktopAgent, isDesktopAgent, nodeDisplayName } from '../../utils/nodeKind';
import { NodeKindIcon } from '../../components/NodeKindIcon';
import { useAuth } from '../../auth/AuthContext';
import { useSpeaksAs } from '../../hooks/useSpeaksAs';
import { speaksAsLabel, type SpeaksAs } from '../../utils/speaksAs';
import KeyboardSafeView from '../../components/KeyboardSafeView';

type Nav = NativeStackNavigationProp<NodesStackParamList>;
type Route = RouteProp<NodesStackParamList, 'NodeDetail'>;

// =============================================================================
// Helpers
// =============================================================================

interface CommandInfo {
  name: string;
  description: string;
}

// =============================================================================
// Overview Tab
// =============================================================================

type DeleteStep =
  | { kind: 'closed' }
  | { kind: 'confirm' }
  | { kind: 'running'; state: NodeTaskState | null }
  | { kind: 'done' }
  | { kind: 'queued' }
  | { kind: 'removeConfirm' }
  | { kind: 'removing' }
  // Desktop agent: sign-out instead of the factory reset (decision 2026-10-14).
  | { kind: 'signOutConfirm' }
  | { kind: 'signingOut' }
  | { kind: 'signedOut' }
  | { kind: 'error'; message: string; title?: string };

// How long the dialog follows the factory-reset task before handing over to
// "queued". An online node normally confirms within seconds; an offline one
// can't, so don't make the user stare at a spinner for it.
const RESET_WAIT_ONLINE_MS = 45_000;
const RESET_WAIT_OFFLINE_MS = 8_000;

const resetProgressText = (state: NodeTaskState | null, name: string): string => {
  switch (state) {
    case 'dispatched':
      return `Waiting for ${name} to start the reset…`;
    case 'in_progress':
      return `${name} is wiping itself…`;
    default:
      return 'Sending the reset to the node…';
  }
};

// Exported for L1 flow-integration testing of the delete state machine
// (__tests__/flows/nodeDeleteFlow.test.tsx) without the full screen's route/tabs.
export const OverviewTab = ({
  node,
  canDelete,
  speaksAs,
  children,
}: {
  node: NodeInfo;
  canDelete: boolean;
  /** A desktop agent's signed-in member (useSpeaksAs); left out for a Pi. */
  speaksAs?: SpeaksAs;
  /** The node's cards, between the status and the danger zone. */
  children?: React.ReactNode;
}) => {
  const theme = useTheme();
  const navigation = useNavigation<Nav>();
  const [deleteStep, setDeleteStep] = useState<DeleteStep>({ kind: 'closed' });
  const desktop = isDesktopAgent(node);
  const nodeName = nodeDisplayName(node, desktop ? 'This computer' : 'The node');
  const speaksAsText = desktop && speaksAs ? speaksAsLabel(speaksAs) : null;

  // Stop polling the reset task if the screen goes away mid-wait.
  const unmountedRef = useRef(false);
  useEffect(() => () => {
    unmountedRef.current = true;
  }, []);

  // Tracked factory reset (jarvisd D10): start the task, follow it until the
  // node confirms or fails, or until it's clear the node isn't picking it up.
  const handleDelete = useCallback(async () => {
    setDeleteStep({ kind: 'running', state: null });
    try {
      const { taskId } = await startFactoryReset(node.node_id);
      const task = await waitForFactoryReset(taskId, {
        timeoutMs: node.online ? RESET_WAIT_ONLINE_MS : RESET_WAIT_OFFLINE_MS,
        isCancelled: () => unmountedRef.current,
        onUpdate: (t) => {
          if (!unmountedRef.current) setDeleteStep({ kind: 'running', state: t.state });
        },
      });
      if (unmountedRef.current) return;
      if (task?.state === 'success') {
        // Best-effort local K2 cleanup — the node is wiped, its key is useless.
        try {
          await deleteK2(node.node_id);
        } catch {}
        setDeleteStep({ kind: 'done' });
      } else if (task?.state === 'failed') {
        setDeleteStep({
          kind: 'error',
          message: task.error_message || 'The node reported that the reset failed.',
        });
      } else {
        // Still pending/dispatched/in_progress (or unreadable): the reset stays
        // queued server-side and completes when the node reconnects.
        setDeleteStep({ kind: 'queued' });
      }
    } catch (err) {
      if (unmountedRef.current) return;
      setDeleteStep({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Failed to reset node',
      });
    }
  }, [node.node_id, node.online]);

  // "Remove anyway" — for a node that will never pick the reset up (Pi gone).
  // Hard DELETE: removes the node and revokes its key, without wiping the Pi.
  const handleRemoveAnyway = useCallback(async () => {
    setDeleteStep({ kind: 'removing' });
    try {
      await removeNode(node.node_id);
      try {
        await deleteK2(node.node_id);
      } catch {}
      if (unmountedRef.current) return;
      setDeleteStep({ kind: 'closed' });
      navigation.navigate('NodeList');
    } catch (err) {
      if (unmountedRef.current) return;
      setDeleteStep({
        kind: 'error',
        title: 'Remove failed',
        message: nodeErrorMessage(err, 'Failed to remove node'),
      });
    }
  }, [node.node_id, navigation]);

  // Desktop agent: sign it out. The server revokes it and removes it from the
  // household; the agent keeps its settings on the computer and never wipes.
  const handleSignOut = useCallback(async () => {
    setDeleteStep({ kind: 'signingOut' });
    try {
      await signOutNode(node.node_id);
      // Best-effort: a new sign-in on that computer is a new node with a new key.
      try {
        await deleteK2(node.node_id);
      } catch {}
      if (unmountedRef.current) return;
      setDeleteStep({ kind: 'signedOut' });
    } catch (err) {
      if (unmountedRef.current) return;
      setDeleteStep({
        kind: 'error',
        title: 'Sign-out failed',
        message: nodeErrorMessage(err, 'Could not sign this computer out'),
      });
    }
  }, [node.node_id]);

  const finishDelete = useCallback(() => {
    setDeleteStep({ kind: 'closed' });
    navigation.navigate('NodeList');
  }, [navigation]);

  return (
    <>
      {/* Status card */}
      <View style={[styles.statusCard, { backgroundColor: node.online ? '#22c55e18' : `${theme.colors.error}18` }]}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: node.online ? '#22c55e' : theme.colors.error }]} />
          <Text variant="titleMedium" style={{ fontWeight: '600' }}>
            {node.online ? 'Online' : 'Offline'}
          </Text>
        </View>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
          Last seen {formatLastSeen(node.last_seen, node.online)}
        </Text>
        {speaksAsText && (
          <View style={[styles.statusRow, { marginTop: 8 }]}>
            <Icon
              source={speaksAs?.kind === 'owner' ? 'account-voice' : 'account-alert-outline'}
              size={18}
              color={speaksAs?.kind === 'owner' ? theme.colors.onSurface : theme.colors.error}
            />
            <Text
              testID="node-speaks-as"
              variant="bodyMedium"
              style={{ flex: 1, color: speaksAs?.kind === 'owner' ? theme.colors.onSurface : theme.colors.error }}
            >
              {speaksAsText}
            </Text>
          </View>
        )}
      </View>

      <NodeUpdateSection node={node} />

      {children}

      {canDelete && (
        <>
          <View style={styles.dangerHeader}>
            <Text variant="titleSmall" style={{ color: theme.colors.error, fontWeight: '600' }}>
              Danger Zone
            </Text>
          </View>
          {desktop ? (
          <Surface style={[styles.dangerCard, { borderColor: theme.colors.error }]} elevation={0}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
              Sign out this computer: it will stop working with Jarvis
              Automation until someone signs in on it again. Its settings on
              the computer are kept.
            </Text>
            <Button
              testID="node-signout-button"
              mode="outlined"
              icon="logout"
              textColor={theme.colors.error}
              style={{ borderColor: theme.colors.error }}
              onPress={() => setDeleteStep({ kind: 'signOutConfirm' })}
            >
              Sign out this computer
            </Button>
          </Surface>
          ) : (
          <Surface style={[styles.dangerCard, { borderColor: theme.colors.error }]} elevation={0}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
              Factory-resets this node: it wipes itself, leaves your household
              and reboots into provisioning mode. If it's offline, the reset
              waits and runs as soon as it reconnects.
            </Text>
            <Button
              testID="node-delete-button"
              mode="outlined"
              icon="delete-alert-outline"
              textColor={theme.colors.error}
              style={{ borderColor: theme.colors.error }}
              onPress={() => setDeleteStep({ kind: 'confirm' })}
            >
              Delete Node
            </Button>
          </Surface>
          )}
        </>
      )}

      <Portal>
        <Modal
          visible={deleteStep.kind !== 'closed'}
          onDismiss={() => {
            // Block dismiss while a request is in flight.
            if (
              deleteStep.kind !== 'running' &&
              deleteStep.kind !== 'removing' &&
              deleteStep.kind !== 'signingOut'
            ) {
              setDeleteStep({ kind: 'closed' });
            }
          }}
          contentContainerStyle={[styles.modalCard, { backgroundColor: theme.colors.surface }]}
        >
          {deleteStep.kind === 'confirm' && (
            <>
              <Text variant="titleLarge" style={{ fontWeight: '600', marginBottom: 8, color: theme.colors.error }}>
                Delete {nodeDisplayName(node, 'Node')}?
              </Text>
              <Text variant="bodyMedium" style={{ marginBottom: 16 }}>
                The node will be wiped, removed from your household, have its
                credentials revoked, and reboot into provisioning mode.
                {node.online
                  ? ''
                  : " It's offline right now, so the reset will run when it reconnects."}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 24 }}>
                This action cannot be undone.
              </Text>
              <View style={styles.modalActions}>
                <Button testID="node-delete-cancel" onPress={() => setDeleteStep({ kind: 'closed' })}>Cancel</Button>
                <Button
                  testID="node-delete-confirm"
                  mode="contained"
                  buttonColor={theme.colors.error}
                  textColor={theme.colors.onError}
                  onPress={handleDelete}
                >
                  Delete
                </Button>
              </View>
            </>
          )}

          {deleteStep.kind === 'signOutConfirm' && (
            <>
              <Text variant="titleLarge" style={{ fontWeight: '600', marginBottom: 8, color: theme.colors.error }}>
                Sign out {nodeDisplayName(node, 'this computer')}?
              </Text>
              <Text variant="bodyMedium" style={{ marginBottom: 16 }}>
                It will stop working with Jarvis Automation until someone signs in on it again,
                and it leaves your household's device list. Its settings on the computer are kept.
                {node.online
                  ? ''
                  : " It's offline right now, so it finds out the next time it connects."}
              </Text>
              <View style={styles.modalActions}>
                <Button testID="node-signout-cancel" onPress={() => setDeleteStep({ kind: 'closed' })}>Cancel</Button>
                <Button
                  testID="node-signout-confirm"
                  mode="contained"
                  buttonColor={theme.colors.error}
                  textColor={theme.colors.onError}
                  onPress={handleSignOut}
                >
                  Sign out
                </Button>
              </View>
            </>
          )}

          {deleteStep.kind === 'signingOut' && (
            <View testID="node-signout-progress" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <ActivityIndicator />
              <Text variant="bodyMedium" style={{ flex: 1 }}>Signing {nodeName} out…</Text>
            </View>
          )}

          {deleteStep.kind === 'signedOut' && (
            <>
              <Text variant="titleLarge" style={{ fontWeight: '600', marginBottom: 12 }}>
                Signed out
              </Text>
              <Text variant="bodyMedium" style={{ marginBottom: 24 }}>
                {nodeName} has been signed out and removed from your household. To use it
                again, sign in from the Jarvis Automation agent on that computer.
              </Text>
              <View style={styles.modalActions}>
                <Button testID="node-signout-done" mode="contained" onPress={finishDelete}>Done</Button>
              </View>
            </>
          )}

          {deleteStep.kind === 'running' && (
            <View testID="node-delete-progress" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <ActivityIndicator />
              <Text variant="bodyMedium" style={{ flex: 1 }}>
                {resetProgressText(deleteStep.state, nodeName)}
              </Text>
            </View>
          )}

          {deleteStep.kind === 'done' && (
            <>
              <Text variant="titleLarge" style={{ fontWeight: '600', marginBottom: 12 }}>
                Node reset
              </Text>
              <Text variant="bodyMedium" style={{ marginBottom: 24 }}>
                {nodeName} has been wiped and removed from your household. It
                will reboot into provisioning mode.
              </Text>
              <View style={styles.modalActions}>
                <Button testID="node-delete-done" mode="contained" onPress={finishDelete}>Done</Button>
              </View>
            </>
          )}

          {deleteStep.kind === 'queued' && (
            <>
              <Text variant="titleLarge" style={{ fontWeight: '600', marginBottom: 12 }}>
                Reset queued
              </Text>
              <Text variant="bodyMedium" style={{ marginBottom: 12 }}>
                {nodeName} hasn't picked up the reset yet — it looks offline.
                It will wipe itself and leave your household as soon as it
                reconnects (the request stays open for 7 days).
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 24 }}>
                Until then it stays in your node list.
              </Text>
              <View style={styles.modalActions}>
                <Button
                  testID="node-delete-remove-anyway"
                  textColor={theme.colors.error}
                  onPress={() => setDeleteStep({ kind: 'removeConfirm' })}
                >
                  Remove anyway
                </Button>
                <Button testID="node-delete-queued-close" mode="contained" onPress={finishDelete}>OK</Button>
              </View>
            </>
          )}

          {deleteStep.kind === 'removeConfirm' && (
            <>
              <Text variant="titleLarge" style={{ fontWeight: '600', marginBottom: 8, color: theme.colors.error }}>
                Remove without resetting?
              </Text>
              <Text variant="bodyMedium" style={{ marginBottom: 12 }}>
                {nodeName} will be removed from your household right away and its
                credentials revoked, so it can't connect any more. It won't be wiped.
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 24 }}>
                Only do this if the device is gone for good. If it ever comes back,
                factory-reset it by hand before setting it up again.
              </Text>
              <View style={styles.modalActions}>
                <Button testID="node-delete-remove-back" onPress={() => setDeleteStep({ kind: 'queued' })}>Back</Button>
                <Button
                  testID="node-delete-remove-confirm"
                  mode="contained"
                  buttonColor={theme.colors.error}
                  textColor={theme.colors.onError}
                  onPress={handleRemoveAnyway}
                >
                  Remove
                </Button>
              </View>
            </>
          )}

          {deleteStep.kind === 'removing' && (
            <View testID="node-delete-removing" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <ActivityIndicator />
              <Text variant="bodyMedium" style={{ flex: 1 }}>Removing {nodeName}…</Text>
            </View>
          )}

          {deleteStep.kind === 'error' && (
            <>
              <Text variant="titleLarge" style={{ fontWeight: '600', marginBottom: 12, color: theme.colors.error }}>
                {deleteStep.title ?? 'Reset failed'}
              </Text>
              <Text variant="bodyMedium" style={{ marginBottom: 24 }}>
                {deleteStep.message}
              </Text>
              <View style={styles.modalActions}>
                <Button testID="node-delete-error-close" onPress={() => setDeleteStep({ kind: 'closed' })}>Close</Button>
              </View>
            </>
          )}
        </Modal>
      </Portal>
    </>
  );
};

// =============================================================================
// Packages Tab
// =============================================================================

export const PackagesTab = ({ nodeId, householdId }: { nodeId: string; householdId?: string | null }) => {
  const theme = useTheme();
  const [commands, setCommands] = useState<CommandInfo[]>([]);
  // Which Pantry store each installed package came from (several pantries), by package name.
  const [installed, setInstalled] = useState<Record<string, InstalledPackage>>({});
  const { stores } = usePantryStores();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    if (householdId) loadPantryStores(householdId);
    try {
      const tools = await fetchNodeTools(nodeId);
      setInstalled(Object.fromEntries((tools.installed_packages ?? []).map((p) => [p.name, p])));
      const cmds: CommandInfo[] = tools.client_tools
        .map((t: Record<string, unknown>) => {
          const fn = t.function as Record<string, unknown> | undefined;
          return {
            name: (fn?.name as string) || '',
            description: (fn?.description as string) || '',
          };
        })
        .filter((c) => c.name)
        .sort((a, b) => a.name.localeCompare(b.name));
      setCommands(cmds);
    } catch {
      setError('Could not load commands. Node may be offline.');
    } finally {
      setLoading(false);
    }
  }, [nodeId, householdId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <View style={styles.tabCenter}><ActivityIndicator size="large" /></View>;
  }

  if (error) {
    return (
      <View style={styles.tabCenter}>
        <Text variant="bodyMedium" style={{ color: theme.colors.error, marginBottom: 12 }}>{error}</Text>
        <Button mode="outlined" onPress={load}>Retry</Button>
      </View>
    );
  }

  if (commands.length === 0) {
    return (
      <View style={styles.tabCenter}>
        <Icon source="package-variant" size={48} color={theme.colors.outlineVariant} />
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}>
          No commands installed
        </Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4, textAlign: 'center', paddingHorizontal: 24 }}>
          {helpCopy.nodeDetail.packagesEmpty}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={commands}
      keyExtractor={(c) => c.name}
      contentContainerStyle={{ paddingVertical: 8 }}
      renderItem={({ item }) => {
        // shortcut: matched by name, so a bundle's tools named apart from the package show no
        // store; upgrade when the node reports each tool's package.
        const note = storeNote(installed[item.name], stores.length);
        return (
          <List.Item
            title={item.name}
            description={note ? `${note}\n${item.description}` : item.description}
            descriptionNumberOfLines={note ? 3 : 2}
            left={(props) => <List.Icon {...props} icon="puzzle" />}
          />
        );
      }}
    />
  );
};

// =============================================================================
// Main Screen
// =============================================================================

interface NodeCard {
  key: string;
  icon: string;
  title: string;
  subtitle: string;
  onPress?: () => void;
}

/** A 2×2 grid of icon cards, the same look as the Household tab's tiles. */
const CardGrid = ({ label, cards }: { label: string; cards: NodeCard[] }) => {
  const theme = useTheme();
  return (
    <>
      <Text variant="labelLarge" style={[styles.cardLabel, { color: theme.colors.onSurfaceVariant }]}>
        {label}
      </Text>
      <View style={styles.cardGrid}>
        {cards.map((c) => (
          <Card
            key={c.key}
            style={[styles.gridCard, !c.onPress && { opacity: 0.5 }]}
            onPress={c.onPress}
            disabled={!c.onPress}
            testID={`node-card-${c.key}`}
          >
            <Card.Content style={{ gap: 6 }}>
              <Icon source={c.icon} size={24} color={theme.colors.primary} />
              <Text variant="titleSmall">{c.title}</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={2}>
                {c.subtitle}
              </Text>
            </Card.Content>
          </Card>
        ))}
      </View>
    </>
  );
};

const NodeDetailScreen = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const theme = useTheme();
  const { state: authState } = useAuth();
  const { nodeId } = route.params;

  const [node, setNode] = useState<NodeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportKeyPair, setExportKeyPair] = useState<K2KeyPair | null>(null);
  // null = checking, true = key on this device, false = no key
  // (node was set up on another device: the settings-backed cards are off).
  const [hasSettingsAccess, setHasSettingsAccess] = useState<boolean | null>(null);
  const speaksAs = useSpeaksAs(node);

  useEffect(() => {
    let mounted = true;
    hasK2(nodeId).then((result) => {
      if (mounted) setHasSettingsAccess(result);
    });
    return () => {
      mounted = false;
    };
  }, [nodeId]);

  const loadNode = useCallback(async () => {
    try {
      setError(null);
      const data = await getNode(nodeId);
      setNode(data);
    } catch {
      setError('Could not load node details');
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  useEffect(() => {
    loadNode();
  }, [loadNode]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNode();
    setRefreshing(false);
  }, [loadNode]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error && !node) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text variant="bodyLarge" style={{ color: theme.colors.error }}>{error}</Text>
        <Button mode="text" onPress={loadNode} style={{ marginTop: 8 }}>Retry</Button>
      </View>
    );
  }

  if (!node) return null;

  const desktop = isDesktopAgent(node);
  // A Pi's Delete needs its K2 on this phone (the factory reset is for whoever
  // set it up). A desktop agent's sign-out follows cc's rule instead: the
  // member who paired it, or a household admin.
  const canDelete = desktop
    ? canSignOutDesktopAgent(node, authState.user?.id, authState.households ?? [])
    : hasSettingsAccess === true;
  const room = nodeDisplayName(node, '') || null;
  // The settings-backed cards need this phone to hold the node's key; a node that
  // has none yet (needs_k2) opens the settings screen, which offers to make one.
  const settingsOpen = !!(hasSettingsAccess || node.needs_k2);
  const noKeyNote = 'Set up on another phone: import its key';
  const openSettings = (tab: NodeSettingsTab) =>
    settingsOpen ? () => navigation.navigate('NodeSettings', { nodeId, room, tab }) : undefined;

  const capabilities: NodeCard[] = [
    {
      key: 'packages',
      icon: 'package-variant',
      title: 'Packages',
      subtitle: 'Installed from the Pantry',
      onPress: () => navigation.navigate('NodePackages', { nodeId }),
    },
    {
      key: 'credentials',
      icon: 'key-chain-variant',
      title: 'Credentials',
      subtitle: settingsOpen ? 'Sign-ins and API keys' : noKeyNote,
      // The node's view of the household Credentials list; a node without a key yet goes to
      // its settings, which offer to make one.
      onPress: hasSettingsAccess
        ? () => navigation.navigate('Credentials', { nodeId })
        : openSettings('integrations'),
    },
    { key: 'tasks', icon: 'timer-sync-outline', title: 'Background tasks', subtitle: settingsOpen ? 'Daemons and schedules' : noKeyNote, onPress: openSettings('agents') },
    {
      key: 'data',
      icon: 'database-outline',
      title: 'Stored data',
      subtitle: settingsOpen ? 'Records packages keep' : noKeyNote,
      onPress: openSettings('stored_data'),
    },
  ];
  const hardware = (part: NodeHardwarePart) => () => navigation.navigate('NodeHardware', { nodeId, part });
  const device: NodeCard[] =
    node.install_mode === 'docker'
      ? []
      : desktop
        ? [{ key: 'hardware', icon: 'chip', title: 'Hardware', subtitle: 'Info, voice identity', onPress: hardware('hardware') }]
        : [
            { key: 'voice', icon: 'microphone-settings', title: 'Wake word & mic', subtitle: 'Sensitivity, volume, follow-ups', onPress: hardware('voice') },
            { key: 'speaker', icon: 'speaker-wireless', title: 'Speaker & Bluetooth', subtitle: 'Pairing, HAT LEDs', onPress: hardware('speaker') },
            { key: 'hardware', icon: 'chip', title: 'Hardware & upkeep', subtitle: 'Info, daily restart', onPress: hardware('hardware') },
            {
              key: 'voice-profile',
              icon: 'account-voice',
              title: 'Voice profile',
              subtitle: 'So Jarvis knows who is talking',
              onPress: () => navigation.getParent()?.navigate('VoiceProfile'),
            },
          ];
  const tools: NodeCard[] = [
    { key: 'forge-test', icon: 'flask-outline', title: 'Test a Forge command', subtitle: 'Install by share code', onPress: () => navigation.navigate('NodeForgeTest', { nodeId }) },
    {
      key: 'scan-devices',
      icon: 'radar',
      title: 'Scan for devices',
      subtitle: 'Find smart devices near it',
      onPress: () => navigation.getParent()?.navigate('SmartHomeSetup', { screen: 'DeviceDiscovery', params: { nodeId } }),
    },
    ...(hasSettingsAccess
      ? [{
          key: 'export-key',
          icon: 'key-variant',
          title: 'Export encryption key',
          subtitle: 'Back it up, or use another phone',
          onPress: async () => setExportKeyPair(await getK2(nodeId)),
        }]
      : []),
  ];

  return (
    <KeyboardSafeView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.outlineVariant }]}>
        <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
        <NodeKindIcon node={node} testID="node-kind-icon" style={{ marginRight: 8 }} />
        <Text variant="headlineSmall" style={{ fontWeight: 'bold', flex: 1 }}>
          {nodeDisplayName(node, desktop ? 'This computer' : 'Node')}
        </Text>
      </View>

      <ScrollView
        testID="node-detail-scroll"
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <OverviewTab node={node} canDelete={canDelete} speaksAs={speaksAs}>
          {node.needs_k2 && !hasSettingsAccess && (
            <Surface style={[styles.keyBanner, { backgroundColor: theme.colors.secondaryContainer }]} elevation={0}>
              <Text variant="bodyMedium" style={{ flex: 1 }}>
                This phone needs an encryption key for this node before it can change its settings.
              </Text>
              <Button testID="node-key-banner" mode="contained-tonal" onPress={() => navigation.navigate('NodeSettings', { nodeId, room })}>
                Set up
              </Button>
            </Surface>
          )}
          <CardGrid label="What it can do" cards={capabilities} />
          {device.length > 0 && <CardGrid label="Device" cards={device} />}
          <CardGrid label="Tools" cards={tools} />
        </OverviewTab>
      </ScrollView>

      <Portal>
        <Modal
          visible={exportKeyPair !== null}
          onDismiss={() => setExportKeyPair(null)}
          contentContainerStyle={[styles.modalCard, { backgroundColor: theme.colors.surface }]}
        >
          <ScrollView>
            {exportKeyPair && <K2BackupCard keyPair={exportKeyPair} onDone={() => setExportKeyPair(null)} />}
          </ScrollView>
        </Modal>
      </Portal>
    </KeyboardSafeView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  scroll: { paddingBottom: 32 },
  statusCard: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  cardLabel: { marginTop: 20, marginBottom: 8, marginHorizontal: 20 },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16 },
  gridCard: { flexBasis: '46%', flexGrow: 1 },
  keyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
  },
  dangerHeader: {
    marginTop: 32,
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  dangerCard: {
    marginHorizontal: 16,
    marginBottom: 24,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  modalCard: {
    margin: 20,
    borderRadius: 16,
    padding: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
});

export default NodeDetailScreen;
