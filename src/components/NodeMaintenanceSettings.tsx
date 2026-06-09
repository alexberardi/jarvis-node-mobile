import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  ActivityIndicator,
  Button,
  Card,
  Divider,
  Icon,
  Switch,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import { updateNodeConfig } from '../api/nodeApi';
import { useSettingsSnapshot } from '../hooks/useSettingsSnapshot';

interface Props {
  nodeId: string;
}

interface MaintenanceSettings {
  maintenance_restart_enabled: boolean;
  maintenance_restart_at_time: string; // HH:MM, 24-h
  maintenance_restart_rss_ceiling_mb: number;
}

const DEFAULTS: MaintenanceSettings = {
  maintenance_restart_enabled: true,
  maintenance_restart_at_time: '03:00',
  maintenance_restart_rss_ceiling_mb: 320,
};

/** Parse "HH:MM" into a Date object for today (only hour/minute matter). */
const parseTimeToDate = (hhmm: string): Date => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  const d = new Date();
  d.setSeconds(0, 0);
  if (!m) {
    d.setHours(3, 0, 0, 0);
    return d;
  }
  const hh = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  const mm = Math.max(0, Math.min(59, parseInt(m[2], 10)));
  d.setHours(hh, mm, 0, 0);
  return d;
};

/** Format Date back to "HH:MM" zero-padded. */
const formatTime = (d: Date): string => {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

/** Convert "HH:MM" to a friendly "3:00 AM" for display. */
const formatTimeFriendly = (hhmm: string): string => {
  const d = parseTimeToDate(hhmm);
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
};

export const NodeMaintenanceSettings = ({ nodeId }: Props) => {
  const theme = useTheme();
  const [settings, setSettings] = useState<MaintenanceSettings>({ ...DEFAULTS });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const seededRef = useRef(false);

  const { snapshot, state: snapshotState } = useSettingsSnapshot({ nodeId });

  // Seed once when the snapshot lands.
  useEffect(() => {
    if (seededRef.current) return;
    if (snapshotState !== 'loaded') return;
    const nc = snapshot?.node_config;
    if (!nc) return;
    setSettings({
      maintenance_restart_enabled:
        nc.maintenance_restart_enabled ?? DEFAULTS.maintenance_restart_enabled,
      maintenance_restart_at_time:
        nc.maintenance_restart_at_time ?? DEFAULTS.maintenance_restart_at_time,
      maintenance_restart_rss_ceiling_mb:
        nc.maintenance_restart_rss_ceiling_mb ??
        DEFAULTS.maintenance_restart_rss_ceiling_mb,
    });
    seededRef.current = true;
  }, [snapshot, snapshotState]);

  const update = useCallback(
    <K extends keyof MaintenanceSettings>(
      key: K,
      value: MaintenanceSettings[K],
    ) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
      setDirty(true);
    },
    [],
  );

  const handleTimePicked = useCallback(
    (_evt: unknown, picked?: Date) => {
      // Android's native modal closes itself; iOS keeps the inline picker
      // open until the user taps Done, so we only collapse the wrapper on
      // explicit dismiss/confirm.
      if (Platform.OS === 'android') setPickerOpen(false);
      if (!picked) return;
      update('maintenance_restart_at_time', formatTime(picked));
    },
    [update],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateNodeConfig(nodeId, {
        maintenance_restart_enabled: settings.maintenance_restart_enabled,
        maintenance_restart_at_time: settings.maintenance_restart_at_time,
        maintenance_restart_rss_ceiling_mb:
          settings.maintenance_restart_rss_ceiling_mb,
      });
      setDirty(false);
    } catch {
      // Surface as a toast-style banner in a future iteration; for now
      // the dirty flag stays set so the user can retry.
    } finally {
      setSaving(false);
    }
  }, [nodeId, settings]);

  // Loading state mirrors NodeVoiceSettings exactly: render the
  // Card.Title even while loading so the user always sees what the
  // card is, with a small spinner + status text in the body. Gating
  // on ``!seededRef.current`` too prevents the form briefly showing
  // DEFAULTS before the real snapshot lands, which would flicker the
  // toggle/time/MB values to wrong-looking placeholders.
  if (snapshotState !== 'loaded' || !seededRef.current) {
    return (
      <Card style={styles.card}>
        <Card.Title
          title="Maintenance"
          titleVariant="titleMedium"
          left={(props) => (
            <View
              {...props}
              style={[
                styles.iconCircle,
                { backgroundColor: theme.colors.primaryContainer },
              ]}
            >
              <Text style={{ fontSize: 18 }}>{'\u{1F504}'}</Text>
            </View>
          )}
        />
        <Card.Content style={styles.loadingBody}>
          <ActivityIndicator animating size="small" />
          <Text variant="bodySmall" style={{ marginLeft: 12, opacity: 0.7 }}>
            {snapshotState === 'error'
              ? 'Could not reach the node — try again in a moment.'
              : 'Loading current settings from the node…'}
          </Text>
        </Card.Content>
      </Card>
    );
  }

  const friendlyTime = formatTimeFriendly(settings.maintenance_restart_at_time);

  return (
    <Card style={styles.card}>
      <Card.Title
        title="Maintenance"
        titleVariant="titleMedium"
        left={(props) => (
          <View
            {...props}
            style={[
              styles.iconCircle,
              { backgroundColor: theme.colors.primaryContainer },
            ]}
          >
            <Text style={{ fontSize: 18 }}>{'\u{1F504}'}</Text>
          </View>
        )}
      />
      <Card.Content>
        <Text
          variant="bodySmall"
          style={[styles.helpText, { color: theme.colors.onSurfaceVariant }]}
        >
          Restarting clears accumulated memory and is good hygiene on long-running
          devices. A short restart at a quiet hour resets all caches.
        </Text>

        <Divider style={styles.divider} />

        {/* Enable toggle */}
        <View style={styles.row}>
          <View style={styles.rowLabel}>
            <Text variant="bodyMedium">Daily restart</Text>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {settings.maintenance_restart_enabled
                ? `Every day at ${friendlyTime}`
                : 'Disabled'}
            </Text>
          </View>
          <Switch
            value={settings.maintenance_restart_enabled}
            onValueChange={(v) => update('maintenance_restart_enabled', v)}
          />
        </View>

        {/* Time picker (only meaningful when enabled) */}
        {settings.maintenance_restart_enabled && (
          <>
            <Divider style={styles.subDivider} />
            <Pressable
              onPress={() => setPickerOpen((open) => !open)}
              style={styles.row}
              android_ripple={{ color: theme.colors.surfaceVariant }}
            >
              <View style={styles.rowLabel}>
                <Text variant="bodyMedium">Restart time</Text>
                <Text
                  variant="bodySmall"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  Local time (node)
                </Text>
              </View>
              <View style={styles.timeChipContainer}>
                <Text
                  variant="bodyMedium"
                  style={{ color: theme.colors.primary, fontWeight: '600' }}
                >
                  {friendlyTime}
                </Text>
                <Icon
                  source={pickerOpen ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={theme.colors.onSurfaceVariant}
                />
              </View>
            </Pressable>
            {pickerOpen && (
              <View style={styles.pickerWrapper}>
                <DateTimePicker
                  value={parseTimeToDate(settings.maintenance_restart_at_time)}
                  mode="time"
                  is24Hour={false}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleTimePicked}
                />
                {Platform.OS === 'ios' && (
                  <Button
                    mode="text"
                    compact
                    onPress={() => setPickerOpen(false)}
                  >
                    Done
                  </Button>
                )}
              </View>
            )}
          </>
        )}

        {/* RSS ceiling (emergency restart) */}
        <Divider style={styles.subDivider} />
        <View style={styles.row}>
          <View style={styles.rowLabel}>
            <Text variant="bodyMedium">Memory ceiling</Text>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              Restart early if resident memory exceeds this. 0 = disabled.
            </Text>
          </View>
          <TextInput
            mode="outlined"
            keyboardType="number-pad"
            value={String(settings.maintenance_restart_rss_ceiling_mb)}
            onChangeText={(t) => {
              const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
              update(
                'maintenance_restart_rss_ceiling_mb',
                Number.isNaN(n) ? 0 : n,
              );
            }}
            right={<TextInput.Affix text="MB" />}
            style={styles.numberField}
            dense
          />
        </View>

        {/* Save bar */}
        {dirty && (
          <>
            <Divider style={styles.divider} />
            <Button
              mode="contained"
              onPress={handleSave}
              loading={saving}
              disabled={saving}
            >
              Save
            </Button>
          </>
        )}
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
  // Matches NodeVoiceSettings.loadingBody — horizontal layout with the
  // spinner on the left, status text alongside, so the loading card has
  // the same vertical footprint as the real one and the tab doesn't
  // jump when the snapshot lands.
  loadingBody: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpText: {
    marginBottom: 4,
  },
  divider: {
    marginVertical: 12,
  },
  subDivider: {
    marginVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  rowLabel: {
    flex: 1,
    paddingRight: 12,
  },
  timeChipContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pickerWrapper: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  numberField: {
    // Wide enough that a 4-digit value (1024 MB) + the "MB" affix
    // doesn't wrap to a second line. The earlier 96 px clipped "320"
    // into "32 / 0" stacked.
    width: 130,
  },
});
