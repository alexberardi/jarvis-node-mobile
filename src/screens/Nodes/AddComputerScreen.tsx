import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, Share, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Chip,
  Icon,
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
  type PendingPairing,
} from '../../api/pairingApi';
import { useAuth } from '../../auth/AuthContext';
import KeyboardSafeView from '../../components/KeyboardSafeView';

/**
 * "Add a computer" (install plan item 3.4): how to get the Jarvis Automation agent, and the
 * computers waiting to be approved. The agent on a computer shows a short code; the same code
 * shows up here, and any household member approves it into one of their own households and a
 * room, or denies it. cc only accepts the approver's own households, and the list it returns
 * names exactly those, so the picker never offers another.
 */

/** How often the waiting list refreshes while this screen is open. Codes last 10 minutes. */
export const PAIRING_POLL_MS = 5000;

type Notice = { kind: 'ok' | 'error'; text: string } | null;

const minutesLeft = (seconds: number): number => Math.max(1, Math.ceil(seconds / 60));

const platformName = (p?: string | null): string | null => {
  switch ((p ?? '').toLowerCase()) {
    case 'darwin':
    case 'macos':
      return 'macOS';
    case 'windows':
      return 'Windows';
    case 'linux':
      return 'Linux';
    default:
      return p || null;
  }
};

const PairingCard = ({
  pairing,
  households,
  defaultHouseholdId,
  onDone,
}: {
  pairing: PendingPairing;
  households: PairingHousehold[];
  defaultHouseholdId: string | null;
  onDone: (notice: Notice) => void;
}) => {
  const theme = useTheme();
  const initial =
    households.find((h) => h.id === defaultHouseholdId)?.id ?? households[0]?.id ?? '';
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
    if (householdId && !households.some((h) => h.id === householdId)) {
      setHouseholdId(households[0]?.id ?? '');
    }
  }, [households, householdId]);

  const run = async (action: () => Promise<unknown>, ok: string, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onDone({ kind: 'ok', text: ok });
    } catch (err) {
      if (mounted.current) setError(pairingErrorMessage(err, fallback));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const meta = [platformName(pairing.platform), pairing.requested_from].filter(Boolean).join(' · ');

  return (
    <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
      <View style={styles.cardHead}>
        <Icon source="laptop" size={22} color={theme.colors.onSurfaceVariant} />
        <View style={{ flex: 1 }}>
          <Text variant="titleMedium" numberOfLines={1}>{pairing.name}</Text>
          {!!meta && (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{meta}</Text>
          )}
        </View>
      </View>
      <Text
        accessibilityLabel={`Pairing code ${pairing.code}`}
        variant="headlineMedium"
        style={[styles.code, { backgroundColor: theme.colors.surfaceVariant, color: theme.colors.onSurface }]}
      >
        {pairing.code}
      </Text>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
        Approve only if the computer shows this same code. It expires in {minutesLeft(pairing.expires_in)} min.
      </Text>

      {households.length > 1 && (
        <>
          <Text variant="labelLarge" style={{ marginBottom: 6 }}>Household</Text>
          <View style={styles.chips}>
            {households.map((h) => (
              <Chip
                key={h.id}
                testID={`pairing-household-${pairing.code}-${h.id}`}
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
          testID={`pairing-household-${pairing.code}-${households[0].id}`}
          accessibilityState={{ selected: true }}
          variant="bodyMedium"
          style={{ marginBottom: 8 }}
        >
          Joins {households[0].name}
        </Text>
      )}

      <TextInput
        testID={`pairing-room-${pairing.code}`}
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
          testID={`pairing-deny-${pairing.code}`}
          mode="outlined"
          icon="close"
          disabled={busy}
          onPress={() =>
            run(() => denyPairing(pairing.code), `${pairing.name} denied.`, 'Could not deny the computer')
          }
        >
          Deny
        </Button>
        <Button
          testID={`pairing-approve-${pairing.code}`}
          mode="contained"
          icon="check"
          disabled={busy || !householdId}
          loading={busy}
          onPress={() =>
            run(
              () => approvePairing({ code: pairing.code, householdId, room }),
              `${pairing.name} approved. It finishes pairing in a few seconds, then shows up in your nodes.`,
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
  const [pairings, setPairings] = useState<PendingPairing[]>([]);
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
      setPairings(res.pairings);
      setHouseholds(res.households);
      setLoadError(null);
    } catch (err) {
      if (mounted.current) setLoadError(pairingErrorMessage(err, 'Could not load waiting computers'));
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoaded(true);
    }
  }, []);

  // Poll while the screen is focused: a computer's code shows up within a few seconds.
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
        ) : loadError && pairings.length === 0 ? (
          <View style={{ alignItems: 'flex-start' }}>
            <Text variant="bodyMedium" style={{ color: theme.colors.error }}>{loadError}</Text>
            <Button mode="text" onPress={() => void load()}>Retry</Button>
          </View>
        ) : pairings.length === 0 ? (
          <Surface
            testID="pairings-empty"
            style={[styles.empty, { borderColor: theme.colors.outlineVariant }]}
            elevation={0}
          >
            <ActivityIndicator size="small" />
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}>
              No computers waiting. Open the Jarvis Automation agent on the computer and choose
              {' "Show a pairing code"'}; its code appears here.
            </Text>
          </Surface>
        ) : (
          <View style={{ gap: 12 }}>
            {pairings.map((p) => (
              <PairingCard
                key={p.code}
                pairing={p}
                households={households}
                defaultHouseholdId={authState.activeHouseholdId}
                onDone={onDone}
              />
            ))}
          </View>
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
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  code: {
    fontFamily: 'monospace',
    letterSpacing: 4,
    textAlign: 'center',
    borderRadius: 8,
    paddingVertical: 8,
    marginBottom: 8,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingLeft: 12,
    marginBottom: 12,
  },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: 16,
  },
});

export default AddComputerScreen;
