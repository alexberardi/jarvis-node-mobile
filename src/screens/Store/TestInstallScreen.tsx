import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Icon,
  IconButton,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import { listNodes, NodeInfo } from '../../api/nodeApi';
import { requestTestInstall } from '../../api/testInstallApi';
import { useAuth } from '../../auth/AuthContext';
import { StoreStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<StoreStackParamList>;

const TestInstallScreen = () => {
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const { state: authState } = useAuth();

  const [shareCode, setShareCode] = useState('');
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loadingNodes, setLoadingNodes] = useState(true);
  const [installing, setInstalling] = useState(false);

  const loadNodes = useCallback(async () => {
    try {
      const data = await listNodes(authState.activeHouseholdId ?? undefined);
      setNodes(data);
      // Auto-select first online node
      const online = data.find((n) => n.online);
      if (online) setSelectedNodeId(online.node_id);
    } catch {
      // Nodes will show as empty
    } finally {
      setLoadingNodes(false);
    }
  }, [authState.activeHouseholdId]);

  useEffect(() => {
    loadNodes();
  }, [loadNodes]);

  const handleInstall = async () => {
    const code = shareCode.trim().toUpperCase();
    if (code.length !== 6) {
      Alert.alert('Invalid Code', 'Share codes are 6 characters.');
      return;
    }
    if (!selectedNodeId) {
      Alert.alert('No Node', 'Select a node to install on.');
      return;
    }

    setInstalling(true);
    try {
      const result = await requestTestInstall(selectedNodeId, code);
      const node = nodes.find((n) => n.node_id === selectedNodeId);

      navigation.navigate('InstallProgress', {
        installs: JSON.stringify([
          {
            requestId: result.id,
            nodeId: selectedNodeId,
            nodeName: node?.room || selectedNodeId.slice(0, 8),
          },
        ]),
        packageName: result.package_name,
        commandName: result.package_name,
        githubRepoUrl: '',
        gitTag: null,
        mode: 'test',
      });
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? 'Failed to start test install';
      Alert.alert('Error', detail);
    } finally {
      setInstalling(false);
    }
  };

  const codeValid = shareCode.trim().length === 6;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { borderBottomColor: theme.colors.outlineVariant }]}>
        <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
        <Text variant="headlineSmall" style={{ fontWeight: 'bold', flex: 1 }}>
          Test Install
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Share code input */}
        <View style={styles.section}>
          <Text variant="titleSmall" style={[styles.sectionTitle, { color: theme.colors.primary }]}>
            Share Code
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
            Enter the 6-character code from the Forge to test a package on your node.
          </Text>
          <TextInput
            mode="outlined"
            value={shareCode}
            onChangeText={(v) => setShareCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            maxLength={6}
            autoCapitalize="characters"
            placeholder="e.g. AB3KM7"
            style={styles.codeInput}
            contentStyle={styles.codeInputContent}
          />
        </View>

        {/* Node picker */}
        <View style={styles.section}>
          <Text variant="titleSmall" style={[styles.sectionTitle, { color: theme.colors.primary }]}>
            Target Node
          </Text>

          {loadingNodes ? (
            <ActivityIndicator style={{ marginTop: 12 }} />
          ) : nodes.length === 0 ? (
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              No nodes found.
            </Text>
          ) : (
            <View style={styles.nodeList}>
              {nodes.map((node) => {
                const selected = node.node_id === selectedNodeId;
                return (
                  <Card
                    key={node.node_id}
                    style={[
                      styles.nodeCard,
                      selected && { borderColor: theme.colors.primary, borderWidth: 2 },
                    ]}
                    onPress={() => setSelectedNodeId(node.node_id)}
                  >
                    <Card.Content style={styles.nodeCardContent}>
                      <View style={styles.nodeInfo}>
                        <View style={[
                          styles.dot,
                          { backgroundColor: node.online ? '#22c55e' : theme.colors.outline },
                        ]} />
                        <Text variant="bodyMedium" style={{ fontWeight: '500' }}>
                          {node.room || node.node_id.slice(0, 8)}
                        </Text>
                      </View>
                      {selected && (
                        <Icon source="check-circle" size={20} color={theme.colors.primary} />
                      )}
                    </Card.Content>
                  </Card>
                );
              })}
            </View>
          )}
        </View>

        {/* Info banner */}
        <View style={[styles.infoBanner, { backgroundColor: `${theme.colors.primary}10` }]}>
          <Icon source="information-outline" size={18} color={theme.colors.primary} />
          <Text variant="bodySmall" style={{ flex: 1, color: theme.colors.onSurfaceVariant, marginLeft: 8 }}>
            Test installs are temporary — they auto-expire after 20 minutes.
          </Text>
        </View>

        {/* Install button */}
        <Button
          mode="contained"
          onPress={handleInstall}
          disabled={!codeValid || !selectedNodeId || installing}
          loading={installing}
          style={styles.installButton}
        >
          Test Install
        </Button>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scroll: { padding: 16, paddingBottom: 32 },
  section: { marginBottom: 24 },
  sectionTitle: { fontWeight: '600', marginBottom: 4 },
  codeInput: { fontSize: 24 },
  codeInputContent: { fontFamily: 'monospace', letterSpacing: 8, textAlign: 'center' },
  nodeList: { gap: 8, marginTop: 4 },
  nodeCard: { borderWidth: 1, borderColor: 'transparent' },
  nodeCardContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  nodeInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  infoBanner: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 8, marginBottom: 24 },
  installButton: { marginTop: 8 },
});

export default TestInstallScreen;
