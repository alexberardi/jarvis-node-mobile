import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, Share, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Chip,
  IconButton,
  Surface,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import {
  AGENT_DOWNLOAD_URL,
  approvePairing,
  DEFAULT_PAIRING_ROOM,
  denyPairing,
  listPairings,
  pairingErrorMessage,
  type PairingHousehold,
} from '../../api/pairingApi';
import { useAuth } from '../../auth/AuthContext';
import KeyboardSafeView from '../../components/KeyboardSafeView';

/**
 * "Add a computer": how to get the Jarvis Automation agent, and approving it. The agent on a
 * computer shows a short code. The server never lists the codes (only someone who can see the
 * computer may approve it), so the member types it here, picks one of their own households and a
 * room, and approves or denies. The server only accepts the approver's own households, and the
 * list it returns names exactly those, so the picker never offers another.
 */

/** How often the waiting count refreshes while this screen is open. Codes last 10 minutes. */
export const PAIRING_POLL_MS = 5000;

type Notice = { kind: 'ok' | 'error'; text: string } | null;

const ApproveForm = ({
  households,
  defaultHouseholdId,
  onDone,
}: {
  households: PairingHousehold[];
  defaultHouseholdId: string | null;
  onDone: (notice: Notice) => void;
}) => {
  const theme = useTheme();
  const initial =
    households.find((h) => h.id === defaultHouseholdId)?.id ?? households[0]?.id ?? '';
  const [code, setCode] = useState('');
  const [householdId, setHouseholdId] = useState(initial);
  const [room, setRoom] = useState(DEFAULT_PAIRING_ROOM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => {
    mounted.current = false;
  }, []);

  // A household the list no longer names (membership changed) falls back to a listed one.
  useEffect(() => {
    if (!households.some((h) => h.id === householdId)) {
      setHouseholdId(households[0]?.id ?? '');
    }
  }, [households, householdId]);

  const typed = code.trim();
  const householdName = households.find((h) => h.id === householdId)?.name ?? '';

  const run = async (action: () => Promise<unknown>, ok: string, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (mounted.current) setCode('');
      onDone({ kind: 'ok', text: ok });
    } catch (err) {
      if (mounted.current) setError(pairingErrorMessage(err, fallback));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
      <TextInput
        testID="pairing-code-input"
        mode="outlined"
        label="Code shown on the computer"
        placeholder="ABCD-EFGH"
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
        disabled={busy}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        style={[styles.codeInput, { marginBottom: 12 }]}
      />

      {households.length > 1 && (
        <>
          <Text variant="labelLarge" style={{ marginBottom: 6 }}>Household</Text>
          <View style={styles.chips}>
            {households.map((h) => (
              <Chip
                key={h.id}
                testID={`pairing-household-${h.id}`}
                selected={h.id === householdId}
                showSelectedCheck
                disabled={busy}
                onPress={() => setHouseholdId(h.id)}
                accessibilityState={{ selected: h.id === householdId, disabled: busy }}
              >
                {h.name}
              </Chip>
            ))}
          </View>
        </>
      )}
      {households.length === 1 && (
        <Text
          testID={`pairing-household-${households[0].id}`}
          accessibilityState={{ selected: true }}
          variant="bodyMedium"
          style={{ marginBottom: 8 }}
        >
          Joins {households[0].name}
        </Text>
      )}

      <TextInput
        testID="pairing-room"
        mode="outlined"
        dense
        label="Room"
        value={room}
        onChangeText={setRoom}
        disabled={busy}
        autoCapitalize="none"
        style={{ marginBottom: 12 }}
      />

      {error && (
        <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 8 }}>{error}</Text>
      )}

      <View style={styles.actions}>
        <Button
          testID="pairing-deny"
          mode="outlined"
          icon="close"
          disabled={busy || !typed}
          onPress={() => run(() => denyPairing(typed), 'Pairing denied.', 'Could not deny the computer')}
        >
          Deny
        </Button>
        <Button
          testID="pairing-approve"
          mode="contained"
          icon="check"
          disabled={busy || !typed || !householdId}
          loading={busy}
          onPress={() =>
            run(
              () => approvePairing({ code: typed, householdId, room }),
              `Approved. The computer asks to confirm ${householdName} before it joins, then shows up in your nodes.`,
              'Could not approve the computer',
            )
          }
        >
          Approve
        </Button>
      </View>
    </Surface>
  );
};

const AddComputerScreen = () => {
  const navigation = useNavigation();
  const theme = useTheme();
  const { state: authState } = useAuth();
  const [waiting, setWaiting] = useState(0);
  const [households, setHouseholds] = useState<PairingHousehold[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [copied, setCopied] = useState(false);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => () => {
    mounted.current = false;
  }, []);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await listPairings();
      if (!mounted.current) return;
      setWaiting(res.waiting);
      setHouseholds(res.households);
      setLoadError(null);
    } catch (err) {
      if (mounted.current) setLoadError(pairingErrorMessage(err, 'Could not load your households'));
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoaded(true);
    }
  }, []);

  // Poll while the screen is focused, so the waiting count follows the computer.
  useFocusEffect(
    useCallback(() => {
      void load();
      const t = setInterval(() => void load(), PAIRING_POLL_MS);
      return () => clearInterval(t);
    }, [load]),
  );

  const onDone = useCallback(
    (n: Notice) => {
      setNotice(n);
      void load();
    },
    [load],
  );

  const copyLink = async () => {
    await Clipboard.setStringAsync(AGENT_DOWNLOAD_URL);
    if (mounted.current) setCopied(true);
  };

  return (
    <KeyboardSafeView style={styles.container}>
      <View style={[styles.header, { borderBottomColor: theme.colors.outlineVariant }]}>
        <IconButton icon="arrow-left" accessibilityLabel="Back" onPress={() => navigation.goBack()} />
        <Text variant="headlineSmall" style={{ fontWeight: 'bold', flex: 1 }}>Add a computer</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text variant="titleMedium" style={styles.step}>1. Get the agent on the computer</Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
          On the computer, download the Jarvis Automation agent for macOS, Windows or Linux and open
          it. It finds this server and shows a pairing code.
        </Text>
        <Surface style={[styles.linkBox, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
          <Text selectable variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
            {AGENT_DOWNLOAD_URL}
          </Text>
        </Surface>
        <View style={styles.linkActions}>
          <Button
            testID="add-computer-copy-link"
            mode="outlined"
            icon={copied ? 'check' : 'content-copy'}
            compact
            onPress={copyLink}
          >
            {copied ? 'Copied' : 'Copy link'}
          </Button>
          <Button
            testID="add-computer-share-link"
            mode="outlined"
            icon="share-variant"
            compact
            onPress={() => {
              Share.share({ message: AGENT_DOWNLOAD_URL }).catch(() => {});
            }}
          >
            Share
          </Button>
          <Button
            testID="add-computer-open-link"
            mode="outlined"
            icon="open-in-new"
            compact
            onPress={() => {
              Linking.openURL(AGENT_DOWNLOAD_URL).catch(() => {});
            }}
          >
            Open
          </Button>
        </View>

        <Text variant="titleMedium" style={styles.step}>2. Approve its code</Text>

        {notice && (
          <Surface
            testID="pairing-notice"
            style={[
              styles.notice,
              { backgroundColor: notice.kind === 'ok' ? theme.colors.secondaryContainer : theme.colors.errorContainer },
            ]}
            elevation={0}
          >
            <Text variant="bodyMedium" style={{ flex: 1 }}>{notice.text}</Text>
            <IconButton icon="close" size={18} accessibilityLabel="Dismiss" onPress={() => setNotice(null)} />
          </Surface>
        )}

        {!loaded ? (
          <ActivityIndicator style={{ marginTop: 16 }} />
        ) : loadError && households.length === 0 ? (
          <View style={{ alignItems: 'flex-start' }}>
            <Text variant="bodyMedium" style={{ color: theme.colors.error }}>{loadError}</Text>
            <Button mode="text" onPress={() => void load()}>Retry</Button>
          </View>
        ) : (
          <>
            <Text
              testID="pairings-waiting"
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}
            >
              {waiting === 0
                ? 'No computers waiting yet. On the computer, open the Jarvis Automation agent and choose "Show a pairing code", then type the code below.'
                : `${waiting === 1 ? '1 computer is' : `${waiting} computers are`} waiting. Type the code shown on the computer.`}
            </Text>
            <ApproveForm
              households={households}
              defaultHouseholdId={authState.activeHouseholdId}
              onDone={onDone}
            />
          </>
        )}
      </ScrollView>
    </KeyboardSafeView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scroll: { padding: 16, paddingBottom: 48 },
  step: { fontWeight: '600', marginTop: 8, marginBottom: 6 },
  linkBox: { borderRadius: 8, padding: 12 },
  linkActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 16 },
  card: { borderRadius: 12, padding: 16 },
  codeInput: { fontFamily: 'monospace', letterSpacing: 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingLeft: 12,
    marginBottom: 12,
  },
});

export default AddComputerScreen;
