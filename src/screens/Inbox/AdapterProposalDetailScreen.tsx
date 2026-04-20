/**
 * Adapter proposal detail / preview screen (Phase 7.3).
 *
 * Full per-command breakdown of before → after pass rates. Navigated to
 * from AdapterProposalScreen's Preview button. Mirrors the mobile-side
 * shape of the Phase 6 Pareto table that proved the win.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Divider,
  Icon,
  Text,
  useTheme,
} from 'react-native-paper';

import {
  AdapterProposal,
  applyProposal,
  getProposal,
  PerCommandDelta,
} from '../../api/adaptersApi';
import { useAuth } from '../../auth/AuthContext';
import { InboxStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<InboxStackParamList>;
type DetailRoute = RouteProp<InboxStackParamList, 'AdapterProposalDetail'>;

const AdapterProposalDetailScreen = () => {
  const route = useRoute<DetailRoute>();
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const { state: authState } = useAuth();

  const [proposal, setProposal] = useState<AdapterProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const { proposalId } = route.params;

  const load = useCallback(async () => {
    if (!authState.accessToken) return;
    try {
      setError(null);
      setLoading(true);
      const p = await getProposal(proposalId);
      setProposal(p);
    } catch {
      setError('Could not load proposal');
    } finally {
      setLoading(false);
    }
  }, [authState.accessToken, proposalId]);

  useEffect(() => {
    load();
  }, [load]);

  const onApply = useCallback(async () => {
    if (!proposal) return;
    setApplying(true);
    try {
      await applyProposal(proposal.id);
      Alert.alert('Applied', 'Voice assistant updated. You can revert at any time.');
      navigation.popToTop();
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to apply');
    } finally {
      setApplying(false);
    }
  }, [proposal, navigation]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error || !proposal) {
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

  const per = proposal.per_command_delta ?? {};
  const sorted = Object.entries(per).sort(
    ([, a], [, b]) => (b.delta_pp ?? 0) - (a.delta_pp ?? 0),
  );

  const wins = sorted.filter(([, row]) => row.delta_pp > 0);
  const losses = sorted.filter(([, row]) => row.delta_pp < 0);
  const unchanged = sorted.filter(([, row]) => row.delta_pp === 0);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { backgroundColor: theme.colors.background }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon source="arrow-left" size={24} color={theme.colors.onSurface} />
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, marginLeft: 8 }}>
            Back
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="headlineSmall" style={styles.heading}>
          Per-command breakdown
        </Text>
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}
        >
          Adapter {proposal.adapter_hash.slice(0, 12)}… tested against your
          current routing.
        </Text>

        {proposal.pass_rate_before !== null && proposal.pass_rate_after !== null && (
          <SummaryRow
            before={proposal.pass_rate_before}
            after={proposal.pass_rate_after}
            total={
              Object.values(per).reduce(
                (acc, row) => acc + (row.after?.total ?? 0),
                0,
              ) || null
            }
          />
        )}

        <Divider style={{ marginVertical: 16 }} />

        {sorted.length === 0 ? (
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            No per-command data available for this proposal.
          </Text>
        ) : (
          <>
            {wins.length > 0 && (
              <Section title="Improvements" tint="#16a34a">
                {wins.map(([cmd, row]) => (
                  <CommandRow key={cmd} name={cmd} row={row} />
                ))}
              </Section>
            )}
            {losses.length > 0 && (
              <Section title="Regressions" tint={theme.colors.error}>
                {losses.map(([cmd, row]) => (
                  <CommandRow key={cmd} name={cmd} row={row} />
                ))}
              </Section>
            )}
            {unchanged.length > 0 && (
              <Section
                title="No change"
                tint={theme.colors.onSurfaceVariant}
              >
                {unchanged.map(([cmd, row]) => (
                  <CommandRow key={cmd} name={cmd} row={row} />
                ))}
              </Section>
            )}
          </>
        )}

        {proposal.status === 'pending' && (
          <View style={styles.actions}>
            <Button
              mode="contained"
              onPress={onApply}
              loading={applying}
              disabled={applying}
              labelStyle={{ fontWeight: '600' }}
              style={styles.primary}
            >
              Apply
            </Button>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

// --- subviews ---

const SummaryRow: React.FC<{
  before: number;
  after: number;
  total: number | null;
}> = ({ before, after, total }) => {
  const theme = useTheme();
  const delta = after - before;
  return (
    <View style={styles.summaryRow}>
      <View style={styles.summaryCol}>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
          Before
        </Text>
        <Text variant="titleLarge" style={{ fontWeight: '600' }}>
          {before.toFixed(1)}%
        </Text>
      </View>
      <Icon
        source="arrow-right"
        size={20}
        color={theme.colors.onSurfaceVariant}
      />
      <View style={styles.summaryCol}>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
          After
        </Text>
        <Text variant="titleLarge" style={{ fontWeight: '600' }}>
          {after.toFixed(1)}%
        </Text>
      </View>
      <View style={styles.summaryCol}>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {total ? `${total} tests` : 'Delta'}
        </Text>
        <Text
          variant="titleLarge"
          style={{
            fontWeight: '600',
            color: delta >= 0 ? '#16a34a' : theme.colors.error,
          }}
        >
          {delta >= 0 ? '+' : ''}
          {delta.toFixed(1)}pp
        </Text>
      </View>
    </View>
  );
};

const Section: React.FC<React.PropsWithChildren<{
  title: string;
  tint: string;
}>> = ({ title, children, tint }) => (
  <View style={styles.section}>
    <Text variant="titleSmall" style={[styles.sectionTitle, { color: tint }]}>
      {title}
    </Text>
    {children}
  </View>
);

const CommandRow: React.FC<{
  name: string;
  row: PerCommandDelta;
}> = ({ name, row }) => {
  const theme = useTheme();
  const deltaColor =
    row.delta_pp > 0
      ? '#16a34a'
      : row.delta_pp < 0
      ? theme.colors.error
      : theme.colors.onSurfaceVariant;
  return (
    <View style={styles.commandRow}>
      <View style={{ flex: 1 }}>
        <Text variant="bodyMedium" style={{ fontWeight: '500' }}>
          {name}
        </Text>
        <Text
          variant="labelSmall"
          style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
        >
          {row.before.passed}/{row.before.total} → {row.after.passed}/
          {row.after.total}
        </Text>
      </View>
      <Text variant="bodyMedium" style={{ color: deltaColor, fontWeight: '600' }}>
        {row.delta_pp >= 0 ? '+' : ''}
        {row.delta_pp.toFixed(1)}pp
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
  heading: { fontWeight: 'bold', marginTop: 4, marginBottom: 4 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
  },
  summaryCol: { flex: 1 },
  section: { marginBottom: 16 },
  sectionTitle: { fontWeight: '600', marginBottom: 8 },
  commandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  actions: { marginTop: 24 },
  primary: { borderRadius: 8 },
});

export default AdapterProposalDetailScreen;
