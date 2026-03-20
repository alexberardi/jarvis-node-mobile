import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Checkbox, Icon, List, Text, useTheme } from 'react-native-paper';

import { requestInstall } from '../../api/packageInstallApi';
import { StoreStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<StoreStackParamList>;
type Route = RouteProp<StoreStackParamList, 'NodePickerSheet'>;

interface NodeInfo {
  node_id: string;
  room: string | null;
}

const NodePickerSheet = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const theme = useTheme();

  const nodes: NodeInfo[] = JSON.parse(route.params.nodes);
  const installedNodeIds: Set<string> = new Set(JSON.parse(route.params.installedNodeIds));
  const { commandName, githubRepoUrl, gitTag, packageName } = route.params;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [installing, setInstalling] = useState(false);

  const toggle = (nodeId: string) => {
    if (installedNodeIds.has(nodeId)) return;
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
      });
    } catch (e: any) {
      Alert.alert('Install Error', e?.message || 'Failed to start install');
    } finally {
      setInstalling(false);
    }
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
        Choose which nodes to install "{packageName}" on:
      </Text>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
        {nodes.map((node) => {
          const isInstalled = installedNodeIds.has(node.node_id);
          return (
            <List.Item
              key={node.node_id}
              title={node.room || node.node_id.slice(0, 8)}
              description={isInstalled ? 'Already installed' : node.node_id.slice(0, 12) + '...'}
              descriptionStyle={isInstalled ? { color: '#4CAF50' } : undefined}
              style={isInstalled ? { opacity: 0.6 } : undefined}
              left={(props) =>
                isInstalled ? (
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
          icon="download"
          style={{ flex: 1 }}
        >
          Install on {selected.size} node{selected.size !== 1 ? 's' : ''}
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
