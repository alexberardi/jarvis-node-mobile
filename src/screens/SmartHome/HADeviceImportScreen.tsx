import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
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
  Text,
} from 'react-native-paper';

import { fetchEnrichedEntities } from '../../services/haApiService';
import { EnrichedEntity, HAArea } from '../../types/SmartHome';
import { SmartHomeSetupParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<SmartHomeSetupParamList, 'HADeviceImport'>;

const DOMAIN_LABELS: Record<string, string> = {
  light: 'Lights',
  switch: 'Switches',
  cover: 'Covers',
  lock: 'Locks',
  climate: 'Climate',
  fan: 'Fans',
  media_player: 'Media',
  vacuum: 'Vacuums',
  scene: 'Scenes',
  script: 'Scripts',
  input_boolean: 'Toggles',
  automation: 'Automations',
  humidifier: 'Humidifiers',
  water_heater: 'Water Heaters',
};

const HADeviceImportScreen = ({ navigation, route }: Props) => {
  const { haUrl, haToken } = route.params;
  const [loading, setLoading] = useState(true);
  const [entities, setEntities] = useState<EnrichedEntity[]>([]);
  const [areas, setAreas] = useState<HAArea[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filterDomain, setFilterDomain] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchEnrichedEntities(haUrl, haToken);
      setEntities(result.entities);
      setAreas(result.areas);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch devices');
    }
    setLoading(false);
  }, [haUrl, haToken]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const toggleEntity = (entityId: string) => {
    setEntities((prev) =>
      prev.map((e) =>
        e.entity_id === entityId ? { ...e, selected: !e.selected } : e,
      ),
    );
  };

  const toggleAll = (domain: string) => {
    const domainEntities = entities.filter((e) => e.domain === domain);
    const allSelected = domainEntities.every((e) => e.selected);
    setEntities((prev) =>
      prev.map((e) =>
        e.domain === domain ? { ...e, selected: !allSelected } : e,
      ),
    );
  };

  const selectedCount = entities.filter((e) => e.selected).length;

  // Get unique domains for filter chips
  const domains = [...new Set(entities.map((e) => e.domain))].sort();

  const filteredEntities = filterDomain
    ? entities.filter((e) => e.domain === filterDomain)
    : entities;

  const handleImport = () => {
    const selected = entities.filter((e) => e.selected);
    navigation.navigate('DeviceRoomAssignment', {
      selectedDevices: JSON.stringify(selected),
      areas: JSON.stringify(areas),
      source: 'home_assistant',
      haUrl,
      haToken,
    });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text variant="bodyLarge" style={styles.loadingText}>
          Fetching devices from Home Assistant...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text variant="bodyLarge" style={styles.errorText}>
          {error}
        </Text>
        <Button mode="contained" onPress={loadDevices}>
          Retry
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text variant="headlineSmall" style={styles.title}>
        Import Devices
      </Text>
      <Text variant="bodyMedium" style={styles.subtitle}>
        {entities.length} controllable devices found. {selectedCount} selected.
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
          const count = entities.filter((e) => e.domain === domain).length;
          return (
            <Chip
              selected={filterDomain === domain}
              onPress={() =>
                setFilterDomain(filterDomain === domain ? null : domain)
              }
              style={styles.chip}
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
        >
          <Text variant="bodyMedium">Select/Deselect All</Text>
        </TouchableOpacity>
      )}

      {/* Entity list */}
      <FlatList
        data={filteredEntities}
        keyExtractor={(e) => e.entity_id}
        style={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.entityRow}
            onPress={() => toggleEntity(item.entity_id)}
          >
            <Checkbox
              status={item.selected ? 'checked' : 'unchecked'}
              onPress={() => toggleEntity(item.entity_id)}
            />
            <View style={styles.entityInfo}>
              <Text variant="bodyLarge">{item.name}</Text>
              <Text variant="bodySmall" style={styles.entityMeta}>
                {item.entity_id}
                {item.area_name ? ` \u2022 ${item.area_name}` : ''}
              </Text>
            </View>
            {item.state && (
              <Text variant="bodySmall" style={styles.stateText}>
                {item.state}
              </Text>
            )}
          </TouchableOpacity>
        )}
      />

      <View style={styles.bottomActions}>
        <Button
          mode="contained"
          onPress={handleImport}
          disabled={selectedCount === 0}
        >
          Import {selectedCount} Devices
        </Button>
        <Button mode="text" onPress={() => navigation.goBack()}>
          Back
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 64 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
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
  entityInfo: { flex: 1, marginLeft: 4 },
  entityMeta: { opacity: 0.5 },
  stateText: { opacity: 0.6, marginRight: 8 },
  loadingText: { marginTop: 16, opacity: 0.7 },
  errorText: { marginBottom: 16, opacity: 0.7 },
  bottomActions: { padding: 16, gap: 8 },
});

export default HADeviceImportScreen;
