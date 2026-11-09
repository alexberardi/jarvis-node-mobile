import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Text, TextInput, useTheme } from 'react-native-paper';

import { fetchTestRuns, sendToForge, type TestRun } from '../../api/testInstallApi';

// Runs keep coming in for the node's whole test window, so the list refreshes on its own.
const REFRESH_MS = 5000;

const failed = (run: TestRun): boolean =>
  typeof run.output === 'object' && run.output !== null && (run.output as { success?: unknown }).success === false;

/** What a run answered, in one line: its error when it failed, else its message or raw output. */
const outcome = (run: TestRun): string => {
  const o = run.output;
  if (typeof o === 'object' && o !== null) {
    const r = o as { error?: unknown; message?: unknown };
    const text = failed(run) ? r.error ?? r.message : r.message;
    if (typeof text === 'string') return text;
  }
  return typeof o === 'string' ? o : JSON.stringify(o);
};

/**
 * Send to Forge for a finished test install: a preview of what goes back to the Forge draft (the
 * install result and each run of its commands), an optional note and the send button.
 */
const SendToForgeCard = ({ nodeId, requestId }: { nodeId: string; requestId: string }) => {
  const theme = useTheme();
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(() => {
    fetchTestRuns(nodeId, requestId).then(setRuns).catch(() => {});
  }, [nodeId, requestId]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const handleSend = async () => {
    setSending(true);
    setResult(null);
    try {
      await sendToForge(nodeId, requestId, note);
      setResult({ ok: true, text: 'Sent. Open the Forge to fix it with this report.' });
      setNote('');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setResult({ ok: false, text: detail ?? 'Could not send to the Forge.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card style={styles.card} testID="send-to-forge-card">
      <Card.Content>
        <Text variant="titleMedium">Send to Forge</Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
          Try the command with Jarvis, then send what happened back to the Forge: the install result
          and each run, with what Jarvis passed in and what the command answered.
        </Text>
        {runs.length === 0 ? (
          <Text variant="bodySmall" testID="send-to-forge-no-runs" style={{ color: theme.colors.onSurfaceVariant }}>
            No runs yet.
          </Text>
        ) : (
          runs.map((run, i) => (
            <View key={i} style={styles.run} testID={`send-to-forge-run-${i}`}>
              <Text variant="labelMedium" style={{ color: failed(run) ? theme.colors.error : theme.colors.primary }}>
                {run.command} {failed(run) ? 'failed' : 'ran'}
              </Text>
              <Text variant="bodySmall" numberOfLines={3}>{outcome(run)}</Text>
            </View>
          ))
        )}
        <TextInput
          testID="send-to-forge-note"
          mode="outlined"
          dense
          multiline
          label="Note (optional)"
          value={note}
          onChangeText={setNote}
          style={styles.note}
        />
        {result && (
          <Text
            testID="send-to-forge-result"
            variant="bodySmall"
            style={{ color: result.ok ? theme.colors.primary : theme.colors.error, marginTop: 8 }}
          >
            {result.text}
          </Text>
        )}
      </Card.Content>
      <Card.Actions>
        <Button
          testID="send-to-forge-button"
          mode="contained"
          icon="send"
          onPress={handleSend}
          loading={sending}
          disabled={sending}
        >
          Send to Forge
        </Button>
      </Card.Actions>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { marginTop: 4 },
  run: { marginBottom: 8 },
  note: { marginTop: 8 },
});

export default SendToForgeCard;
