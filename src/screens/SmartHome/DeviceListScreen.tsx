/**
 * Device list screen: shows all smart home devices (HA + direct WiFi).
 * Allows toggling devices and viewing their status.
 */

import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Chip,
  Divider,
  IconButton,
  List,
  Snackbar,
  Text,
  useTheme,
} from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { listDevices } from '../../api/smartHomeApi';
import type { DeviceListItem } from '../../types/SmartHome';
import type { SmartHomeSetupParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<SmartHomeSetupParamList, 'DeviceList'>;

// Domain → icon mapping
const DOMAIN_ICONS: Record<string, string> = {
  light: 'lightbulb-outline',
  switch: 'power-plug-outline',
  fan: 'fan',
  cover: 'window-shutter',
  lock: 'lock-outline',
  climate: 'thermostat',
  vacuum: 'robot-vacuum',
  scene: 'palette-outline',
  script: 'script-outline',
  media_player: 'speaker',
};

// Source badge colors
const SOURCE_COLORS: Record<string, string> = {
  direct: '#4CAF50',
  home_assistant: '#03A9F4',
};

const DeviceListScreen: React.FC<Props> = ({ route }) => {
  const { householdId } = route.params;
  const theme = useTheme();
  const [sourceFilter, setSourceFilter] = useState<string | undefined>(undefined);
  const [snackbar, setSnackbar] = useState('');

  const { data: devices, isLoading, error, refetch } = useQuery({
    queryKey: ['devices', householdId, sourceFilter],
    queryFn: () => listDevices(householdId, { source: sourceFilter }),
    staleTime: 30_000,
  });

  const toggleFilter = useCallback((source: string) => {
    setSourceFilter(prev => (prev === source ? undefined : source));
  }, []);

  const renderDevice = useCallback(({ item }: { item: DeviceListItem }) => {
    const icon = DOMAIN_ICONS[item.domain] || 'devices';
    const sourceColor = SOURCE_COLORS[item.source] || theme.colors.outline;
    const subtitle = [
      item.room_name,
      item.manufacturer,
      item.protocol ? `via ${item.protocol}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    return (
      <List.Item
        title={item.name}
        description={subtitle || item.entity_id}
        left={props => <List.Icon {...props} icon={icon} />}
        right={() => (
          <View style={styles.rightContainer}>
            <Chip
              compact
              textStyle={styles.chipText}
              style={[styles.sourceBadge, { backgroundColor: sourceColor + '22' }]}
            >
              {item.source === 'direct' ? item.protocol || 'direct' : 'HA'}
            </Chip>
            {item.is_controllable && (
              <IconButton
                icon="power"
                size={20}
                onPress={() => setSnackbar(`Toggle ${item.name} (not yet wired)`)}
              />
            )}
          </View>
        )}
      />
    );
  }, [theme.colors.outline]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading devices...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text>Failed to load devices</Text>
      </View>
    );
  }

  const directCount = devices?.filter(d => d.source === 'direct').length ?? 0;
  const haCount = devices?.filter(d => d.source === 'home_assistant').length ?? 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Filter chips */}
      <View style={styles.filterRow}>
        <Chip
          selected={sourceFilter === undefined}
          onPress={() => setSourceFilter(undefined)}
          style={styles.filterChip}
        >
          All ({devices?.length ?? 0})
        </Chip>
        {directCount > 0 && (
          <Chip
            selected={sourceFilter === 'direct'}
            onPress={() => toggleFilter('direct')}
            style={styles.filterChip}
          >
            Direct ({directCount})
          </Chip>
        )}
        {haCount > 0 && (
          <Chip
            selected={sourceFilter === 'home_assistant'}
            onPress={() => toggleFilter('home_assistant')}
            style={styles.filterChip}
          >
            HA ({haCount})
          </Chip>
        )}
      </View>

      <Divider />

      <FlatList
        data={devices}
        keyExtractor={item => item.id}
        renderItem={renderDevice}
        ItemSeparatorComponent={Divider}
        refreshing={isLoading}
        onRefresh={refetch}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text>No devices found</Text>
          </View>
        }
      />

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar('')}
        duration={2000}
      >
        {snackbar}
      </Snackbar>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  loadingText: { marginTop: 12, opacity: 0.6 },
  filterRow: { flexDirection: 'row', padding: 12, gap: 8 },
  filterChip: { marginRight: 4 },
  rightContainer: { flexDirection: 'row', alignItems: 'center' },
  sourceBadge: { marginRight: 4 },
  chipText: { fontSize: 11 },
});

export default DeviceListScreen;
