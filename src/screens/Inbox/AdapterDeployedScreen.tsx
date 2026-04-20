/**
 * Adapter deployed confirmation screen (Phase 7.3).
 *
 * Landing page for adapter_deployed inbox items. Shows current deployment
 * metrics and a single Revert button that rolls back to the previous
 * adapter + provider pairing.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Chip,
  Divider,
  Icon,
  Text,
  useTheme,
} from 'react-native-paper';

import { revertDeployment } from '../../api/adaptersApi';
import { getInboxItem, InboxItem } from '../../api/inboxApi';
import { useAuth } from '../../auth/AuthContext';
import { InboxStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<InboxStackParamList>;
type DeployedRoute = RouteProp<InboxStackParamList, 'AdapterDeployed'>;

interface DeployedMetadata {
  adapter_hash?: string;
  previous_adapter_hash?: string | null;
  pass_rate?: number | null;
  latency_s?: number | null;
  provider_name?: string | null;
}

const AdapterDeployedScreen = () => {
  const route = useRoute<DeployedRoute>();
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const { state: authState } = useAuth();

  const [item, setItem] = useState<InboxItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reverting, setReverting] = useState(false);

  const { itemId } = route.params;

  const load = useCallback(async () => {
    if (!authState.accessToken) return;
    try {
      setError(null);
      setLoading(true);
      const data = await getInboxItem(itemId);
      setItem(data);
    } catch {
      setError('Could not load item');
    } finally {
      setLoading(false);
    }
  }, [authState.accessToken, itemId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRevert = useCallback(async () => {
    if (!item) return;
    const meta = (item.metadata ?? {}) as DeployedMetadata;
    const adapterHash = meta.adapter_hash;
    if (!adapterHash) {
      Alert.alert('Error', 'No adapter hash on this item');
      return;
    }

    Alert.alert(
      'Revert voice assistant?',
      'This will restore the previous adapter and prompt. You can apply a new proposal at any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revert',
          style: 'destructive',
          onPress: async () => {
            setReverting(true);
            try {
              await revertDeployment(adapterHash, item.household_id);
              Alert.alert(
                'Reverted',
                'The previous voice assistant is back in place.',
              );
              navigation.goBack();
            } catch (err: unknown) {
              Alert.alert(
                'Error',
                err instanceof Error ? err.message : 'Failed to revert',
              );
            } finally {
              setReverting(false);
            }
          },
        },
      ],
    );
  }, [item, navigation]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error || !item) {
    return (
      <View style={styles.center}>
        <Text variant="bodyLarge" style={{ color: theme.colors.error }}>
          {error || 'Item not found'}
        </Text>
        <Button mode="text" onPress={load} style={{ marginTop: 8 }}>
          Retry
        </Button>
      </View>
    );
  }

  const meta = (item.metadata ?? {}) as DeployedMetadata;
  const passRate = meta.pass_rate;
  const latency = meta.latency_s;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { backgroundColor: theme.colors.background }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon source="arrow-left" size={24} color={theme.colors.onSurface} />
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, marginLeft: 8 }}>
            Inbox
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Chip compact style={styles.chip} textStyle={styles.chipText}>
          voice assistant
        </Chip>

        <Text variant="headlineSmall" style={styles.heading}>
          {item.title}
        </Text>

        <Text
          variant="labelSmall"
          style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}
        >
          Deployed {new Date(item.created_at).toLocaleString()}
        </Text>

        <Divider style={{ marginBottom: 16 }} />

        <View style={styles.metaCard}>
          {meta.adapter_hash && (
            <Row label="Adapter" value={meta.adapter_hash.slice(0, 16) + '…'} />
          )}
          {meta.provider_name && <Row label="Provider" value={meta.provider_name} />}
          {passRate !== null && passRate !== undefined && (
            <Row label="Pass rate" value={`${passRate.toFixed(1)}%`} />
          )}
          {latency !== null && latency !== undefined && (
            <Row label="Avg latency" value={`${latency.toFixed(2)}s`} />
          )}
          {meta.previous_adapter_hash && (
            <Row
              label="Previous"
              value={meta.previous_adapter_hash.slice(0, 16) + '…'}
            />
          )}
        </View>

        <View style={styles.actions}>
          <Button
            mode="contained"
            onPress={onRevert}
            loading={reverting}
            disabled={reverting}
            buttonColor={theme.colors.error}
            textColor={theme.colors.onError}
            labelStyle={{ fontWeight: '600' }}
            style={styles.destructive}
          >
            Revert
          </Button>
        </View>
      </ScrollView>
    </View>
  );
};

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text
        variant="labelMedium"
        style={{ color: theme.colors.onSurfaceVariant }}
      >
        {label}
      </Text>
      <Text variant="bodyMedium" style={{ fontWeight: '500' }}>
        {value}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: { flexDirection: 'row', alignItems: 'center' },
  content: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heading: { fontWeight: 'bold', marginTop: 8, marginBottom: 4 },
  chip: { alignSelf: 'flex-start' },
  chipText: { fontSize: 10, lineHeight: 14 },
  metaCard: { gap: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  actions: { marginTop: 32 },
  destructive: { borderRadius: 8 },
});

export default AdapterDeployedScreen;
