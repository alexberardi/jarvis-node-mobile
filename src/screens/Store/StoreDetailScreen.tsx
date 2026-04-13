import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Divider,
  Icon,
  List,
  Text,
  useTheme,
} from 'react-native-paper';

import apiClient from '../../api/apiClient';
import { fetchNodeTools } from '../../api/chatApi';
import { useAuth } from '../../auth/AuthContext';
import { getDownloadInfo, getPackageDetail } from '../../api/pantryApi';
import { requestCCInstall, requestInstall } from '../../api/packageInstallApi';
import { getServiceConfig } from '../../config/serviceConfig';
import { StoreStackParamList } from '../../navigation/types';
import type { PackageDetail } from '../../types/Package';

type Nav = NativeStackNavigationProp<StoreStackParamList>;
type Route = RouteProp<StoreStackParamList, 'StoreDetail'>;

interface NodeInfo {
  node_id: string;
  room: string | null;
  household_id: string | null;
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
  agent: 'robot',
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

  const fetchHouseholdNodes = async (): Promise<NodeInfo[]> => {
    const { commandCenterUrl } = getServiceConfig();
    const householdId = authState.activeHouseholdId;
    const params = householdId ? `?household_id=${householdId}` : '';
    const res = await apiClient.get<NodeInfo[]>(
      `${commandCenterUrl}/api/v0/admin/nodes${params}`,
    );
    return (res.data || []).filter((n: NodeInfo) => !!n.node_id);
  };

  const hasPromptProvider = detail?.components.some((c) => c.type === 'prompt_provider');

  const handleInstall = async () => {
    if (!detail) return;

    try {
      setInstalling(true);

      // Get download info (repo URL + exact git tag)
      const downloadInfo = await getDownloadInfo(commandName);

      // Prompt providers install to CC directly (async with polling)
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
          Alert.alert('Install Error', err instanceof Error ? err.message : 'Failed to start install');
        } finally {
          setInstalling(false);
        }
        return;
      }

      // Get household nodes
      const nodes = await fetchHouseholdNodes();

      if (nodes.length === 0) {
        Alert.alert('No Nodes', 'No registered nodes found to install this package on.');
        return;
      }

      // Check which nodes already have this command installed
      const installedNodeIds: string[] = [];
      await Promise.all(
        nodes.map(async (node) => {
          try {
            const tools = await fetchNodeTools(node.node_id);
            const toolNames = tools.client_tools.map((t: Record<string, unknown>) => (t.function as Record<string, unknown>)?.name as string).filter(Boolean);
            if (toolNames.includes(downloadInfo.command_name)) {
              installedNodeIds.push(node.node_id);
            }
          } catch {
            // Node offline or unreachable — don't mark as installed
          }
        }),
      );

      const availableNodes = nodes.filter((n) => !installedNodeIds.includes(n.node_id));

      if (nodes.length === 1) {
        if (installedNodeIds.includes(nodes[0].node_id)) {
          Alert.alert('Already Installed', 'This command is already installed on your node.');
          return;
        }
        // Single node — install directly
        const node = nodes[0];
        const result = await requestInstall(
          node.node_id,
          downloadInfo.command_name,
          downloadInfo.github_repo_url,
          downloadInfo.git_tag,
        );

        navigation.navigate('InstallProgress', {
          installs: JSON.stringify([
            {
              requestId: result.id,
              nodeId: node.node_id,
              nodeName: node.room || node.node_id.slice(0, 8),
            },
          ]),
          packageName: detail.display_name || detail.command_name,
          commandName: downloadInfo.command_name,
          githubRepoUrl: downloadInfo.github_repo_url,
          gitTag: downloadInfo.git_tag,
        });
      } else if (availableNodes.length === 0) {
        Alert.alert('Already Installed', 'This command is already installed on all your nodes.');
      } else {
        // Multiple nodes — show picker
        navigation.navigate('NodePickerSheet', {
          nodes: JSON.stringify(nodes),
          commandName: downloadInfo.command_name,
          githubRepoUrl: downloadInfo.github_repo_url,
          gitTag: downloadInfo.git_tag,
          packageName: detail.display_name || detail.command_name,
          installedNodeIds: JSON.stringify(installedNodeIds),
        });
      }
    } catch (e: unknown) {
      Alert.alert('Install Error', e instanceof Error ? e.message : 'Failed to start install');
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

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <Button icon="arrow-left" onPress={() => navigation.goBack()}>
            Back
          </Button>
        </View>

        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text variant="headlineSmall" style={{ fontWeight: 'bold' }}>
              {detail.display_name || detail.command_name}
            </Text>
            {detail.author && (
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                by {detail.author.display_name || detail.author.github}
              </Text>
            )}
          </View>
          <View style={styles.badges}>
            {detail.verified && (
              <Icon source="check-decagram" size={24} color={theme.colors.primary} />
            )}
            {detail.package_type === 'bundle' && (
              <Chip compact style={{ backgroundColor: theme.colors.secondaryContainer }}>
                Bundle
              </Chip>
            )}
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text variant="titleMedium">{detail.install_count}</Text>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Installs
            </Text>
          </View>
          <View style={styles.stat}>
            <Text variant="titleMedium">v{detail.latest_version}</Text>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Version
            </Text>
          </View>
          {detail.avg_rating && (
            <View style={styles.stat}>
              <Text variant="titleMedium">{detail.avg_rating.toFixed(1)}</Text>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Rating ({detail.review_count})
              </Text>
            </View>
          )}
        </View>

        <Divider style={{ marginVertical: 12 }} />

        {/* Description */}
        <Text variant="bodyMedium" style={{ marginBottom: 16 }}>
          {detail.description}
        </Text>

        {/* Categories */}
        {detail.categories.length > 0 && (
          <View style={styles.chipRow}>
            {detail.categories.map((cat) => (
              <Chip key={cat} compact>
                {cat}
              </Chip>
            ))}
          </View>
        )}

        {/* Components (bundles) */}
        {detail.components.length > 1 && (
          <Card style={styles.section}>
            <Card.Title title="Components" />
            <Card.Content>
              {detail.components.map((comp) => (
                <List.Item
                  key={`${comp.type}-${comp.name}`}
                  title={comp.name}
                  description={comp.description || comp.type}
                  left={(props) => (
                    <List.Icon
                      {...props}
                      icon={COMPONENT_ICONS[comp.type] || 'puzzle'}
                    />
                  )}
                />
              ))}
            </Card.Content>
          </Card>
        )}

        {/* Security Report */}
        {detail.security_report && (
          <Card style={styles.section}>
            <Card.Title
              title="Security Report"
              right={() => (
                <Chip
                  compact
                  textStyle={{ color: '#fff', fontSize: 11 }}
                  style={{
                    backgroundColor: dangerColor,
                    marginRight: 16,
                  }}
                >
                  {DANGER_LABELS[detail.danger_rating] || 'Unknown'}
                </Chip>
              )}
            />
            <Card.Content>
              <Text variant="bodySmall" style={{ marginBottom: 8 }}>
                {detail.security_report.summary}
              </Text>
              {detail.security_report.concerns.length > 0 && (
                <View style={{ gap: 4 }}>
                  {detail.security_report.concerns.map((concern, i) => (
                    <View key={i} style={styles.concernRow}>
                      <Icon
                        source="alert-circle-outline"
                        size={14}
                        color={dangerColor}
                      />
                      <Text variant="bodySmall" style={{ flex: 1 }}>
                        {concern}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </Card.Content>
          </Card>
        )}

        {/* Info */}
        <Card style={styles.section}>
          <Card.Content>
            {detail.license && (
              <List.Item
                title="License"
                description={detail.license}
                left={(props) => <List.Icon {...props} icon="scale-balance" />}
              />
            )}
            {detail.platforms.length > 0 && (
              <List.Item
                title="Platforms"
                description={detail.platforms.join(', ')}
                left={(props) => <List.Icon {...props} icon="laptop" />}
              />
            )}
          </Card.Content>
        </Card>
      </ScrollView>

      {/* Install button */}
      {canInstall && (
        <View style={styles.installBar}>
          <Button
            mode="contained"
            onPress={handleInstall}
            loading={installing}
            disabled={installing}
            icon={hasPromptProvider ? 'brain' : 'download'}
            style={{ flex: 1 }}
          >
            {hasPromptProvider ? 'Install to Command Center' : 'Install'}
          </Button>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48 },
  center: { justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, paddingBottom: 100 },
  header: { flexDirection: 'row', marginBottom: 8 },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  badges: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 24 },
  stat: { alignItems: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  section: { marginBottom: 12 },
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
