/**
 * BluetoothSection — scan, pair, and manage Bluetooth devices on a node.
 *
 * UX flow:
 * 1. Shows currently paired/connected devices on mount
 * 2. User taps "Scan" → role picker (Speaker / Audio Input)
 * 3. Scan runs on node (polls every 1s) → devices appear as they're found
 * 4. User taps device (even mid-scan) → pair + connect + audio route
 * 5. "Make Discoverable" for reverse flow (phone → Pi)
 *
 * Saved devices are reloaded after a scan, a pair, a disconnect and a
 * forget, so a paired device always shows there with Forget.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Dialog,
  Divider,
  Icon,
  List,
  Portal,
  Snackbar,
  Switch,
  Text,
  useTheme,
} from 'react-native-paper';

import {
  BluetoothDevice,
  BluetoothStatusResponse,
  disconnectBluetoothDevice,
  getBluetoothStatus,
  makeDiscoverable,
  pairBluetoothDevice,
  pollBluetoothPair,
  pollBluetoothScan,
  releaseBluetoothDevice,
  requestBluetoothScan,
  setBluetoothAutoConnect,
} from '../api/bluetoothApi';
import { helpCopy } from '../copy/help';
import { HelpIcon } from './HelpIcon';

interface Props {
  nodeId: string;
}

type Phase =
  | 'idle'
  | 'role_picker'
  | 'results'
  | 'discoverable';

// Disconnect and forget are fire-and-forget on the node (202), so a reload
// right away usually reads the old state: reload again after these delays.
const STATUS_REFRESH_DELAYS_MS = [1500, 4000];

const DEVICE_TYPE_ICONS: Record<string, string> = {
  audio_sink: 'speaker',
  audio_source: 'microphone',
  phone: 'cellphone',
  unknown: 'bluetooth',
};

export const BluetoothSection = ({ nodeId }: Props) => {
  const theme = useTheme();
  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState<BluetoothStatusResponse | null>(null);
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>('source');
  const [pairingMac, setPairingMac] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [discoverableCountdown, setDiscoverableCountdown] = useState(0);
  // Optimistic local state for the per-device auto-reconnect switch.
  // The status endpoint doesn't return auto_connect yet, so we assume
  // `true` (the node's default) until the user toggles it; tapping the
  // switch fires the command and updates this map.
  const [autoConnect, setAutoConnect] = useState<Record<string, boolean>>({});
  const [forgetTarget, setForgetTarget] = useState<BluetoothDevice | null>(null);
  // Scan and pair poll on separate timers so a pair can run mid-scan.
  const scanPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pairPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRefreshRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const stopScanPoll = () => {
    if (scanPollRef.current) clearInterval(scanPollRef.current);
    scanPollRef.current = null;
  };

  const stopPairPoll = () => {
    if (pairPollRef.current) clearInterval(pairPollRef.current);
    pairPollRef.current = null;
  };

  // Load current status on mount
  useEffect(() => {
    loadStatus();
    return () => {
      stopScanPoll();
      stopPairPoll();
      if (countdownRef.current) clearInterval(countdownRef.current);
      statusRefreshRef.current.forEach(clearTimeout);
      statusRefreshRef.current = [];
    };
  }, [nodeId]);

  const loadStatus = useCallback(async () => {
    try {
      const result = await getBluetoothStatus(nodeId);
      setStatus(result);
    } catch {
      // Status endpoint may not have data yet — that's fine
    }
  }, [nodeId]);

  // Reload now and again once the node has had time to apply the change.
  const refreshStatusSoon = useCallback(() => {
    loadStatus();
    statusRefreshRef.current.forEach(clearTimeout);
    statusRefreshRef.current = STATUS_REFRESH_DELAYS_MS.map((ms) =>
      setTimeout(loadStatus, ms),
    );
  }, [loadStatus]);

  // ── Scan Flow ──────────────────────────────────────────────────────────

  const startScan = useCallback(async (role: string) => {
    stopScanPoll();
    setSelectedRole(role);
    setPhase('results');
    setScanning(true);
    setDevices([]);
    setError(null);

    // A failed scan keeps the devices found so far; with none, back to idle.
    let found = 0;
    const endScan = (message: string | null) => {
      stopScanPoll();
      setScanning(false);
      if (message) setError(message);
      if (message && found === 0) setPhase('idle');
    };

    try {
      const { id: requestId } = await requestBluetoothScan(nodeId, role);

      // Poll every 1s: the node posts the devices found so far about once a second.
      const timer = setInterval(async () => {
        try {
          const result = await pollBluetoothScan(nodeId, requestId);
          if (scanPollRef.current !== timer) return; // stopped while in flight
          if (result.devices) {
            found = result.devices.length;
            setDevices(result.devices);
          }
          if (result.status === 'completed') {
            endScan(null);
            refreshStatusSoon();
          } else if (result.status === 'failed') {
            endScan(result.error_message || 'Scan failed');
          }
        } catch {
          if (scanPollRef.current === timer) endScan('Lost connection while scanning');
        }
      }, 1000);
      scanPollRef.current = timer;
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Unknown error';
      endScan(`Failed to start scan: ${detail}`);
      setPhase('idle');
    }
  }, [nodeId, refreshStatusSoon]);

  // ── Pair Flow ──────────────────────────────────────────────────────────

  const handlePairDevice = useCallback(async (device: BluetoothDevice) => {
    stopPairPoll();
    setPairingMac(device.mac_address);
    setError(null);

    const endPair = (message: string | null) => {
      stopPairPoll();
      setPairingMac(null);
      if (message) setError(message);
      refreshStatusSoon();
    };

    try {
      const { id: requestId } = await pairBluetoothDevice(
        nodeId,
        device.mac_address,
        selectedRole,
      );

      // Poll for pair result (the scan, if still running, keeps its own poll)
      pairPollRef.current = setInterval(async () => {
        try {
          const result = await pollBluetoothPair(nodeId, requestId);
          if (result.status === 'completed') {
            setSnackbar(`Connected to ${result.device_name || device.name}`);
            endPair(null);
          } else if (result.status === 'failed') {
            endPair(result.error_message || 'Pairing failed');
          }
        } catch {
          endPair('Lost connection during pairing');
        }
      }, 1000);
    } catch {
      endPair('Failed to start pairing');
    }
  }, [nodeId, selectedRole, refreshStatusSoon]);

  // ── Disconnect ─────────────────────────────────────────────────────────

  const handleDisconnect = useCallback(async (device: BluetoothDevice) => {
    try {
      await disconnectBluetoothDevice(nodeId, device.mac_address);
      setSnackbar(`Disconnected ${device.name}`);
      refreshStatusSoon();
    } catch {
      setError('Failed to disconnect');
    }
  }, [nodeId, refreshStatusSoon]);

  // ── Auto-reconnect toggle ──────────────────────────────────────────────

  const handleAutoConnectToggle = useCallback(async (
    device: BluetoothDevice,
    enabled: boolean,
  ) => {
    // Optimistic update — flip the switch immediately so the user sees
    // feedback even before the network round-trip lands.
    setAutoConnect((prev) => ({ ...prev, [device.mac_address]: enabled }));
    try {
      await setBluetoothAutoConnect(nodeId, device.mac_address, enabled);
    } catch {
      // Revert and surface — better than silently leaving a wrong state.
      setAutoConnect((prev) => ({ ...prev, [device.mac_address]: !enabled }));
      setError('Failed to update auto-reconnect');
    }
  }, [nodeId]);

  // ── Forget (with confirmation) ─────────────────────────────────────────

  const handleConfirmForget = useCallback(async () => {
    if (!forgetTarget) return;
    const target = forgetTarget;
    setForgetTarget(null);
    try {
      await releaseBluetoothDevice(nodeId, target.mac_address, true);
      setSnackbar(`Forgot ${target.name}`);
      refreshStatusSoon();
    } catch {
      setError('Failed to forget device');
    }
  }, [nodeId, forgetTarget, refreshStatusSoon]);

  // ── Discoverable ───────────────────────────────────────────────────────

  const handleMakeDiscoverable = useCallback(async () => {
    try {
      await makeDiscoverable(nodeId);
      setPhase('discoverable');
      setDiscoverableCountdown(120);

      countdownRef.current = setInterval(() => {
        setDiscoverableCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownRef.current!);
            countdownRef.current = null;
            setPhase('idle');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch {
      setError('Failed to make discoverable');
    }
  }, [nodeId]);

  // ── Render ─────────────────────────────────────────────────────────────

  // Saved devices already show with Forget; the scan list only offers new ones.
  const savedMacs = new Set(
    [...(status?.connected ?? []), ...(status?.paired ?? [])].map((d) => d.mac_address),
  );
  const scanDevices = devices.filter((d) => !savedMacs.has(d.mac_address));

  const renderSavedDevice = (d: BluetoothDevice) => {
    const icon = DEVICE_TYPE_ICONS[d.device_type] || 'bluetooth';
    const isConnected = d.connected;
    const ac = autoConnect[d.mac_address] ?? d.auto_connect ?? true;

    return (
      <Card key={d.mac_address} mode="outlined" style={styles.deviceCard}>
        <Card.Title
          title={d.name}
          subtitle={d.device_type}
          left={(props) => <Icon {...props} source={icon} size={28} />}
          right={() =>
            isConnected ? (
              <Chip compact style={{ marginRight: 12 }}>Connected</Chip>
            ) : (
              <Chip compact mode="outlined" style={{ marginRight: 12 }}>Paired</Chip>
            )
          }
        />
        <Card.Actions style={styles.deviceActions}>
          <View style={styles.autoRow}>
            <Text variant="bodySmall" style={{ marginRight: 8, color: theme.colors.onSurfaceVariant }}>
              Auto-reconnect
            </Text>
            <Switch value={ac} onValueChange={(v) => handleAutoConnectToggle(d, v)} />
          </View>
          <View style={styles.buttonRow}>
            {isConnected && (
              <Button compact mode="text" onPress={() => handleDisconnect(d)}>
                Disconnect
              </Button>
            )}
            <Button
              compact
              mode="text"
              textColor={theme.colors.error}
              onPress={() => setForgetTarget(d)}
            >
              Forget
            </Button>
          </View>
        </Card.Actions>
      </Card>
    );
  };

  const renderDeviceItem = ({ item }: { item: BluetoothDevice }) => {
    const icon = DEVICE_TYPE_ICONS[item.device_type] || 'bluetooth';
    const isPairing = pairingMac === item.mac_address;

    return (
      <List.Item
        title={item.name || 'Unknown Device'}
        description={item.mac_address}
        left={(props) => <List.Icon {...props} icon={icon} />}
        right={() =>
          isPairing ? (
            <ActivityIndicator size="small" />
          ) : item.connected ? (
            <Chip compact>Connected</Chip>
          ) : null
        }
        onPress={() => {
          if (!item.connected && !pairingMac) {
            handlePairDevice(item);
          }
        }}
        disabled={!!pairingMac || item.connected}
      />
    );
  };

  return (
    <Card style={styles.card}>
      <Card.Title title="Bluetooth" left={(props) => <Icon {...props} source="bluetooth" size={24} />} />
      <Card.Content>
        {/* Saved devices — connected first, then paired-but-not-connected.
            Each row gets the full Disconnect / Auto-reconnect / Forget controls. */}
        {status && (status.connected.length > 0 || status.paired.length > 0) && (
          <View style={styles.section}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                Saved devices
              </Text>
              <HelpIcon text={helpCopy.bluetooth.pairedVsConnected} size={16} />
            </View>
            {status.connected.map(renderSavedDevice)}
            {status.paired.map(renderSavedDevice)}
            <Divider style={{ marginVertical: 8 }} />
          </View>
        )}

        {/* Phase: Idle */}
        {phase === 'idle' && (
          <View style={styles.actions}>
            <Button
              mode="contained"
              icon="magnify"
              onPress={() => setPhase('role_picker')}
            >
              Scan for Devices
            </Button>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
              <Button
                mode="outlined"
                icon="broadcast"
                onPress={handleMakeDiscoverable}
                style={{ flex: 1 }}
              >
                Make Discoverable
              </Button>
              <HelpIcon text={helpCopy.bluetooth.makeDiscoverable} size={16} />
            </View>
          </View>
        )}

        {/* Phase: Role Picker */}
        {phase === 'role_picker' && (
          <View style={styles.section}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Text variant="bodyMedium">
                What are you connecting?
              </Text>
              <HelpIcon text={helpCopy.bluetooth.speakerRole} size={16} />
            </View>
            <View style={styles.roleButtons}>
              <Button
                mode="contained"
                icon="speaker"
                onPress={() => startScan('source')}
                style={styles.roleButton}
              >
                Speaker
              </Button>
              <Button
                mode="contained"
                icon="microphone"
                onPress={() => startScan('sink')}
                style={styles.roleButton}
              >
                Audio Input
              </Button>
            </View>
            <Button mode="text" onPress={() => setPhase('idle')} style={{ marginTop: 8 }}>
              Cancel
            </Button>
          </View>
        )}

        {/* Phase: Results — fills in live while the scan runs */}
        {phase === 'results' && (
          <View style={styles.section}>
            <View style={styles.resultsHeader}>
              {scanning && <ActivityIndicator size="small" style={{ marginRight: 8 }} />}
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}>
                {scanning
                  ? `Scanning… ${scanDevices.length} found${scanDevices.length > 0 ? ' — tap to connect' : ''}`
                  : `${scanDevices.length} device${scanDevices.length !== 1 ? 's' : ''} found — tap to connect`}
              </Text>
              {scanning && (
                <Button compact mode="text" onPress={() => {
                  stopScanPoll();
                  setScanning(false);
                }}>
                  Stop
                </Button>
              )}
            </View>
            <FlatList
              data={scanDevices}
              keyExtractor={(item) => item.mac_address}
              renderItem={renderDeviceItem}
              scrollEnabled={false}
            />
            <Button mode="text" onPress={() => {
              stopScanPoll();
              setScanning(false);
              setPhase('idle');
            }} style={{ marginTop: 8 }}>
              {scanning ? 'Cancel' : 'Done'}
            </Button>
          </View>
        )}

        {/* Phase: Discoverable */}
        {phase === 'discoverable' && (
          <View style={styles.section}>
            <View style={[styles.discoverableCard, { backgroundColor: theme.colors.primaryContainer }]}>
              <Icon source="broadcast" size={32} color={theme.colors.primary} />
              <Text variant="bodyMedium" style={{ marginTop: 8, textAlign: 'center' }}>
                This node is now discoverable.{'\n'}
                Open Bluetooth settings on your phone and connect.
              </Text>
              <Text variant="headlineSmall" style={{ marginTop: 8, fontWeight: 'bold', color: theme.colors.primary }}>
                {Math.floor(discoverableCountdown / 60)}:{(discoverableCountdown % 60).toString().padStart(2, '0')}
              </Text>
            </View>
            <Button mode="text" onPress={() => {
              if (countdownRef.current) clearInterval(countdownRef.current);
              setPhase('idle');
            }} style={{ marginTop: 8 }}>
              Cancel
            </Button>
          </View>
        )}

        {/* Error display */}
        {error && (
          <View style={styles.errorRow}>
            <Icon source="alert-circle" size={16} color={theme.colors.error} />
            <Text variant="bodySmall" style={{ color: theme.colors.error, marginLeft: 4, flex: 1 }}>
              {error}
            </Text>
            <Button compact mode="text" onPress={() => setError(null)}>
              Dismiss
            </Button>
          </View>
        )}
      </Card.Content>

      {/* Success snackbar */}
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)} duration={3000}>
        {snackbar || ''}
      </Snackbar>

      {/* Forget confirmation — destructive, requires explicit confirm */}
      <Portal>
        <Dialog visible={!!forgetTarget} onDismiss={() => setForgetTarget(null)}>
          <Dialog.Title>Forget device?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              This removes the pairing for {forgetTarget?.name || 'this device'}.
              You'll need to put it back in pairing mode and pair from scratch
              the next time you want to use it.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setForgetTarget(null)}>Cancel</Button>
            <Button onPress={handleConfirmForget} textColor={theme.colors.error}>
              Forget
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 16 },
  section: { marginTop: 8 },
  actions: { marginTop: 8 },
  roleButtons: { flexDirection: 'row', gap: 12 },
  roleButton: { flex: 1 },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  discoverableCard: { alignItems: 'center', padding: 24, borderRadius: 12 },
  errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingHorizontal: 4 },
  deviceCard: { marginBottom: 8 },
  deviceActions: { justifyContent: 'space-between', flexWrap: 'wrap' },
  autoRow: { flexDirection: 'row', alignItems: 'center' },
  buttonRow: { flexDirection: 'row' },
});
