import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Text, useTheme } from 'react-native-paper';

import { getNode, NodeInfo } from '../../api/nodeApi';
import { useAuth } from '../../auth/AuthContext';
import KeyboardSafeView from '../../components/KeyboardSafeView';
import { NodeHardwarePart, NodesStackParamList } from '../../navigation/types';
import { hasK2 } from '../../services/k2Service';
import { nodeDisplayName } from '../../utils/nodeKind';
import { HardwareTab } from './HardwareTab';
import { PackagesTab } from './NodeDetailScreen';

type Nav = NativeStackNavigationProp<NodesStackParamList>;

const PART_TITLES: Record<NodeHardwarePart, string> = {
  voice: 'Wake word & mic',
  speaker: 'Speaker & Bluetooth',
  hardware: 'Hardware & upkeep',
};

const useNode = (nodeId: string) => {
  const [node, setNode] = useState<NodeInfo | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    getNode(nodeId).then(setNode, () => setError(true));
  }, [nodeId]);
  return { node, error };
};

const Body = ({ node, error, children }: { node: NodeInfo | null; error: boolean; children: (n: NodeInfo) => React.ReactNode }) => {
  const theme = useTheme();
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={{ color: theme.colors.error }}>Could not load node details</Text>
      </View>
    );
  }
  if (!node) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  return <>{children(node)}</>;
};

/** One part of a node's hardware settings, opened from a node card. */
export const NodeHardwareScreen = () => {
  const navigation = useNavigation<Nav>();
  const { nodeId, part } = useRoute<RouteProp<NodesStackParamList, 'NodeHardware'>>().params;
  const { node, error } = useNode(nodeId);
  return (
    <KeyboardSafeView style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={PART_TITLES[part]} />
      </Appbar.Header>
      <Body node={node} error={error}>
        {(n) => <HardwareTab nodeId={nodeId} node={n} part={part} />}
      </Body>
    </KeyboardSafeView>
  );
};

/** A node's installed packages; with its key on this phone, Manage opens the switches. */
export const NodePackagesScreen = () => {
  const navigation = useNavigation<Nav>();
  const { state } = useAuth();
  const { nodeId } = useRoute<RouteProp<NodesStackParamList, 'NodePackages'>>().params;
  const { node, error } = useNode(nodeId);
  const [canManage, setCanManage] = useState(false);
  useEffect(() => {
    hasK2(nodeId).then(setCanManage);
  }, [nodeId]);
  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Packages" />
        {canManage && node && (
          <Appbar.Action
            testID="node-packages-manage"
            icon="tune-variant"
            accessibilityLabel="Turn packages on or off, or uninstall"
            onPress={() => navigation.navigate('NodeSettings', { nodeId, room: nodeDisplayName(node, '') || null, tab: 'commands' })}
          />
        )}
      </Appbar.Header>
      <Body node={node} error={error}>
        {(n) => <PackagesTab nodeId={nodeId} householdId={n.household_id ?? state.activeHouseholdId} />}
      </Body>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
