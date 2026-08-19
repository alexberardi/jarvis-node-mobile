/**
 * Signal Automations — the free-text-per-signal authoring screen.
 *
 * Lists the signal kinds this household can react to (from the CC catalog) and
 * lets an admin type a plain-English instruction per signal ("Lock my front door"
 * for *I leave home*). When the signal fires, Jarvis interprets the instruction
 * and acts — reversible actions run automatically; sensitive ones (e.g. unlocking)
 * ask for confirmation first.
 *
 * Reached from Household Settings. Storage + auth live in signalAutomationsApi.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Chip,
  SegmentedButtons,
  Switch,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import {
  getSignalAutomations,
  setSignalAutomation,
  type DeliveryMode,
  type SignalAutomation,
} from '../../api/signalAutomationsApi';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'SignalAutomations'>;

interface Draft {
  instruction: string;
  enabled: boolean;
  delivery: DeliveryMode;
}

const SignalAutomationsScreen = ({ navigation, route }: Props) => {
  const { householdId } = route.params;
  const theme = useTheme();

  // `items` is the server baseline; `drafts` is the editable copy. A card is
  // dirty (Save enabled) when its draft diverges from the baseline.
  const [items, setItems] = useState<SignalAutomation[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getSignalAutomations(householdId);
      setItems(data);
      setDrafts(
        Object.fromEntries(
          data.map((a) => [
            a.kind,
            { instruction: a.instruction, enabled: a.enabled, delivery: a.delivery },
          ]),
        ),
      );
      setError(null);
    } catch {
      setError('Could not load automations.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [householdId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const patchDraft = (kind: string, patch: Partial<Draft>) =>
    setDrafts((prev) => {
      const base: Draft = prev[kind] ?? {
        instruction: '',
        enabled: false,
        delivery: 'notification',
      };
      return { ...prev, [kind]: { ...base, ...patch } };
    });

  const isDirty = (a: SignalAutomation): boolean => {
    const d = drafts[a.kind];
    return (
      !!d &&
      (d.instruction !== a.instruction ||
        d.enabled !== a.enabled ||
        d.delivery !== a.delivery)
    );
  };

  const save = useCallback(
    async (a: SignalAutomation) => {
      const d = drafts[a.kind];
      if (!d) return;
      setSaving((s) => ({ ...s, [a.kind]: true }));
      try {
        const res = await setSignalAutomation(
          householdId,
          a.kind,
          d.instruction.trim(),
          d.enabled,
          d.delivery,
        );
        // Fold the saved values back into both the baseline and the draft so the
        // card is no longer dirty (a cleared rule comes back as instruction="").
        setItems((prev) =>
          prev
            ? prev.map((it) =>
                it.kind === a.kind
                  ? {
                      ...it,
                      instruction: res.instruction,
                      enabled: res.enabled,
                      delivery: res.delivery,
                    }
                  : it,
              )
            : prev,
        );
        setDrafts((prev) => ({
          ...prev,
          [a.kind]: {
            instruction: res.instruction,
            enabled: res.enabled,
            delivery: res.delivery,
          },
        }));
      } catch {
        Alert.alert('Save failed', 'Could not save this automation. Please try again.');
      } finally {
        setSaving((s) => ({ ...s, [a.kind]: false }));
      }
    },
    [drafts, householdId],
  );

  const renderBody = () => {
    if (loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <Button onPress={load}>Retry</Button>
        </View>
      );
    }
    return (
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text variant="bodyMedium" style={styles.intro}>
          Describe what Jarvis should do when something happens, and choose how it's
          delivered — run it automatically, or ask you to confirm first.
        </Text>

        {(items ?? []).map((a) => {
          const draft: Draft =
            drafts[a.kind] ?? { instruction: '', enabled: false, delivery: 'notification' };
          const hasText = draft.instruction.trim().length > 0;
          return (
            <Card key={a.kind} style={styles.card} testID={`automation-${a.kind}`}>
              <Card.Content>
                <View style={styles.headerRow}>
                  <Text variant="titleMedium" style={styles.title}>
                    {a.label}
                  </Text>
                  <Chip
                    compact
                    style={styles.chip}
                    testID={`chip-${a.kind}`}
                  >
                    {a.observed ? 'Active' : 'Possible'}
                  </Chip>
                </View>
                <Text variant="bodySmall" style={styles.desc}>
                  {a.description}
                </Text>

                <TextInput
                  testID={`instruction-${a.kind}`}
                  mode="outlined"
                  multiline
                  placeholder={`e.g. ${a.example}`}
                  value={draft.instruction}
                  onChangeText={(t) => patchDraft(a.kind, { instruction: t })}
                  style={styles.input}
                />

                <Text variant="bodySmall" style={styles.deliveryLabel}>
                  Delivery
                </Text>
                <SegmentedButtons
                  value={draft.delivery}
                  onValueChange={(v) => patchDraft(a.kind, { delivery: v as DeliveryMode })}
                  buttons={[
                    {
                      value: 'automatic',
                      label: 'Automatic',
                      icon: 'flash',
                      testID: `delivery-automatic-${a.kind}`,
                    },
                    {
                      value: 'notification',
                      label: 'Ask first',
                      icon: 'bell',
                      testID: `delivery-notification-${a.kind}`,
                    },
                  ]}
                  style={styles.delivery}
                />
                <Text variant="bodySmall" style={styles.deliveryHint}>
                  {draft.delivery === 'automatic'
                    ? 'Runs the moment it fires.'
                    : 'Sends a notification to confirm before doing it.'}
                </Text>

                <View style={styles.row}>
                  <Text variant="bodyMedium">Enabled</Text>
                  <Switch
                    testID={`enabled-${a.kind}`}
                    value={draft.enabled && hasText}
                    disabled={!hasText}
                    onValueChange={(v) => patchDraft(a.kind, { enabled: v })}
                  />
                </View>

                <Button
                  testID={`save-${a.kind}`}
                  mode="contained"
                  disabled={!isDirty(a) || !!saving[a.kind]}
                  loading={!!saving[a.kind]}
                  onPress={() => save(a)}
                  style={styles.save}
                >
                  {hasText ? 'Save' : 'Clear'}
                </Button>
              </Card.Content>
            </Card>
          );
        })}
      </ScrollView>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Automations" />
      </Appbar.Header>
      {renderBody()}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 12, paddingBottom: 32 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { marginBottom: 12, textAlign: 'center' },
  intro: { marginBottom: 12, opacity: 0.8 },
  card: { marginBottom: 12 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { flexShrink: 1, paddingRight: 8 },
  chip: { alignSelf: 'flex-start' },
  desc: { marginTop: 2, marginBottom: 8, opacity: 0.7 },
  input: { marginBottom: 8 },
  deliveryLabel: { marginBottom: 4, opacity: 0.7 },
  delivery: { marginBottom: 4 },
  deliveryHint: { marginBottom: 8, opacity: 0.6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  save: { marginTop: 4 },
});

export default SignalAutomationsScreen;
