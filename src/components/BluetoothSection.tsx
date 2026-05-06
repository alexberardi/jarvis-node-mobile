/**
 * BluetoothSection — scan, pair, and manage Bluetooth devices on a node.
 *
 * UX flow:
 * 1. Shows currently paired/connected devices on mount
 * 2. User taps "Scan" → role picker (Speaker / Audio Input)
 * 3. Scan runs on node (polls every 2s) → results appear as tappable list
 * 4. User taps device → pair + connect + audio route
 * 5. "Make Discoverable" for reverse flow (phone → Pi)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Divider,
  Icon,
  List,
  Snackbar,
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
  requestBluetoothScan,
} from '../api/bluetoothApi';

interface Props {
  nodeId: string;
}

type Phase =
  | 'idle'
  | 'role_picker'
  | 'scanning'
  | 'results'
  | 'pairing'
  | 'discoverable';

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
  const [selectedRole, setSelectedRole] = useState<string>('source');
  const [pairingMac, setPairingMac] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [discoverableCountdown, setDiscoverableCountdown] = useState(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load current status on mount
  useEffect(() => {
    loadStatus();
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
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

  // ── Scan Flow ──────────────────────────────────────────────────────────

  const startScan = useCallback(async (role: string) => {
    setSelectedRole(role);
    setPhase('scanning');
    setDevices([]);
    setError(null);

    try {
      const { id: requestId } = await requestBluetoothScan(nodeId, role);

      // Poll every 2s
      pollTimerRef.current = setInterval(async () => {
        try {
          const result = await pollBluetoothScan(nodeId, requestId);
          if (result.status === 'completed' && result.devices) {
            clearInterval(pollTimerRef.current!);
            pollTimerRef.current = null;
            setDevices(result.devices);
            setPhase('results');
          } else if (result.status === 'failed') {
            clearInterval(pollTimerRef.current!);
            pollTimerRef.current = null;
            setError(result.error_message || 'Scan failed');
            setPhase('idle');
          }
        } catch {
          clearInterval(pollTimerRef.current!);
          pollTimerRef.current = null;
          setError('Lost connection while scanning');
          setPhase('idle');
        }
      }, 2000);
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Unknown error';
      setError(`Failed to start scan: ${detail}`);
      setPhase('idle');
    }
  }, [nodeId]);

  // ── Pair Flow ──────────────────────────────────────────────────────────

  const handlePairDevice = useCallback(async (device: BluetoothDevice) => {
    setPairingMac(device.mac_address);
    setPhase('pairing');

    try {
      const { id: requestId } = await pairBluetoothDevice(
        nodeId,
        device.mac_address,
        selectedRole,
      );

      // Poll for pair result
      pollTimerRef.current = setInterval(async () => {
        try {
          const result = await pollBluetoothPair(nodeId, requestId);
          if (result.status === 'completed') {
            clearInterval(pollTimerRef.current!);
            pollTimerRef.current = null;
            setPairingMac(null);
            setSnackbar(`Connected to ${result.device_name || device.name}`);
            setPhase('idle');
            loadStatus();
          } else if (result.status === 'failed') {
            clearInterval(pollTimerRef.current!);
            pollTimerRef.current = null;
            setPairingMac(null);
            setError(result.error_message || 'Pairing failed');
            setPhase('results');
          }
        } catch {
          clearInterval(pollTimerRef.current!);
          pollTimerRef.current = null;
          setPairingMac(null);
          setError('Lost connection during pairing');
          setPhase('results');
        }
      }, 2000);
    } catch {
      setPairingMac(null);
      setError('Failed to start pairing');
      setPhase('results');
    }
  }, [nodeId, selectedRole, loadStatus]);

  // ── Disconnect ─────────────────────────────────────────────────────────

  const handleDisconnect = useCallback(async (device: BluetoothDevice) => {
    try {
      await disconnectBluetoothDevice(nodeId, device.mac_address);
      setSnackbar(`Disconnected ${device.name}`);
      loadStatus();
    } catch {
      setError('Failed to disconnect');
    }
  }, [nodeId, loadStatus]);

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
          if (!item.connected && phase === 'results') {
            handlePairDevice(item);
          }
        }}
        disabled={isPairing || item.connected}
      />
    );
  };

  return (
    <Card style={styles.card}>
      <Card.Title title="Bluetooth" left={(props) => <Icon {...props} source="bluetooth" size={24} />} />
      <Card.Content>
        {/* Current connected devices */}
        {status && status.connected.length > 0 && (
          <View style={styles.section}>
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
              Connected
            </Text>
            {status.connected.map((d) => (
              <List.Item
                key={d.mac_address}
                title={d.name}
                description={d.device_type}
                left={(props) => <List.Icon {...props} icon={DEVICE_TYPE_ICONS[d.device_type] || 'bluetooth'} />}
                right={() => (
                  <Button compact mode="text" onPress={() => handleDisconnect(d)}>
                    Disconnect
                  </Button>
                )}
              />
            ))}
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
            <Button
              mode="outlined"
              icon="broadcast"
              onPress={handleMakeDiscoverable}
              style={{ marginTop: 8 }}
            >
              Make Discoverable
            </Button>
          </View>
        )}

        {/* Phase: Role Picker */}
        {phase === 'role_picker' && (
          <View style={styles.section}>
            <Text variant="bodyMedium" style={{ marginBottom: 12 }}>
              What are you connecting?
            </Text>
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

        {/* Phase: Scanning */}
        {phase === 'scanning' && (
          <View style={styles.scanning}>
            <ActivityIndicator size="large" />
            <Text variant="bodyMedium" style={{ marginTop: 12 }}>
              Scanning for Bluetooth devices...
            </Text>
            <Button mode="text" onPress={() => {
              if (pollTimerRef.current) clearInterval(pollTimerRef.current);
              setPhase('idle');
            }} style={{ marginTop: 8 }}>
              Cancel
            </Button>
          </View>
        )}

        {/* Phase: Results */}
        {phase === 'results' && (
          <View style={styles.section}>
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
              {devices.length} device{devices.length !== 1 ? 's' : ''} found — tap to connect
            </Text>
            <FlatList
              data={devices}
              keyExtractor={(item) => item.mac_address}
              renderItem={renderDeviceItem}
              scrollEnabled={false}
            />
            <Button mode="text" onPress={() => setPhase('idle')} style={{ marginTop: 8 }}>
              Done
            </Button>
          </View>
        )}

        {/* Phase: Pairing */}
        {phase === 'pairing' && (
          <View style={styles.scanning}>
            <ActivityIndicator size="large" />
            <Text variant="bodyMedium" style={{ marginTop: 12 }}>
              Pairing and connecting...
            </Text>
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
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 16 },
  section: { marginTop: 8 },
  actions: { marginTop: 8 },
  roleButtons: { flexDirection: 'row', gap: 12 },
  roleButton: { flex: 1 },
  scanning: { alignItems: 'center', paddingVertical: 24 },
  discoverableCard: { alignItems: 'center', padding: 24, borderRadius: 12 },
  errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingHorizontal: 4 },
});
