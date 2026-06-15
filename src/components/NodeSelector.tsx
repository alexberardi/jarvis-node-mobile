import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Menu, Text, useTheme } from 'react-native-paper';

import { getSmartHomeConfig, NodeOption } from '../api/smartHomeApi';
import { LAST_NODE_KEY } from '../config/storageKeys';

interface NodeSelectorProps {
  householdId: string;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onNodesLoaded?: (count: number) => void;
}

const NodeSelector: React.FC<NodeSelectorProps> = ({
  householdId,
  selectedNodeId,
  onSelectNode,
  onNodesLoaded,
}) => {
  const theme = useTheme();
  const [nodes, setNodes] = useState<NodeOption[]>([]);
  const [menuVisible, setMenuVisible] = useState(false);

  // Read the selection through a ref so it doesn't drive the fetch effect —
  // the effect itself sets the selection, and keeping selectedNodeId in the
  // deps would fire a redundant getSmartHomeConfig on every selection.
  const selectedNodeIdRef = useRef(selectedNodeId);
  selectedNodeIdRef.current = selectedNodeId;

  useEffect(() => {
    if (!householdId) return;
    let cancelled = false;

    getSmartHomeConfig(householdId)
      .then(async (config) => {
        if (cancelled) return;
        const nodeList = config.nodes || [];
        setNodes(nodeList);
        onNodesLoaded?.(nodeList.length);

        // Keep the current selection only if it still belongs to this
        // household (it may be stale after a node was removed or the
        // household changed).
        const current = selectedNodeIdRef.current;
        const stillValid = current && nodeList.some((n) => n.node_id === current);
        if (stillValid) return;

        // Prefer the last-used node if it still exists in this household —
        // this is what makes a quick-open land on the node you used last.
        const stored = await AsyncStorage.getItem(LAST_NODE_KEY);
        if (cancelled) return;
        if (stored && nodeList.some((n) => n.node_id === stored)) {
          onSelectNode(stored);
          return;
        }

        // Otherwise primary node if online, then first online, then primary.
        const primary = nodeList.find((n) => n.node_id === config.primary_node_id);
        if (primary?.online) {
          onSelectNode(config.primary_node_id);
        } else {
          const firstOnline = nodeList.find((n) => n.online);
          onSelectNode(firstOnline?.node_id ?? config.primary_node_id);
        }
      })
      .catch((err) => {
        console.warn('[NodeSelector] Failed to load nodes', err.message ?? err);
      });

    return () => {
      cancelled = true;
    };
  }, [householdId, onSelectNode]);

  const selectedNode = nodes.find((n) => n.node_id === selectedNodeId);
  const selectedOffline = selectedNode && !selectedNode.online;
  const label = selectedNode
    ? `${selectedNode.room ?? selectedNodeId?.slice(0, 8)}${selectedOffline ? ' (offline)' : ''}`
    : selectedNodeId?.slice(0, 8) ?? 'Select node';

  if (nodes.length === 0) {
    return null;
  }

  const onlineCount = nodes.filter((n) => n.online).length;

  return (
    <View style={styles.container}>
      <Menu
        visible={menuVisible}
        onDismiss={() => setMenuVisible(false)}
        anchor={
          <Button
            mode="outlined"
            compact
            icon={selectedOffline ? 'access-point-off' : 'access-point'}
            onPress={() => setMenuVisible(true)}
            style={styles.button}
            labelStyle={{ fontSize: 13 }}
            textColor={selectedOffline ? theme.colors.error : undefined}
          >
            {label}
          </Button>
        }
      >
        {nodes.map((node) => (
          <Menu.Item
            key={node.node_id}
            title={`${node.room ?? node.node_id.slice(0, 8)}${node.online ? '' : ' (offline)'}`}
            leadingIcon={node.node_id === selectedNodeId ? 'check' : node.online ? 'circle-small' : 'circle-off-outline'}
            onPress={() => {
              onSelectNode(node.node_id);
              setMenuVisible(false);
            }}
          />
        ))}
      </Menu>
      {nodes.length > 1 && (
        <Text variant="labelSmall" style={[styles.hint, { color: theme.colors.outline }]}>
          {onlineCount}/{nodes.length} online
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  button: {
    borderRadius: 20,
  },
  hint: {
    opacity: 0.7,
  },
});

export default NodeSelector;
