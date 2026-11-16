/**
 * "Chat channels": talk to Jarvis from a chat service (jarvisd docs/CHANNELS.md). A channel is
 * a package running on one of the household's nodes, so this card lists whatever the server
 * says is there and knows no service by name. Each member links their own account with a
 * one-time code, chooses whether reminders also go there (off by default), or unlinks.
 *
 * The card shows nothing when the household has no channel, or on a server without them.
 * Based on the member half of the Discord card contributed in jarvis-node-mobile pull request 158.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Chip, HelperText, Switch, Text, useTheme } from 'react-native-paper';

import {
  createChannelLinkCode,
  listChannels,
  setChannelPrefs,
  unlinkChannel,
  type Channel,
  type ChannelLinkCode,
} from '../api/channelsApi';
import { settingErrorMessage } from '../api/householdSettingsApi';
import { listNodes, type NodeInfo } from '../api/nodeApi';

const nodeLabel = (n: NodeInfo): string => n.room || n.node_id;

/** `discord` -> `Discord`, `my_chat` -> `My chat`: the package's name for its service. */
export const channelLabel = (provider: string): string => {
  const words = provider.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

interface RowProps {
  householdId: string;
  channel: Channel;
  nodes: NodeInfo[];
  onChanged: () => Promise<void>;
}

const ChannelRow = ({ householdId, channel, nodes, onChanged }: RowProps) => {
  const theme = useTheme();
  const muted = { color: theme.colors.onSurfaceVariant };
  const { provider } = channel;
  const label = channelLabel(provider);
  const [pickedNode, setPickedNode] = useState<string | undefined>(undefined);
  const [code, setCode] = useState<ChannelLinkCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err: unknown) {
      setError(settingErrorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const makeCode = () =>
    run(async () => {
      const nodeId = pickedNode ?? (nodes.length === 1 ? nodes[0].node_id : undefined);
      setCode(await createChannelLinkCode(householdId, provider, nodeId));
    }, 'Could not make a link code.');

  const setProactive = (proactive: boolean) =>
    run(async () => {
      await setChannelPrefs(householdId, provider, { proactive });
      await onChanged();
    }, 'Could not save that.');

  const unlink = () =>
    run(async () => {
      await unlinkChannel(householdId, provider);
      setCode(null);
      await onChanged();
    }, 'Could not unlink.');

  return (
    <View style={styles.channel} testID={`channel-${provider}`}>
      <View style={styles.row}>
        <Text variant="titleSmall" style={styles.subTitle}>{label}</Text>
        <Text variant="bodySmall" style={[muted, { marginLeft: 8 }]} testID={`channel-${provider}-status`}>
          {channel.online ? 'Running' : 'Not running'}
        </Text>
      </View>

      {channel.linked ? (
        <>
          <Text variant="bodyMedium" testID={`channel-${provider}-linked`}>
            Linked. Message Jarvis on {label}.
          </Text>
          <View style={[styles.row, { marginTop: 12 }]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text variant="bodyMedium">Send me reminders, alarms and timers</Text>
              <Text variant="bodySmall" style={muted}>
                Jarvis messages you on {label}, only for the ones you set. Off by default.
              </Text>
            </View>
            <Switch
              testID={`channel-${provider}-proactive`}
              value={!!channel.proactive}
              onValueChange={setProactive}
              disabled={busy}
            />
          </View>
          <Button
            testID={`channel-${provider}-unlink`}
            mode="text"
            textColor={theme.colors.error}
            onPress={unlink}
            disabled={busy}
            compact
            style={styles.start}
          >
            Unlink my {label}
          </Button>
        </>
      ) : code ? (
        <View testID={`channel-${provider}-code-box`}>
          <Text variant="bodyMedium">On {label}, send Jarvis this code with its link command:</Text>
          <Text variant="headlineSmall" selectable testID={`channel-${provider}-code`} style={styles.code}>
            {code.code}
          </Text>
          <Text variant="bodySmall" style={muted}>
            /jarvis link, then the code. It works once and expires in {Math.round(code.expires_in / 60)} minutes.
          </Text>
          <View style={[styles.row, { marginTop: 8 }]}>
            <Button testID={`channel-${provider}-check`} mode="contained-tonal" onPress={onChanged} compact>
              I sent it
            </Button>
            <Button testID={`channel-${provider}-newcode`} mode="text" onPress={makeCode} disabled={busy} compact>
              New code
            </Button>
          </View>
        </View>
      ) : !channel.online ? (
        <Text variant="bodyMedium">
          Not linked. It has to be running before you can link: check its package on the node it is installed on.
        </Text>
      ) : (
        <>
          <Text variant="bodyMedium">Not linked. Link your {label} account to talk to Jarvis there.</Text>
          {nodes.length > 1 && (
            <View style={{ marginTop: 8 }}>
              <Text variant="bodySmall" style={muted}>Answer through:</Text>
              <View style={styles.chips}>
                {nodes.map((n) => (
                  <Chip
                    key={n.node_id}
                    testID={`channel-${provider}-node-${n.node_id}`}
                    selected={pickedNode === n.node_id}
                    onPress={() => setPickedNode(n.node_id)}
                    style={{ marginRight: 6, marginTop: 6 }}
                  >
                    {nodeLabel(n)}
                  </Chip>
                ))}
              </View>
            </View>
          )}
          <Button
            testID={`channel-${provider}-link`}
            mode="contained-tonal"
            icon="link"
            onPress={makeCode}
            disabled={busy || (nodes.length > 1 && !pickedNode)}
            loading={busy}
            compact
            style={[styles.start, { marginTop: 12 }]}
          >
            Link my {label}
          </Button>
        </>
      )}
      {error && <HelperText type="error" visible testID={`channel-${provider}-error`}>{error}</HelperText>}
    </View>
  );
};

const ChannelsCard = ({ householdId }: { householdId: string }) => {
  const theme = useTheme();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [nodes, setNodes] = useState<NodeInfo[]>([]);

  const refresh = useCallback(async () => {
    try {
      setChannels(await listChannels(householdId));
    } catch {
      setChannels([]); // an older server: no card
    }
  }, [householdId]);

  useEffect(() => {
    refresh();
    listNodes(householdId)
      .then(setNodes)
      .catch(() => setNodes([]));
  }, [householdId, refresh]);

  if (channels.length === 0) return null;

  return (
    <Card style={styles.card} testID="channels-card">
      <Card.Content>
        <Text variant="titleMedium" style={styles.sectionTitle}>Chat channels</Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          Talk to Jarvis from a chat service. Jarvis answers only accounts that are linked, and
          only where it was asked.
        </Text>
        {channels.map((c) => (
          <ChannelRow key={c.provider} householdId={householdId} channel={c} nodes={nodes} onChanged={refresh} />
        ))}
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { marginBottom: 16 },
  sectionTitle: { fontWeight: '600', marginBottom: 12 },
  subTitle: { fontWeight: '600' },
  channel: { marginTop: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
  start: { alignSelf: 'flex-start', marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  code: { fontFamily: 'monospace', letterSpacing: 4, marginVertical: 8 },
});

export default ChannelsCard;
