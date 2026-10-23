import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ActivityIndicator,
  Button,
  Checkbox,
  Chip,
  Snackbar,
  Text,
  useTheme,
} from 'react-native-paper';
import { useQueryClient } from '@tanstack/react-query';

import * as smartHomeApi from '../../api/smartHomeApi';
import { useAuth } from '../../auth/AuthContext';
import type { DeviceImportItem, DiscoveredDeviceResult } from '../../types/SmartHome';
import type { DevicesStackParamList, SmartHomeSetupParamList } from '../../navigation/types';

// Works with both DevicesStackParamList and SmartHomeSetupParamList
type DevicesProps = NativeStackScreenProps<DevicesStackParamList, 'DeviceDiscovery'>;
type SmartHomeProps = NativeStackScreenProps<SmartHomeSetupParamList, 'DeviceDiscovery'>;
type Props = DevicesProps | SmartHomeProps;

const DOMAIN_LABELS: Record<string, string> = {
  light: 'Lights',
  switch: 'Switches',
  cover: 'Covers',
  lock: 'Locks',
  climate: 'Climate',
  fan: 'Fans',
  media_player: 'Media',
  vacuum: 'Vacuums',
  humidifier: 'Humidifiers',
  water_heater: 'Water Heaters',
};

const POLL_INTERVAL_MS = 2000;
// A node that is online answers a scan within seconds; one that never answers
// is offline or busy, so say so instead of spinning.
const POLL_TIMEOUT_MS = 30000;

type ScanState = 'scanning' | 'results' | 'error' | 'timeout';

const DeviceDiscoveryScreen = ({ navigation, route }: Props) => {
  const { nodeId } = route.params;
  const theme = useTheme();
  const { state: authState } = useAuth();
  const queryClient = useQueryClient();

  const [scanState, setScanState] = useState<ScanState>('scanning');
  const [devices, setDevices] = useState<(DiscoveredDeviceResult & { selected: boolean })[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filterDomain, setFilterDomain] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [snackbar, setSnackbar] = useState('');
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped by every new scan and on unmount: a poll from an older scan (or
  // one in flight when the screen closed) stops instead of scheduling more.
  const scanIdRef = useRef(0);

  // Determine if we're in the Devices stack (direct import) or SmartHome setup
  const isDevicesStack = (navigation as DevicesProps['navigation']).getState?.()
    ?.routes?.some((r: { name: string }) => r.name === 'DevicesList');

  const cleanup = useCallback(() => {
    scanIdRef.current += 1;
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const startScan = useCallback(async () => {
    cleanup();
    const scanId = scanIdRef.current;
    const stale = () => scanIdRef.current !== scanId;
    setScanState('scanning');
    setError(null);
    setDevices([]);

    try {
      const { id: requestId } = await smartHomeApi.requestDeviceScan(nodeId);
      if (stale()) return;
      const startTime = Date.now();

      const poll = async () => {
        if (stale()) return;
        if (Date.now() - startTime > POLL_TIMEOUT_MS) {
          setScanState('timeout');
          setError("The node didn't answer the scan. Is it online?");
          return;
        }

        try {
          const result = await smartHomeApi.pollDeviceScan(nodeId, requestId);
          if (stale()) return;

          if (result.status === 'completed' && result.devices) {
            setDevices(
              result.devices.map((d) => ({
                ...d,
                selected: false,
              })),
            );
            setScanState('results');
            return;
          }

          if (result.status === 'failed') {
            setScanState('error');
            setError(result.error_message || 'Scan failed');
            return;
          }

          // Still pending
          pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        } catch (e) {
          if (stale()) return;
          // 410 Gone = expired
          if (e && typeof e === 'object' && 'response' in e) {
            const resp = (e as { response?: { status?: number } }).response;
            if (resp?.status === 410) {
              setScanState('timeout');
              setError('Scan request expired');
              return;
            }
          }
          // Network error — retry
          pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      };

      await poll();
    } catch (e) {
      if (stale()) return;
      setScanState('error');
      setError(e instanceof Error ? e.message : 'Failed to start scan');
    }
  }, [nodeId, cleanup]);

  useEffect(() => {
    startScan();
    return cleanup;
  }, [startScan, cleanup]);

  const toggleDevice = (entityId: string) => {
    setDevices((prev) =>
      prev.map((d) =>
        d.entity_id === entityId && !d.already_registered
          ? { ...d, selected: !d.selected }
          : d,
      ),
    );
  };

  const toggleAll = (domain: string) => {
    const domainDevices = devices.filter(
      (d) => d.domain === domain && !d.already_registered,
    );
    const allSelected = domainDevices.every((d) => d.selected);
    setDevices((prev) =>
      prev.map((d) =>
        d.domain === domain && !d.already_registered
          ? { ...d, selected: !allSelected }
          : d,
      ),
    );
  };

  const selectableDevices = devices.filter((d) => !d.already_registered);
  const selectedCount = selectableDevices.filter((d) => d.selected).length;
  const domains = [...new Set(devices.map((d) => d.domain))].sort();
  const filteredDevices = filterDomain
    ? devices.filter((d) => d.domain === filterDomain)
    : devices;

  const handleImport = useCallback(async () => {
    const selected = devices.filter((d) => d.selected && !d.already_registered);
    const householdId = authState.activeHouseholdId;

    if (!householdId) {
      setSnackbar('No household selected');
      return;
    }

    if (isDevicesStack) {
      // Direct import — no room assignment step
      setImporting(true);
      try {
        const importItems: DeviceImportItem[] = selected.map((d) => ({
          entity_id: d.entity_id,
          name: d.name,
          domain: d.domain,
          device_class: d.device_class ?? undefined,
          manufacturer: d.manufacturer ?? undefined,
          model: d.model ?? undefined,
          source: 'direct' as const,
          protocol: d.protocol ?? undefined,
          local_ip: d.local_ip ?? undefined,
          mac_address: d.mac_address ?? undefined,
          cloud_id: d.cloud_id ?? undefined,
        }));

        const result = await smartHomeApi.importDevices(householdId, importItems);
        // Refresh the Devices list now rather than relying on its focus refetch.
        queryClient.invalidateQueries({ queryKey: ['devices', householdId] });
        setSnackbar(
          `Imported ${result.created} device${result.created !== 1 ? 's' : ''}`,
        );
        // Navigate back to DevicesList
        setTimeout(() => navigation.goBack(), 800);
      } catch (e) {
        setSnackbar(
          e instanceof Error ? e.message : 'Failed to import devices',
        );
      } finally {
        setImporting(false);
      }
    } else {
      // SmartHome setup flow — go to room assignment
      const asEntities = selected.map((d) => ({
        entity_id: d.entity_id,
        name: d.name,
        domain: d.domain,
        device_class: d.device_class,
        manufacturer: d.manufacturer,
        model: d.model,
        ha_device_id: null,
        area_id: null,
        area_name: null,
        state: null,
        selected: true,
        protocol: d.protocol,
        local_ip: d.local_ip,
        mac_address: d.mac_address,
        cloud_id: d.cloud_id,
      }));

      (navigation as SmartHomeProps['navigation']).navigate(
        'DeviceRoomAssignment',
        {
          selectedDevices: JSON.stringify(asEntities),
          areas: JSON.stringify([]),
          source: 'direct',
        },
      );
    }
  }, [devices, authState.activeHouseholdId, isDevicesStack, navigation, queryClient]);

  if (scanState === 'scanning') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text variant="bodyLarge" style={styles.loadingText}>
          Scanning for devices...
        </Text>
        <Text
          variant="bodySmall"
          style={{ opacity: 0.5, marginTop: 8, textAlign: 'center' }}
        >
          The node is checking for WiFi and cloud devices.{'\n'}This may take a
          moment.
        </Text>
      </View>
    );
  }

  if (scanState === 'error' || scanState === 'timeout') {
    return (
      <View style={styles.centered}>
        <Text
          variant="bodyLarge"
          style={{ color: theme.colors.error, textAlign: 'center', marginBottom: 16 }}
        >
          {error}
        </Text>
        <Button mode="contained" onPress={startScan} testID="retry-scan-button">
          Retry
        </Button>
        <Button
          mode="text"
          onPress={() => navigation.goBack()}
          style={{ marginTop: 8 }}
          testID="error-back-button"
        >
          Back
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text variant="headlineSmall" style={styles.title}>
        Discovered Devices
      </Text>
      <Text variant="bodyMedium" style={styles.subtitle}>
        {devices.length} device{devices.length !== 1 ? 's' : ''} found.{' '}
        {selectedCount} selected for import.
      </Text>

      {/* Domain filter chips */}
      <FlatList
        horizontal
        data={domains}
        keyExtractor={(d) => d}
        showsHorizontalScrollIndicator={false}
        style={styles.chipList}
        contentContainerStyle={styles.chipContent}
        renderItem={({ item: domain }) => {
          const count = devices.filter((d) => d.domain === domain).length;
          return (
            <Chip
              selected={filterDomain === domain}
              onPress={() =>
                setFilterDomain(filterDomain === domain ? null : domain)
              }
              style={styles.chip}
              testID={`domain-chip-${domain}`}
            >
              {DOMAIN_LABELS[domain] || domain} ({count})
            </Chip>
          );
        }}
      />

      {/* Select all for current filter */}
      {filterDomain && (
        <TouchableOpacity
          style={styles.selectAllRow}
          onPress={() => toggleAll(filterDomain)}
          testID="select-all-button"
        >
          <Text variant="bodyMedium">Select/Deselect All</Text>
        </TouchableOpacity>
      )}

      {/* Device list */}
      <FlatList
        data={filteredDevices}
        keyExtractor={(d) => d.entity_id}
        style={styles.list}
        renderItem={({ item }) => {
          const isRegistered = item.already_registered;
          return (
            <TouchableOpacity
              style={[styles.entityRow, isRegistered && styles.registeredRow]}
              onPress={() => !isRegistered && toggleDevice(item.entity_id)}
              disabled={isRegistered}
              testID={`device-row-${item.entity_id}`}
            >
              <Checkbox
                status={
                  isRegistered
                    ? 'indeterminate'
                    : item.selected
                      ? 'checked'
                      : 'unchecked'
                }
                onPress={() => !isRegistered && toggleDevice(item.entity_id)}
                disabled={isRegistered}
                testID={`device-checkbox-${item.entity_id}`}
              />
              <View style={styles.entityInfo}>
                <Text
                  variant="bodyLarge"
                  style={isRegistered ? styles.registeredText : undefined}
                >
                  {item.name}
                </Text>
                <Text variant="bodySmall" style={styles.entityMeta}>
                  {item.protocol ? `${item.protocol} \u2022 ` : ''}
                  {item.entity_id}
                </Text>
                {isRegistered && (
                  <Text
                    variant="labelSmall"
                    style={{ color: theme.colors.primary, marginTop: 2 }}
                  >
                    Already added
                  </Text>
                )}
              </View>
              {item.manufacturer && (
                <Text variant="bodySmall" style={styles.manufacturerText}>
                  {item.manufacturer}
                </Text>
              )}
            </TouchableOpacity>
          );
        }}
      />

      <View style={styles.bottomActions}>
        <Button
          mode="contained"
          onPress={handleImport}
          disabled={selectedCount === 0 || importing}
          loading={importing}
          testID="import-devices-button"
        >
          Import {selectedCount} Device{selectedCount !== 1 ? 's' : ''}
        </Button>
        <Button mode="outlined" onPress={startScan} testID="rescan-button">
          Re-scan
        </Button>
        <Button mode="text" onPress={() => navigation.goBack()} testID="back-button">
          Back
        </Button>
      </View>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar('')}
        duration={3000}
      >
        {snackbar}
      </Snackbar>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 64 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  title: { fontWeight: 'bold', paddingHorizontal: 16, marginBottom: 4 },
  subtitle: { paddingHorizontal: 16, opacity: 0.6, marginBottom: 12 },
  chipList: { maxHeight: 48 },
  chipContent: { paddingHorizontal: 16, gap: 8 },
  chip: {},
  selectAllRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  list: { flex: 1 },
  entityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  registeredRow: {
    opacity: 0.5,
  },
  registeredText: {
    textDecorationLine: 'line-through',
  },
  entityInfo: { flex: 1, marginLeft: 4 },
  entityMeta: { opacity: 0.5 },
  manufacturerText: { opacity: 0.5, marginRight: 8 },
  loadingText: { marginTop: 16, opacity: 0.7 },
  bottomActions: { padding: 16, gap: 8 },
});

export default DeviceDiscoveryScreen;
