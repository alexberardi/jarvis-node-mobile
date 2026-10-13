/**
 * "Time zone" — the household's IANA zone (jarvisd `household.timezone`).
 *
 * Unset ("") means automatic: the server uses the zone the household's most
 * recently seen node reports. The card shows that zone (from
 * `GET .../timezone`, best-effort) so "Automatic" is never a mystery. A chosen
 * zone wins over every node's report for local times (quiet hours, errands,
 * "today", the date the assistant thinks it is).
 *
 * Against a server without the setting (the legacy Python stack) the parent
 * passes `value === undefined` and the card renders nothing. Writes need a
 * household admin, so `canEdit` turns the row read-only for everyone else.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Dialog,
  Divider,
  List,
  Portal,
  Searchbar,
  Text,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';

import {
  getHouseholdTimezone,
  setHouseholdSetting,
  settingErrorMessage,
  type HouseholdTimezoneInfo,
} from '../api/householdSettingsApi';
import {
  deviceTimeZone,
  filterTimeZones,
  formatTimeZone,
  listTimeZones,
} from '../utils/timezones';

/** What the row says the household's zone is. */
export const timezoneSummary = (
  value: string,
  info: HouseholdTimezoneInfo | null,
): string => {
  if (value) return formatTimeZone(value);
  if (!info) return 'Automatic (from your nodes)';
  if (info.node_timezone) {
    return `Automatic — ${formatTimeZone(info.node_timezone)} (from your nodes)`;
  }
  return 'Automatic — UTC until a node reports its time zone';
};

interface Props {
  householdId: string;
  /** The saved `household.timezone`; undefined = the server doesn't support it. */
  value: string | undefined;
  loading: boolean;
  canEdit: boolean;
  /** Re-read the household settings after a successful write. */
  onChanged: () => Promise<void> | void;
}

const HouseholdTimezoneCard = ({ householdId, value, loading, canEdit, onChanged }: Props) => {
  const theme = useTheme();
  const [info, setInfo] = useState<HouseholdTimezoneInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const supported = value !== undefined;

  const loadInfo = useCallback(async () => {
    try {
      setInfo(await getHouseholdTimezone(householdId));
    } catch {
      setInfo(null); // best-effort: the row still works, just without the node's zone
    }
  }, [householdId]);

  useEffect(() => {
    if (supported) loadInfo();
  }, [supported, loadInfo, value]);

  const zones = useMemo(() => listTimeZones(), []);
  const filtered = useMemo(() => filterTimeZones(zones, query), [zones, query]);
  const phoneZone = useMemo(() => deviceTimeZone(), []);

  if (!supported) return null;

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const save = async (next: string) => {
    if (next === value) {
      close();
      return;
    }
    setSaving(true);
    try {
      await setHouseholdSetting(householdId, 'household.timezone', next);
      close();
      await onChanged();
    } catch (err: unknown) {
      Alert.alert('Error', settingErrorMessage(err, 'Failed to update the time zone'));
    } finally {
      setSaving(false);
    }
  };

  const automaticDescription = info?.node_timezone
    ? `Currently ${formatTimeZone(info.node_timezone)}`
    : 'Uses the time zone your nodes report';

  return (
    <Card style={styles.card} testID="household-timezone-card">
      <Card.Content>
        <Text variant="titleMedium" style={styles.sectionTitle}>Time zone</Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
          Used for local times: quiet hours, scheduled errands, &quot;today&quot;, and what
          time Jarvis thinks it is. Automatic follows your nodes; pick one if a node
          reports the wrong zone.
        </Text>
        {loading ? (
          <ActivityIndicator size="small" />
        ) : (
          <TouchableRipple
            testID="household-timezone-row"
            onPress={canEdit ? () => setOpen(true) : undefined}
            disabled={!canEdit}
            accessibilityRole={canEdit ? 'button' : undefined}
          >
            <View style={styles.row}>
              <Text variant="bodyMedium" style={{ flex: 1 }} testID="household-timezone-value">
                {timezoneSummary(value, info)}
              </Text>
              {canEdit && (
                <Text variant="labelLarge" style={{ color: theme.colors.primary }}>Change</Text>
              )}
            </View>
          </TouchableRipple>
        )}
        {!canEdit && !loading && (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
            Only a household admin can change this.
          </Text>
        )}
      </Card.Content>

      <Portal>
        <Dialog visible={open} onDismiss={saving ? undefined : close} style={styles.dialog}>
          <Dialog.Title>Time zone</Dialog.Title>
          <Dialog.Content>
            <Searchbar
              testID="household-timezone-search"
              placeholder="Search time zones"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Dialog.Content>
          <Dialog.ScrollArea style={styles.scrollArea}>
            <FlatList
              data={filtered}
              keyExtractor={(z) => z}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={20}
              ListHeaderComponent={
                query.trim() ? null : (
                  <View>
                    <List.Item
                      testID="household-timezone-automatic"
                      title="Automatic (from nodes)"
                      description={automaticDescription}
                      left={(p) => <List.Icon {...p} icon={value === '' ? 'check' : 'router-wireless'} />}
                      onPress={() => save('')}
                      disabled={saving}
                    />
                    {phoneZone && (
                      <List.Item
                        testID="household-timezone-phone"
                        title="Use this phone's time zone"
                        description={formatTimeZone(phoneZone)}
                        left={(p) => <List.Icon {...p} icon={value === phoneZone ? 'check' : 'cellphone'} />}
                        onPress={() => save(phoneZone)}
                        disabled={saving}
                      />
                    )}
                    <Divider />
                  </View>
                )
              }
              renderItem={({ item }) => (
                <List.Item
                  testID={`household-timezone-option-${item}`}
                  title={formatTimeZone(item)}
                  left={value === item ? (p) => <List.Icon {...p} icon="check" /> : undefined}
                  onPress={() => save(item)}
                  disabled={saving}
                />
              )}
              ListEmptyComponent={
                <Text variant="bodyMedium" style={styles.empty}>No matching time zone.</Text>
              }
            />
          </Dialog.ScrollArea>
          <Dialog.Actions>
            {saving && <ActivityIndicator size="small" style={{ marginRight: 12 }} />}
            <Button onPress={close} disabled={saving}>Cancel</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { marginBottom: 16 },
  sectionTitle: { fontWeight: '600', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  dialog: { maxHeight: '85%' },
  scrollArea: { paddingHorizontal: 0, maxHeight: 420 },
  empty: { padding: 16, textAlign: 'center' },
});

export default HouseholdTimezoneCard;
