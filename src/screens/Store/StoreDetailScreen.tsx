import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Checkbox,
  Chip,
  Divider,
  Icon,
  List,
  Menu,
  Text,
  useTheme,
} from 'react-native-paper';

import apiClient from '../../api/apiClient';
import { fetchNodeTools } from '../../api/chatApi';
import type { InstalledPackage } from '../../api/chatApi';
import { useAuth } from '../../auth/AuthContext';
import { HelpIcon } from '../../components/HelpIcon';
import { getDownloadInfo, getPackageDetail } from '../../api/pantryApi';
import { apiErrorMessage, isPantryDisabledError } from '../../api/householdSettingsApi';
import {
  pollRevertStatus,
  requestCCInstall,
  requestInstall,
  requestRevert,
} from '../../api/packageInstallApi';
import { getServiceConfig } from '../../config/serviceConfig';
import { helpCopy } from '../../copy/help';
import { usePantryGate } from '../../components/PantryGate';
import { StoreStackParamList } from '../../navigation/types';
import type { PackageDetail } from '../../types/Package';
import { anyHealthFailed, getRevertTarget, isTerminalInstallStatus } from '../../utils/packageStatus';
import { computerCanRun, isDesktopAgent, nodeDisplayName } from '../../utils/nodeKind';
import { storeLock } from '../../services/pantryStores';
import { categoryIcon, categoryLabel, COMPONENT_LABELS, friendlyCommand } from '../../utils/labels';
import { installLabel, manifestNeedsSetup, nodePackageState } from '../../utils/packageNodes';
import StatusTag from '../../components/StatusTag';

type Nav = NativeStackNavigationProp<StoreStackParamList>;
type Route = RouteProp<StoreStackParamList, 'StoreDetail'>;

interface NodeInfo {
  node_id: string;
  room: string | null;
  household_id: string | null;
  // Passed through to the node picker for its robot / Raspberry Pi icon and
  // its label (a computer is named by its registered name: nodeDisplayName).
  node_kind?: string | null;
  install_mode?: string | null;
  name?: string | null;
  online?: boolean;
}

const DANGER_LABELS: Record<number, string> = {
  1: 'Very Safe',
  2: 'Safe',
  3: 'Moderate',
  4: 'Risky',
  5: 'Dangerous',
};

const DANGER_COLORS: Record<number, string> = {
  1: '#22c55e',
  2: '#84cc16',
  3: '#f59e0b',
  4: '#f97316',
  5: '#ef4444',
};

const COMPONENT_ICONS: Record<string, string> = {
  command: 'console-line',
  agent: 'timer-cog-outline',
  device_protocol: 'access-point',
  device_manager: 'devices',
  prompt_provider: 'brain',
};

const StoreDetailScreen = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const theme = useTheme();
  const { state: authState } = useAuth();
  const { commandName } = route.params;

  const [detail, setDetail] = useState<PackageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-node installed version for this command. null = not installed.
  // 'unknown' = installed but the node didn't report a version (legacy install).
  const [nodeVersions, setNodeVersions] = useState<Record<string, string | null>>({});
  // Full installed_packages entry per node (previous_version, health) for the
  // nodes that report one. Drives the Revert action and the health dot.
  const [nodePackages, setNodePackages] = useState<Record<string, InstalledPackage>>({});
  const [nodesLoading, setNodesLoading] = useState(false);
  const [reverting, setReverting] = useState(false);
  // Bumped after a revert completes so the version-discovery effect re-runs.
  const [refreshTick, setRefreshTick] = useState(0);
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  // Ticked nodes on "On your nodes": what the install button acts on.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);

  const { markDisabled } = usePantryGate();
  const activeHousehold = authState.households.find(
    (h) => h.id === authState.activeHouseholdId,
  );
  const canInstall = activeHousehold?.role === 'admin' || activeHousehold?.role === 'power_user';

  const loadDetail = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const data = await getPackageDetail(commandName);
      setDetail(data);
    } catch {
      setError('Could not load package details');
    } finally {
      setLoading(false);
    }
  }, [commandName]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const fetchHouseholdNodes = useCallback(async (): Promise<NodeInfo[]> => {
    const { commandCenterUrl } = getServiceConfig();
    const householdId = authState.activeHouseholdId;
    const params = householdId ? `?household_id=${householdId}` : '';
    const res = await apiClient.get<NodeInfo[]>(
      `${commandCenterUrl}/api/v0/admin/nodes${params}`,
    );
    return (res.data || []).filter((n: NodeInfo) => !!n.node_id);
  }, [authState.activeHouseholdId]);

  const hasPromptProvider = detail?.components.some((c) => c.type === 'prompt_provider');

  // Discover installed-version-per-node so the install button can label itself
  // Install / Update to vX / Up to date. Prompt providers install to CC, not
  // to a node — they keep the simple Install label.
  useEffect(() => {
    if (!detail || hasPromptProvider) return;
    let cancelled = false;
    (async () => {
      try {
        setNodesLoading(true);
        const nodes = await fetchHouseholdNodes();
        const entries = await Promise.all(
          nodes.map(async (node): Promise<readonly [string, string | null, InstalledPackage | null]> => {
            try {
              const tools = await fetchNodeTools(node.node_id);
              const pkg = (tools.installed_packages || []).find(
                (p) => p.name === commandName,
              );
              if (pkg) return [node.node_id, pkg.version, pkg] as const;
              // Fall back to client_tools name check for legacy installs
              // that pre-date installed_packages reporting.
              const toolNames = tools.client_tools
                .map((t) => (t.function as Record<string, unknown>)?.name as string)
                .filter(Boolean);
              if (toolNames.includes(commandName)) {
                return [node.node_id, 'unknown', null] as const;
              }
              return [node.node_id, null, null] as const;
            } catch {
              return [node.node_id, null, null] as const;
            }
          }),
        );
        if (cancelled) return;
        setNodes(nodes);
        const versions = Object.fromEntries(entries.map(([id, version]) => [id, version]));
        setNodeVersions(versions);
        const pkgs = Object.fromEntries(entries.flatMap(([id, , pkg]) => (pkg ? [[id, pkg] as const] : [])));
        // Tick every node that can take this: updates and fresh installs.
        setSelected(
          new Set(
            nodes
              .filter((n) => {
                // Offline nodes start unticked: the install would wait for them.
                if (n.online === false) return false;
                const st = nodePackageState(versions[n.node_id], detail.latest_version, storeLock(pkgs[n.node_id]));
                return st === 'update' || st === 'install';
              })
              .map((n) => n.node_id),
          ),
        );
        setNodePackages(
          Object.fromEntries(
            entries.flatMap(([id, , pkg]) => (pkg ? [[id, pkg] as const] : [])),
          ),
        );
      } finally {
        if (!cancelled) setNodesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detail, hasPromptProvider, commandName, fetchHouseholdNodes, refreshTick]);

  // Aggregate install state across all nodes. Drives the bottom button.

  // Nodes that kept a `.previous` rollback snapshot from the last update,
  // and whether any node reports the package's components failed to load.
  const revertTarget = hasPromptProvider ? null : getRevertTarget(nodePackages);
  const healthFailed = !hasPromptProvider && anyHealthFailed(nodePackages);

  // Mirrors the uninstall UX: confirm dialog → inline progress → done.
  // The node restarts mid-revert, so the poll passes through 'restarting'
  // (non-terminal) before the post-boot result lands.
  const handleRevert = () => {
    if (!detail || !revertTarget) return;
    const displayName = detail.display_name || detail.command_name;
    const nodeCount = revertTarget.nodeIds.length;
    Alert.alert(
      'Revert Package',
      `Roll back "${displayName}" to v${revertTarget.previousVersion} on ${nodeCount} node${nodeCount === 1 ? '' : 's'}? The node will restart.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revert',
          style: 'destructive',
          onPress: async () => {
            setReverting(true);
            try {
              const failures: string[] = [];
              await Promise.all(
                revertTarget.nodeIds.map(async (nodeId) => {
                  const { id } = await requestRevert(nodeId, commandName);
                  // 60 × 2s = 120s — covers the node's restart + discovery
                  // re-initialization before it posts the result.
                  let attempts = 0;
                  while (attempts < 60) {
                    await new Promise((r) => setTimeout(r, 2000));
                    const result = await pollRevertStatus(nodeId, id);
                    if (isTerminalInstallStatus(result.status)) {
                      if (result.status !== 'completed') {
                        failures.push(result.error_message ?? 'Revert failed');
                      }
                      return;
                    }
                    attempts++;
                  }
                  failures.push('Node did not respond in time.');
                }),
              );
              if (failures.length > 0) {
                Alert.alert('Revert Failed', failures[0]);
              } else {
                Alert.alert('Reverted', `Rolled back to v${revertTarget.previousVersion}.`);
              }
              setRefreshTick((t) => t + 1);
            } catch (e: unknown) {
              Alert.alert('Error', apiErrorMessage(e, 'Failed to request revert'));
            } finally {
              setReverting(false);
            }
          },
        },
      ],
    );
  };

  const stateOf = (n: NodeInfo) =>
    nodePackageState(nodeVersions[n.node_id], detail?.latest_version ?? '0.0.0', storeLock(nodePackages[n.node_id]));
  const ticked = nodes.filter((n) => selected.has(n.node_id));
  const toInstall = ticked.filter((n) => stateOf(n) === 'install');
  const toUpdate = ticked.filter((n) => stateOf(n) === 'update');

  const startInstall = async (targets: NodeInfo[], downloadInfo: Awaited<ReturnType<typeof getDownloadInfo>>) => {
    const installs = await Promise.all(
      targets.map(async (node) => {
        const result = await requestInstall(node.node_id, downloadInfo.command_name, downloadInfo.github_repo_url, downloadInfo.git_tag);
        return { requestId: result.id, nodeId: node.node_id, nodeName: nodeDisplayName(node) };
      }),
    );
    navigation.navigate('InstallProgress', {
      installs: JSON.stringify(installs),
      packageName: detail!.display_name || detail!.command_name,
      commandName: downloadInfo.command_name,
      githubRepoUrl: downloadInfo.github_repo_url,
      gitTag: downloadInfo.git_tag,
      needsSetup: manifestNeedsSetup(downloadInfo.manifest),
    });
  };

  const handleInstall = async () => {
    if (!detail) return;

    try {
      setInstalling(true);

      const downloadInfo = await getDownloadInfo(commandName);

      if (hasPromptProvider) {
        try {
          const result = await requestCCInstall(
            downloadInfo.github_repo_url,
            downloadInfo.git_tag,
          );
          navigation.navigate('InstallProgress', {
            installs: JSON.stringify([result.id]),
            packageName: detail.display_name || commandName,
            commandName,
            githubRepoUrl: downloadInfo.github_repo_url,
            gitTag: downloadInfo.git_tag,
            mode: 'cc-provider',
          });
        } catch (err: unknown) {
          Alert.alert('Install Error', apiErrorMessage(err, 'Failed to start install'));
        } finally {
          setInstalling(false);
        }
        return;
      }

      // Computers can run only packages without system installs (the manifest says so).
      const runsOnComputers = computerCanRun(downloadInfo.manifest);
      const skipped = runsOnComputers ? [] : ticked.filter((n) => isDesktopAgent(n));
      const targets = ticked.filter((n) => !skipped.includes(n));
      if (targets.length === 0) {
        Alert.alert(
          'Not for computers',
          `${detail.display_name || commandName} is made for Raspberry Pi nodes and can't run on a computer.`,
        );
        return;
      }
      if (skipped.length > 0) {
        Alert.alert('Skipping computers', `${skipped.map((n) => nodeDisplayName(n)).join(', ')} can't run it; installing on the rest.`);
      }

      const aptPackages: string[] =
        (downloadInfo.manifest as { apt_packages?: string[] })?.apt_packages ?? [];
      if (aptPackages.length > 0) {
        const userConsented = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Root-privileged install',
            `This package will install: ${aptPackages.join(', ')}. These run with root privileges. Continue?`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Continue', onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
          );
        });
        if (!userConsented) return;
      }

      await startInstall(targets, downloadInfo);
    } catch (e: unknown) {
      if (isPantryDisabledError(e)) {
        markDisabled();
        return;
      }
      Alert.alert('Install Error', apiErrorMessage(e, 'Failed to start install'));
    } finally {
      setInstalling(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text variant="bodyLarge" style={{ color: theme.colors.error }}>
          {error || 'Package not found'}
        </Text>
        <Button mode="text" onPress={loadDetail} style={{ marginTop: 8 }}>
          Retry
        </Button>
      </View>
    );
  }

  const dangerColor = DANGER_COLORS[detail.danger_rating] || '#6b7280';
  const category = detail.categories[0];
  const stateTag = (n: NodeInfo) => {
    const st = stateOf(n);
    const v = nodeVersions[n.node_id];
    if (st === 'installed') return { label: 'Installed', sub: `v${v}`, tone: 'ok' as const };
    if (st === 'update') return { label: 'Update', sub: v && v !== 'unknown' ? `v${v} \u2192 v${detail.latest_version}` : 'Older version', tone: 'need' as const };
    if (st === 'locked') return { label: 'Can\u2019t', sub: storeLock(nodePackages[n.node_id]) ?? '', tone: 'off' as const };
    return { label: 'Install', sub: '', tone: 'off' as const };
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="" />
        {canInstall && revertTarget && (
          <Menu
            visible={menuOpen}
            onDismiss={() => setMenuOpen(false)}
            anchor={<Appbar.Action icon="dots-vertical" testID="package-menu" accessibilityLabel="More" onPress={() => setMenuOpen(true)} />}
          >
            <Menu.Item
              testID="package-revert"
              leadingIcon="backup-restore"
              title={`Revert to v${revertTarget.previousVersion}`}
              disabled={reverting || installing}
              onPress={() => {
                setMenuOpen(false);
                handleRevert();
              }}
            />
          </Menu>
        )}
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: theme.colors.secondaryContainer }]}>
            <Icon source={categoryIcon(category)} size={30} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.titleLine}>
              <Text variant="titleLarge" style={{ fontWeight: 'bold', flexShrink: 1 }}>
                {detail.display_name || detail.command_name}
              </Text>
              {detail.verified && (
                <>
                  <Icon source="check-decagram" size={18} color={theme.colors.primary} />
                  <HelpIcon text={helpCopy.pantry.verifiedBadge} size={14} />
                </>
              )}
              {healthFailed && (
                <View accessibilityLabel="Package failed to load on a node" testID="package-health-dot">
                  <Icon source="circle" size={10} color="#ef4444" />
                </View>
              )}
            </View>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {[detail.author ? detail.author.display_name || detail.author.github : null, `v${detail.latest_version}`, `${detail.install_count} installs`, detail.avg_rating ? `\u2605 ${detail.avg_rating.toFixed(1)} (${detail.review_count})` : null]
                .filter(Boolean)
                .join(' \u00b7 ')}
            </Text>
          </View>
        </View>

        <Text variant="bodyMedium" style={{ marginBottom: 12 }}>
          {detail.description}
        </Text>
        {detail.categories.length > 0 && (
          <View style={styles.chipRow}>
            {detail.categories.map((cat) => (
              <Chip key={cat} compact>{categoryLabel(cat)}</Chip>
            ))}
          </View>
        )}

        {!hasPromptProvider && (
          <>
            <Text variant="labelLarge" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>On your nodes</Text>
            <Card mode="outlined" style={styles.section}>
              <View>
                {nodesLoading && <ActivityIndicator style={{ margin: 16 }} />}
                {!nodesLoading && nodes.length === 0 && (
                  <Text variant="bodySmall" style={{ margin: 16, color: theme.colors.onSurfaceVariant }}>No nodes in this household yet.</Text>
                )}
                {!nodesLoading && nodes.map((n, i) => {
                  const st = stateOf(n);
                  const tag = stateTag(n);
                  const actionable = canInstall && (st === 'update' || st === 'install');
                  const failed = nodePackages[n.node_id]?.health === 'failed';
                  return (
                    <React.Fragment key={n.node_id}>
                      {i > 0 && <Divider />}
                      <List.Item
                        testID={`package-node-${n.node_id}`}
                        title={nodeDisplayName(n)}
                        description={failed ? 'Failed to load on this node' : [n.online === false ? 'Offline' : null, tag.sub || null].filter(Boolean).join(' \u00b7 ') || undefined}
                        descriptionStyle={failed ? { color: theme.colors.error } : undefined}
                        onPress={
                          actionable
                            ? () =>
                                setSelected((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(n.node_id)) next.delete(n.node_id);
                                  else next.add(n.node_id);
                                  return next;
                                })
                            : undefined
                        }
                        left={() =>
                          canInstall ? (
                            <View style={styles.check}>
                              <Checkbox.Android
                                status={selected.has(n.node_id) ? 'checked' : 'unchecked'}
                                disabled={!actionable}
                              />
                            </View>
                          ) : null
                        }
                        right={() => (
                          <View style={styles.check}>
                            <StatusTag label={tag.label} tone={tag.tone} />
                          </View>
                        )}
                      />
                    </React.Fragment>
                  );
                })}
              </View>
            </Card>
          </>
        )}

        {detail.components.length > 0 && (
          <>
            <Text variant="labelLarge" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>What it adds</Text>
            <Card mode="outlined" style={styles.section}>
              <View>
                {detail.components.map((comp, i) => (
                  <React.Fragment key={`${comp.type}-${comp.name}`}>
                    {i > 0 && <Divider />}
                    <List.Item
                      title={friendlyCommand(comp.name)}
                      description={COMPONENT_LABELS[comp.type] ?? comp.type}
                      left={(props) => <List.Icon {...props} icon={COMPONENT_ICONS[comp.type] || 'puzzle'} />}
                    />
                  </React.Fragment>
                ))}
              </View>
            </Card>
          </>
        )}

        <Card mode="outlined" style={styles.section}>
          <List.Accordion
            testID="package-safety"
            title={detail.security_report ? DANGER_LABELS[detail.danger_rating] || 'Unknown' : 'Details'}
            description={[detail.security_report ? 'Security report' : null, detail.license, detail.platforms.join(', ')].filter(Boolean).join(' \u00b7 ')}
            left={(props) => <List.Icon {...props} icon="shield-check-outline" color={detail.security_report ? dangerColor : props.color} />}
          >
            {detail.security_report && (
              <View style={styles.safety}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text variant="bodySmall" style={{ flex: 1 }}>{detail.security_report.summary}</Text>
                  <HelpIcon text={helpCopy.pantry.riskChip} size={16} />
                </View>
                {detail.security_report.concerns.map((concern, i) => (
                  <View key={i} style={styles.concernRow}>
                    <Icon source="alert-circle-outline" size={14} color={dangerColor} />
                    <Text variant="bodySmall" style={{ flex: 1 }}>{concern}</Text>
                  </View>
                ))}
              </View>
            )}
            {detail.license ? <List.Item title="License" description={detail.license} /> : null}
            {detail.platforms.length > 0 ? <List.Item title="Platforms" description={detail.platforms.join(', ')} /> : null}
          </List.Accordion>
        </Card>
      </ScrollView>

      {canInstall && (
        <View style={[styles.installBar, { backgroundColor: theme.colors.background }]}>
          <Button
            mode="contained"
            testID="package-install"
            onPress={handleInstall}
            loading={installing || nodesLoading || reverting}
            disabled={installing || reverting || nodesLoading || (!hasPromptProvider && ticked.length === 0)}
            icon={hasPromptProvider ? 'brain' : toInstall.length ? 'download' : 'update'}
          >
            {hasPromptProvider
              ? 'Install to Command Center'
              : nodes.length > 0 && nodes.every((n) => stateOf(n) === 'installed')
                ? `Up to date (v${detail.latest_version})`
                : installLabel(toInstall.map((n) => nodeDisplayName(n)), toUpdate.map((n) => nodeDisplayName(n)))}
          </Button>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, paddingBottom: 100 },
  hero: { flexDirection: 'row', gap: 14, alignItems: 'center', marginBottom: 12 },
  heroIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { marginTop: 4, marginBottom: 6, marginLeft: 4 },
  check: { justifyContent: 'center' },
  safety: { paddingHorizontal: 16, paddingBottom: 8, gap: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  section: { marginBottom: 12, overflow: 'hidden' },
  concernRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  installBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 32,
  },
});

export default StoreDetailScreen;
