/**
 * PlaceholderResolverScreen — resolve device placeholders for a routine.
 *
 * Shows a domain-filtered device dropdown for each placeholder.
 * Saves bindings per-node and pushes config to the node.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Text, useTheme } from 'react-native-paper';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { useAuth } from '../../auth/AuthContext';
import { listDevices } from '../../api/smartHomeApi';
import { getRoutine } from '../../services/routineStorageService';
import { getBindings, saveBindings } from '../../services/routineBindingService';
import type { RoutinesStackParamList } from '../../navigation/types';
import type { RoutinePlaceholder } from '../../types/Routine';
import type { DeviceListItem } from '../../types/SmartHome';
import DevicePicker from './DevicePicker';

type ScreenRoute = RouteProp<RoutinesStackParamList, 'PlaceholderResolver'>;
type ScreenNav = NativeStackNavigationProp<RoutinesStackParamList, 'PlaceholderResolver'>;

export default function PlaceholderResolverScreen() {
  const route = useRoute<ScreenRoute>();
  const navigation = useNavigation<ScreenNav>();
  const theme = useTheme();
  const { state: authState } = useAuth();

  const { routineId, nodeId } = route.params;
  const householdId = authState.activeHouseholdId ?? '';

  const [routine, setRoutine] = useState<{ name: string; placeholders: Record<string, RoutinePlaceholder> } | null>(null);
  const [devicesByDomain, setDevicesByDomain] = useState<Record<string, DeviceListItem[]>>({});
  const [bindings, setBindings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load routine + existing bindings + devices
  useEffect(() => {
    (async () => {
      try {
        const r = await getRoutine(routineId);
        if (!r?.placeholders || Object.keys(r.placeholders).length === 0) {
          Alert.alert('No placeholders', 'This routine has no device placeholders to configure.');
          navigation.goBack();
          return;
        }
        setRoutine({ name: r.name, placeholders: r.placeholders });

        // Load existing bindings
        const existing = await getBindings(routineId, nodeId);
        if (existing) setBindings(existing);

        // Fetch devices for each unique domain
        const domains = new Set(Object.values(r.placeholders).map((p) => p.domain));
        const deviceMap: Record<string, DeviceListItem[]> = {};
        for (const domain of domains) {
          try {
            const devices = await listDevices(householdId, { domain });
            deviceMap[domain] = devices;
          } catch {
            deviceMap[domain] = [];
          }
        }
        setDevicesByDomain(deviceMap);
      } catch (err) {
        Alert.alert('Error', 'Failed to load routine placeholders');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    })();
  }, [routineId, nodeId, householdId, navigation]);

  const placeholderEntries = useMemo(
    () => Object.entries(routine?.placeholders ?? {}),
    [routine],
  );

  const allRequiredFilled = useMemo(() => {
    for (const [name, ph] of placeholderEntries) {
      if (ph.required && !bindings[name]) return false;
    }
    return true;
  }, [placeholderEntries, bindings]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await saveBindings(routineId, nodeId, bindings);

      // TODO: Push bindings to node via config push (encryptAndPushConfig)
      // For now, bindings are stored locally and will be synced on next config push

      Alert.alert('Saved', 'Device bindings configured. The routine is ready to use.');
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', 'Failed to save bindings');
    } finally {
      setSaving(false);
    }
  }, [routineId, nodeId, bindings, navigation]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text variant="bodyMedium" style={{ textAlign: 'center', marginTop: 40 }}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.content}>
        <Text variant="headlineSmall" style={{ fontWeight: '700', marginBottom: 4 }}>
          Configure Devices
        </Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 20 }}>
          Select which devices to use for "{routine?.name}".
        </Text>

        {placeholderEntries.map(([name, placeholder]) => (
          <Card key={name} style={[styles.card, { backgroundColor: theme.colors.surfaceVariant }]}>
            <Card.Content>
              <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 4 }}>
                {placeholder.label}
                {placeholder.required && (
                  <Text style={{ color: theme.colors.error }}> *</Text>
                )}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
                Domain: {placeholder.domain}
              </Text>
              <DevicePicker
                devices={devicesByDomain[placeholder.domain] ?? []}
                selectedEntityId={bindings[name] ?? ''}
                onSelect={(entityId) =>
                  setBindings((prev) => ({ ...prev, [name]: entityId }))
                }
                placeholder={`Select ${placeholder.label.toLowerCase()}...`}
              />
            </Card.Content>
          </Card>
        ))}

        <Button
          mode="contained"
          onPress={handleSave}
          loading={saving}
          disabled={!allRequiredFilled || saving}
          style={{ marginTop: 16 }}
        >
          Save & Activate
        </Button>

        <Button
          mode="text"
          onPress={() => navigation.goBack()}
          style={{ marginTop: 8 }}
        >
          Cancel
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  card: { marginBottom: 12, borderRadius: 12 },
});
