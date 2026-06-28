import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Button, Menu, Text, useTheme } from 'react-native-paper';

import { getSmartHomeConfig, NodeOption } from '../api/smartHomeApi';
import { LAST_NODE_KEY } from '../config/storageKeys';
import { usePendingNode } from '../contexts/PendingNodeContext';

/** While a freshly-provisioned node is booting, re-check the node list this often. */
const PENDING_POLL_MS = 4000;

export interface NodeSelectorHandle {
  /** Re-fetch the household's nodes. Drives pull-to-refresh on the chat screen. */
  refresh: () => Promise<void>;
}

interface NodeSelectorProps {
  householdId: string;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onNodesLoaded?: (count: number) => void;
  /** Fired once when a pending (just-provisioned) node first appears online. */
  onPendingNodeReady?: (node: NodeOption) => void;
  /**
   * Fired whenever the selected node's chat-readiness changes. Ready means the
   * node is a present + online member of *this* household — the only state in
   * which a chat request won't bomb (offline, still-provisioning, or
   * wrong-household nodes all report false). The chat input gates on this.
   */
  onSelectedNodeReadyChange?: (ready: boolean) => void;
}

const NodeSelector = forwardRef<NodeSelectorHandle, NodeSelectorProps>(
  (
    {
      householdId,
      selectedNodeId,
      onSelectNode,
      onNodesLoaded,
      onPendingNodeReady,
      onSelectedNodeReadyChange,
    },
    ref,
  ) => {
    const theme = useTheme();
    const [nodes, setNodes] = useState<NodeOption[]>([]);
    const [menuVisible, setMenuVisible] = useState(false);
    const { pendingNodeId, pendingHouseholdId, clearPending } = usePendingNode();

    // Only treat the pending node as "ours" if it belongs to the household we're
    // currently showing — markers are household-scoped so switching households
    // mid-provisioning doesn't strand the chat screen polling for a node that
    // lives elsewhere. (Legacy markers carry no household → treat as relevant.)
    const relevantPendingId =
      pendingNodeId && (!pendingHouseholdId || pendingHouseholdId === householdId)
        ? pendingNodeId
        : null;

    // Read mutable values through refs so loadConfig stays stable (keyed only on
    // householdId) — the effects below re-use it without re-subscribing, and the
    // effect itself sets the selection, so keeping selectedNodeId in deps would
    // fire a redundant getSmartHomeConfig on every selection.
    const selectedNodeIdRef = useRef(selectedNodeId);
    selectedNodeIdRef.current = selectedNodeId;
    const pendingNodeIdRef = useRef(relevantPendingId);
    pendingNodeIdRef.current = relevantPendingId;
    const onSelectNodeRef = useRef(onSelectNode);
    onSelectNodeRef.current = onSelectNode;
    const onNodesLoadedRef = useRef(onNodesLoaded);
    onNodesLoadedRef.current = onNodesLoaded;
    const onPendingNodeReadyRef = useRef(onPendingNodeReady);
    onPendingNodeReadyRef.current = onPendingNodeReady;
    const clearPendingRef = useRef(clearPending);
    clearPendingRef.current = clearPending;
    const onSelectedNodeReadyChangeRef = useRef(onSelectedNodeReadyChange);
    onSelectedNodeReadyChangeRef.current = onSelectedNodeReadyChange;
    const reqIdRef = useRef(0);

    const loadConfig = useCallback(async (): Promise<void> => {
      if (!householdId) return;
      const myReq = ++reqIdRef.current;

      let config;
      try {
        config = await getSmartHomeConfig(householdId);
      } catch (err) {
        console.warn('[NodeSelector] Failed to load nodes', (err as Error)?.message ?? err);
        return;
      }
      if (reqIdRef.current !== myReq) return; // superseded by a newer load

      const nodeList = config.nodes || [];
      setNodes(nodeList);
      onNodesLoadedRef.current?.(nodeList.length);

      // A freshly-provisioned node just registered (it appears online the moment
      // it boots and calls /nodes/register). Select it, announce it, and stop
      // waiting — this is the no-app-restart path.
      const pending = pendingNodeIdRef.current;
      const pendingNode = pending ? nodeList.find((n) => n.node_id === pending) : undefined;
      if (pending && pendingNode) {
        onSelectNodeRef.current(pending);
        onPendingNodeReadyRef.current?.(pendingNode);
        clearPendingRef.current();
        return;
      }

      // Keep the current selection if it still belongs to this household (it may
      // be stale after a node was removed or the household changed).
      const current = selectedNodeIdRef.current;
      if (current && nodeList.some((n) => n.node_id === current)) return;

      if (nodeList.length === 0) return; // nothing to auto-select

      // Prefer the last-used node if it still exists in this household — this is
      // what makes a quick-open land on the node you used last.
      const stored = await AsyncStorage.getItem(LAST_NODE_KEY);
      if (reqIdRef.current !== myReq) return;
      if (stored && nodeList.some((n) => n.node_id === stored)) {
        onSelectNodeRef.current(stored);
        return;
      }

      // Otherwise primary node if online, then first online, then primary, then
      // first node. `||` (not `??`) so an empty primary_node_id — what the
      // backend returns for a household with no primary chosen yet — falls
      // through instead of being selected as a bogus '' id.
      const primary = nodeList.find((n) => n.node_id === config.primary_node_id);
      const chosen = primary?.online
        ? config.primary_node_id
        : nodeList.find((n) => n.online)?.node_id ||
          config.primary_node_id ||
          nodeList[0]?.node_id;
      if (chosen) onSelectNodeRef.current(chosen);
    }, [householdId]);

    useImperativeHandle(ref, () => ({ refresh: loadConfig }), [loadConfig]);

    // Initial load + reload when the household changes.
    useEffect(() => {
      loadConfig();
    }, [loadConfig]);

    // Re-fetch when the chat screen regains focus (picks up nodes added or
    // removed elsewhere). Skip the very first focus — the effect above already
    // ran the initial load.
    const didFocusRef = useRef(false);
    useFocusEffect(
      useCallback(() => {
        if (!didFocusRef.current) {
          didFocusRef.current = true;
          return;
        }
        loadConfig();
      }, [loadConfig]),
    );

    const pendingPresent = relevantPendingId
      ? nodes.some((n) => n.node_id === relevantPendingId)
      : true;
    const waitingForNewNode = !!relevantPendingId && !pendingPresent;

    // Poll while a just-provisioned node hasn't shown up yet. Stops as soon as
    // it appears (pendingPresent) or its marker expires/clears. The initial-load
    // effect already covers the first fetch, so we let the interval handle the
    // rest rather than firing a redundant immediate request here.
    useEffect(() => {
      if (!householdId || !waitingForNewNode) return;
      const id = setInterval(() => {
        loadConfig();
      }, PENDING_POLL_MS);
      return () => clearInterval(id);
    }, [householdId, waitingForNewNode, loadConfig]);

    const selectedNode = nodes.find((n) => n.node_id === selectedNodeId);
    const selectedOffline = selectedNode && !selectedNode.online;

    // A node is chat-ready only when it's a present + online member of this
    // household. A just-provisioned node that hasn't registered here yet (or
    // registered under another household) won't be in `nodes`, so `selectedNode`
    // is undefined → not ready → the chat input stays disabled and a send can't
    // 404. Report changes up so HomeScreen can gate the composer.
    const selectedNodeReady = !!selectedNode && !!selectedNode.online;
    useEffect(() => {
      onSelectedNodeReadyChangeRef.current?.(selectedNodeReady);
    }, [selectedNodeReady]);
    const label = selectedNode
      ? `${selectedNode.room ?? selectedNodeId?.slice(0, 8)}${selectedOffline ? ' (offline)' : ''}`
      : selectedNodeId?.slice(0, 8) ?? 'Select node';

    const pendingIndicator = (
      <View style={styles.pendingRow}>
        <ActivityIndicator size={12} color={theme.colors.primary} />
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
          Setting up new node…
        </Text>
      </View>
    );

    if (nodes.length === 0) {
      // Show a "setting up" hint while a freshly-provisioned node boots so the
      // chat screen visibly transitions instead of sitting empty.
      return waitingForNewNode ? <View style={styles.container}>{pendingIndicator}</View> : null;
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
        {nodes.length > 1 && !waitingForNewNode && (
          <Text variant="labelSmall" style={[styles.hint, { color: theme.colors.outline }]}>
            {onlineCount}/{nodes.length} online
          </Text>
        )}
        {waitingForNewNode && pendingIndicator}
      </View>
    );
  },
);

NodeSelector.displayName = 'NodeSelector';

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
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});

export default NodeSelector;
