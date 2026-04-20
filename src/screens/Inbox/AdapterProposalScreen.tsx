/**
 * Adapter proposal main screen (Phase 7.3).
 *
 * Landing page when the user taps an adapter_proposal inbox item. Shows the
 * headline metrics and three actions: Apply / Preview / Dismiss.
 *
 * Preview navigates to AdapterProposalDetailScreen for the full per-command
 * breakdown. Apply hits POST /adapters/proposals/{id}/apply and — on success
 * — closes back to the inbox list. Dismiss is fire-and-forget.
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

import {
  AdapterProposal,
  applyProposal,
  dismissProposal,
  getProposal,
} from '../../api/adaptersApi';
import { getInboxItem, InboxItem } from '../../api/inboxApi';
import { useAuth } from '../../auth/AuthContext';
import { InboxStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<InboxStackParamList>;
type ProposalRoute = RouteProp<InboxStackParamList, 'AdapterProposal'>;

const AdapterProposalScreen = () => {
  const route = useRoute<ProposalRoute>();
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const { state: authState } = useAuth();

  const [proposal, setProposal] = useState<AdapterProposal | null>(null);
  const [inboxItem, setInboxItem] = useState<InboxItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<'apply' | 'dismiss' | null>(null);

  const { itemId } = route.params;

  const load = useCallback(async () => {
    if (!authState.accessToken) return;
    try {
      setError(null);
      setLoading(true);
      const item = await getInboxItem(itemId);
      setInboxItem(item);
      const proposalId = item.metadata?.proposal_id as string | undefined;
      if (!proposalId) {
        setError('Proposal id missing from inbox item');
        return;
      }
      const p = await getProposal(proposalId);
      setProposal(p);
    } catch {
      setError('Could not load proposal');
    } finally {
      setLoading(false);
    }
  }, [authState.accessToken, itemId]);

  useEffect(() => {
    load();
  }, [load]);

  const onApply = useCallback(async () => {
    if (!proposal) return;
    setActing('apply');
    try {
      await applyProposal(proposal.id);
      Alert.alert('Applied', 'Voice assistant updated. You can revert at any time.');
      navigation.goBack();
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to apply');
    } finally {
      setActing(null);
    }
  }, [proposal, navigation]);

  const onDismiss = useCallback(async () => {
    if (!proposal) return;
    Alert.alert(
      'Dismiss proposal?',
      'The adapter stays available for 7 days in case you change your mind.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dismiss',
          style: 'destructive',
          onPress: async () => {
            setActing('dismiss');
            try {
              await dismissProposal(proposal.id);
              navigation.goBack();
            } catch (err: unknown) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to dismiss');
            } finally {
              setActing(null);
            }
          },
        },
      ],
    );
  }, [proposal, navigation]);

  const onPreview = useCallback(() => {
    if (!proposal) return;
    navigation.navigate('AdapterProposalDetail', { proposalId: proposal.id });
  }, [navigation, proposal]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error || !proposal || !inboxItem) {
    return (
      <View style={styles.center}>
        <Text variant="bodyLarge" style={{ color: theme.colors.error }}>
          {error || 'Proposal not found'}
        </Text>
        <Button mode="text" onPress={load} style={{ marginTop: 8 }}>
          Retry
        </Button>
      </View>
    );
  }

  const canAct = proposal.status === 'pending';

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
          {inboxItem.title}
        </Text>

        <Text
          variant="labelSmall"
          style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}
        >
          Trained on {proposal.trained_on_examples ?? '?'} examples · expires{' '}
          {new Date(proposal.expires_at).toLocaleDateString()}
        </Text>

        <Divider style={{ marginBottom: 16 }} />

        <HeadlineMetrics proposal={proposal} />

        {proposal.status !== 'pending' && (
          <Chip
            icon="information"
            style={{ alignSelf: 'flex-start', marginTop: 16 }}
          >
            Status: {proposal.status}
          </Chip>
        )}

        {canAct && (
          <View style={styles.actions}>
            <Button
              mode="contained"
              onPress={onApply}
              loading={acting === 'apply'}
              disabled={acting !== null}
              style={styles.primary}
              labelStyle={{ fontWeight: '600' }}
            >
              Apply
            </Button>
            <Button
              mode="outlined"
              onPress={onPreview}
              disabled={acting !== null}
              style={styles.secondary}
            >
              Preview
            </Button>
            <Button
              mode="text"
              onPress={onDismiss}
              loading={acting === 'dismiss'}
              disabled={acting !== null}
              textColor={theme.colors.error}
            >
              Dismiss
            </Button>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

// --- subviews ---

const HeadlineMetrics: React.FC<{ proposal: AdapterProposal }> = ({ proposal }) => {
  const {
    pass_rate_before: before,
    pass_rate_after: after,
    latency_before_s: latBefore,
    latency_after_s: latAfter,
  } = proposal;

  const accuracyDelta =
    before !== null && after !== null ? after - before : null;
  const latencyPct =
    latBefore !== null && latAfter !== null && latBefore > 0
      ? ((latAfter - latBefore) / latBefore) * 100
      : null;

  return (
    <View style={styles.metricsRow}>
      {accuracyDelta !== null && (
        <MetricCard
          label="Accuracy"
          value={`${after!.toFixed(1)}%`}
          delta={`${accuracyDelta >= 0 ? '+' : ''}${accuracyDelta.toFixed(1)}pp`}
          positive={accuracyDelta >= 0}
          caption={`from ${before!.toFixed(1)}%`}
        />
      )}
      {latencyPct !== null && (
        <MetricCard
          label="Latency"
          value={`${latAfter!.toFixed(2)}s`}
          delta={`${latencyPct >= 0 ? '+' : ''}${latencyPct.toFixed(0)}%`}
          // Latency: lower is positive.
          positive={latencyPct <= 0}
          caption={`from ${latBefore!.toFixed(2)}s`}
        />
      )}
    </View>
  );
};

const MetricCard: React.FC<{
  label: string;
  value: string;
  delta: string;
  positive: boolean;
  caption: string;
}> = ({ label, value, delta, positive, caption }) => {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.metricCard,
        { backgroundColor: theme.colors.surfaceVariant },
      ]}
    >
      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
        {label}
      </Text>
      <Text variant="headlineSmall" style={{ fontWeight: '700', marginTop: 4 }}>
        {value}
      </Text>
      <Text
        variant="labelMedium"
        style={{
          color: positive ? '#16a34a' : theme.colors.error,
          fontWeight: '600',
          marginTop: 2,
        }}
      >
        {delta}
      </Text>
      <Text
        variant="labelSmall"
        style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
      >
        {caption}
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
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  content: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heading: { fontWeight: 'bold', marginTop: 8, marginBottom: 4 },
  chip: { alignSelf: 'flex-start' },
  chipText: { fontSize: 10, lineHeight: 14 },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
  },
  actions: {
    marginTop: 32,
    gap: 12,
  },
  primary: {
    borderRadius: 8,
  },
  secondary: {
    borderRadius: 8,
  },
});

export default AdapterProposalScreen;
