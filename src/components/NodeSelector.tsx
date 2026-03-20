import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Menu, Text, useTheme } from 'react-native-paper';

import { getSmartHomeConfig, NodeOption } from '../api/smartHomeApi';

interface NodeSelectorProps {
  householdId: string;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

const NodeSelector: React.FC<NodeSelectorProps> = ({
  householdId,
  selectedNodeId,
  onSelectNode,
}) => {
  const theme = useTheme();
  const [nodes, setNodes] = useState<NodeOption[]>([]);
  const [menuVisible, setMenuVisible] = useState(false);

  useEffect(() => {
    if (!householdId) return;

    getSmartHomeConfig(householdId)
      .then((config) => {
        setNodes(config.nodes || []);
        if (!selectedNodeId) {
          // Prefer primary node if online, otherwise first online node
          const primary = config.nodes.find(
            (n) => n.node_id === config.primary_node_id,
          );
          if (primary?.online) {
            onSelectNode(config.primary_node_id);
          } else {
            const firstOnline = config.nodes.find((n) => n.online);
            onSelectNode(
              firstOnline?.node_id ?? config.primary_node_id,
            );
          }
        }
      })
      .catch(() => {
        // Silently handle — no nodes to show
      });
  }, [householdId, selectedNodeId, onSelectNode]);

  const selectedNode = nodes.find((n) => n.node_id === selectedNodeId);
  const label = selectedNode?.room ?? selectedNodeId?.slice(0, 8) ?? 'Select node';

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
            icon="access-point"
            onPress={() => setMenuVisible(true)}
            style={styles.button}
            labelStyle={{ fontSize: 13 }}
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
