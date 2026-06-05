import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Checkbox, Icon, List, Text, useTheme } from 'react-native-paper';

import { requestInstall } from '../../api/packageInstallApi';
import { StoreStackParamList } from '../../navigation/types';
import { compareSemver } from '../../utils/semver';

type Nav = NativeStackNavigationProp<StoreStackParamList>;
type Route = RouteProp<StoreStackParamList, 'NodePickerSheet'>;

interface NodeInfo {
  node_id: string;
  room: string | null;
}

type NodeState = 'not-installed' | 'outdated' | 'up-to-date';

const NodePickerSheet = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const theme = useTheme();

  const nodes: NodeInfo[] = JSON.parse(route.params.nodes);
  const installedVersions: Record<string, string | null> = JSON.parse(
    route.params.installedVersions,
  );
  const { commandName, githubRepoUrl, gitTag, latestVersion, packageName } = route.params;

  const stateFor = (nodeId: string): NodeState => {
    const v = installedVersions[nodeId];
    if (!v) return 'not-installed';
    if (v === 'unknown') return 'outdated';
    return compareSemver(v, latestVersion) >= 0 ? 'up-to-date' : 'outdated';
  };

  // Default selection: every node that can be acted on (outdated or
  // not-installed). User can deselect any individual node before tapping
  // the action button.
  const initialSelected = useMemo(() => {
    const s = new Set<string>();
    for (const n of nodes) {
      if (stateFor(n.node_id) !== 'up-to-date') s.add(n.node_id);
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selected, setSelected] = useState<Set<string>>(initialSelected);
  const [installing, setInstalling] = useState(false);

  const toggle = (nodeId: string) => {
    if (stateFor(nodeId) === 'up-to-date') return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const selectedHasUpdate = Array.from(selected).some(
    (id) => stateFor(id) === 'outdated',
  );
  const selectedHasInstall = Array.from(selected).some(
    (id) => stateFor(id) === 'not-installed',
  );
  const actionLabel =
    selected.size === 0
      ? 'Select nodes'
      : selectedHasUpdate && selectedHasInstall
        ? `Install / Update on ${selected.size} node${selected.size !== 1 ? 's' : ''}`
        : selectedHasUpdate
          ? `Update on ${selected.size} node${selected.size !== 1 ? 's' : ''}`
          : `Install on ${selected.size} node${selected.size !== 1 ? 's' : ''}`;

  const handleInstall = async () => {
    if (selected.size === 0) return;

    try {
      setInstalling(true);

      const installs = await Promise.all(
        Array.from(selected).map(async (nodeId) => {
          const node = nodes.find((n) => n.node_id === nodeId)!;
          const result = await requestInstall(
            nodeId,
            commandName,
            githubRepoUrl,
            gitTag || null,
          );
          return {
            requestId: result.id,
            nodeId: node.node_id,
            nodeName: node.room || node.node_id.slice(0, 8),
          };
        }),
      );

      navigation.replace('InstallProgress', {
        installs: JSON.stringify(installs),
        packageName,
        commandName,
        githubRepoUrl,
        gitTag: gitTag || null,
      });
    } catch (e: unknown) {
      Alert.alert('Install Error', e instanceof Error ? e.message : 'Failed to start install');
    } finally {
      setInstalling(false);
    }
  };

  const renderDescription = (nodeId: string): { text: string; color?: string } => {
    const v = installedVersions[nodeId];
    const state = stateFor(nodeId);
    if (state === 'not-installed') {
      return { text: nodeId.slice(0, 12) + '...' };
    }
    if (state === 'up-to-date') {
      return { text: `Installed v${v} — up to date`, color: '#4CAF50' };
    }
    // outdated
    if (v === 'unknown') {
      return { text: `Installed (unknown version) — update available`, color: '#f59e0b' };
    }
    return { text: `Installed v${v} — update to v${latestVersion}`, color: '#f59e0b' };
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Button icon="arrow-left" onPress={() => navigation.goBack()}>
          Back
        </Button>
      </View>

      <Text
        variant="headlineSmall"
        style={[styles.title, { color: theme.colors.onBackground }]}
      >
        Select Nodes
      </Text>
      <Text
        variant="bodyMedium"
        style={{ color: theme.colors.onSurfaceVariant, paddingHorizontal: 16, marginBottom: 16 }}
      >
        Pick which nodes to install or update "{packageName}" v{latestVersion} on:
      </Text>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
        {nodes.map((node) => {
          const state = stateFor(node.node_id);
          const desc = renderDescription(node.node_id);
          const isUpToDate = state === 'up-to-date';
          return (
            <List.Item
              key={node.node_id}
              title={node.room || node.node_id.slice(0, 8)}
              description={desc.text}
              descriptionStyle={desc.color ? { color: desc.color } : undefined}
              style={isUpToDate ? { opacity: 0.6 } : undefined}
              left={(props) =>
                isUpToDate ? (
                  <View {...props} style={{ justifyContent: 'center', paddingLeft: 8 }}>
                    <Icon source="check-circle" size={24} color="#4CAF50" />
                  </View>
                ) : (
                  <Checkbox
                    {...props}
                    status={selected.has(node.node_id) ? 'checked' : 'unchecked'}
                    onPress={() => toggle(node.node_id)}
                  />
                )
              }
              onPress={() => toggle(node.node_id)}
            />
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          mode="contained"
          onPress={handleInstall}
          loading={installing}
          disabled={installing || selected.size === 0}
          icon={selectedHasUpdate ? 'update' : 'download'}
          style={{ flex: 1 }}
        >
          {actionLabel}
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48 },
  header: { flexDirection: 'row', marginBottom: 8 },
  title: { fontWeight: 'bold', paddingHorizontal: 16, marginBottom: 4 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 32,
  },
});

export default NodePickerSheet;
