/**
 * One field row inside a record detail or edit form.
 *
 * Maps a FieldSpec `type` string to a Material widget. Unknown types
 * fall back to a JSON text input with a hint — the data is already
 * valid by virtue of being stored on the node, so we degrade
 * permissively rather than blocking the user.
 *
 * `readOnly` flips all widgets to non-interactive display variants.
 * `editable=false` on a FieldSpec also forces read-only regardless of
 * the screen mode (see RecordEditScreen).
 */
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import {
  Button,
  HelperText,
  IconButton,
  Menu,
  Switch,
  Text,
  TextInput,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';

import type { FieldSpec } from '../../api/commandDataApi';
import { coerceTimeList, formatTime, parseTimeToDate } from '../../utils/time';

interface Props {
  spec: FieldSpec;
  value: unknown;
  onChange: (next: unknown) => void;
  readOnly?: boolean;
  /** Server-returned field-level error, rendered under the input. */
  error?: string | null;
  /** When the parent record carries a `{name}_display` enrichment, the
   *  user_ref widget shows that name alongside the raw id. */
  displayName?: string;
}

const formatDisplayValue = (
  spec: FieldSpec,
  value: unknown,
  displayName?: string,
): string => {
  if (value === null || value === undefined) return '';
  if (spec.type === 'bool') return value ? 'Yes' : 'No';
  if (spec.type === 'user_ref' && displayName) {
    return `${displayName} (${value})`;
  }
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const FieldEditor: React.FC<Props> = ({
  spec,
  value,
  onChange,
  readOnly = false,
  error = null,
  displayName,
}) => {
  const theme = useTheme();
  const [enumMenuVisible, setEnumMenuVisible] = useState(false);
  const [openTimeIdx, setOpenTimeIdx] = useState<number | null>(null);

  const label = spec.label ?? spec.name;
  const helper = spec.description;
  const isReadOnly = readOnly || spec.editable === false;

  // ── Read-only renderer ──────────────────────────────────────────────
  if (isReadOnly) {
    return (
      <View style={styles.row}>
        <Text variant="labelMedium" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
          {label}
        </Text>
        <Text
          variant="bodyLarge"
          style={[
            styles.readonlyValue,
            { color: theme.colors.onSurface, fontFamily: spec.type === 'id' ? 'monospace' : undefined },
          ]}
          selectable
        >
          {formatDisplayValue(spec, value, displayName) || '—'}
        </Text>
        {helper && (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {helper}
          </Text>
        )}
      </View>
    );
  }

  // ── Editable widgets ────────────────────────────────────────────────
  // Boolean
  if (spec.type === 'bool') {
    return (
      <View style={[styles.row, styles.boolRow]}>
        <View style={styles.boolLabel}>
          <Text variant="labelMedium">{label}</Text>
          {helper && (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {helper}
            </Text>
          )}
        </View>
        <Switch value={Boolean(value)} onValueChange={onChange} />
      </View>
    );
  }

  // Enum dropdown
  if (spec.type === 'enum' && spec.enum_values && spec.enum_values.length > 0) {
    const opts = spec.enum_values;
    return (
      <View style={styles.row}>
        <Text variant="labelMedium" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
          {label}
        </Text>
        <Menu
          visible={enumMenuVisible}
          onDismiss={() => setEnumMenuVisible(false)}
          anchor={
            <TouchableRipple onPress={() => setEnumMenuVisible(true)}>
              {/* pointerEvents="none" so the non-editable TextInput doesn't
                  swallow the tap — it falls through to TouchableRipple, which
                  opens the Menu. Without this the dropdown renders but never opens. */}
              <View pointerEvents="none">
                <TextInput
                  mode="outlined"
                  value={value === null || value === undefined ? '' : String(value)}
                  editable={false}
                  right={<TextInput.Icon icon="menu-down" />}
                  placeholder={spec.placeholder ?? 'Select...'}
                  error={Boolean(error)}
                />
              </View>
            </TouchableRipple>
          }
        >
          {opts.map((opt) => (
            <Menu.Item
              key={opt}
              title={opt}
              onPress={() => {
                onChange(opt);
                setEnumMenuVisible(false);
              }}
            />
          ))}
        </Menu>
        {helper && <HelperText type="info">{helper}</HelperText>}
        {error && <HelperText type="error">{error}</HelperText>}
      </View>
    );
  }

  // Numeric (int / float)
  if (spec.type === 'int' || spec.type === 'float') {
    return (
      <View style={styles.row}>
        <TextInput
          mode="outlined"
          label={label}
          value={value === null || value === undefined ? '' : String(value)}
          onChangeText={(t) => {
            const parsed = spec.type === 'int' ? parseInt(t, 10) : parseFloat(t);
            onChange(Number.isNaN(parsed) ? '' : parsed);
          }}
          keyboardType={spec.type === 'int' ? 'number-pad' : 'decimal-pad'}
          placeholder={spec.placeholder}
          error={Boolean(error)}
        />
        {helper && <HelperText type="info">{helper}</HelperText>}
        {error && <HelperText type="error">{error}</HelperText>}
      </View>
    );
  }

  // Multi-line text
  if (spec.type === 'text') {
    return (
      <View style={styles.row}>
        <TextInput
          mode="outlined"
          label={label}
          value={value === null || value === undefined ? '' : String(value)}
          onChangeText={onChange}
          multiline
          numberOfLines={4}
          placeholder={spec.placeholder}
          error={Boolean(error)}
        />
        {helper && <HelperText type="info">{helper}</HelperText>}
        {error && <HelperText type="error">{error}</HelperText>}
      </View>
    );
  }

  // Array of times (e.g. medication dose_times): editable rows of HH:MM with
  // add/remove, each backed by the native time picker. Emits a real string[]
  // (the node's coerce_dose_times also accepts a CSV string, so reads are
  // tolerant of a value that previously round-tripped as text).
  if (spec.type === 'array' && spec.item_type === 'time') {
    const times = coerceTimeList(value);
    const setTimes = (next: string[]) => onChange(next);
    return (
      <View style={styles.row}>
        <Text variant="labelMedium" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
          {label}
        </Text>
        {times.map((t, idx) => (
          // Stable key (NOT including the time) so the open picker doesn't
          // remount on every spinner tick while the user is scrolling.
          <View key={`time-${idx}`}>
            <View style={styles.timeRow}>
              <TouchableRipple
                style={[styles.timeChip, { borderColor: theme.colors.outline }]}
                onPress={() => setOpenTimeIdx(openTimeIdx === idx ? null : idx)}
                accessibilityLabel={`Edit ${label} ${idx + 1}`}
              >
                <Text variant="bodyLarge">{t}</Text>
              </TouchableRipple>
              <IconButton
                icon="close"
                size={20}
                onPress={() => {
                  if (openTimeIdx === idx) setOpenTimeIdx(null);
                  setTimes(times.filter((_, i) => i !== idx));
                }}
                accessibilityLabel={`Remove ${label} ${idx + 1}`}
              />
            </View>
            {openTimeIdx === idx && (
              <View style={styles.timePickerWrap}>
                <DateTimePicker
                  value={parseTimeToDate(t)}
                  mode="time"
                  is24Hour={false}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, picked) => {
                    // Android: a one-shot dialog — 'set' confirms, 'dismissed'
                    // cancels. Close either way.
                    if (Platform.OS === 'android') {
                      setOpenTimeIdx(null);
                      if (event.type === 'set' && picked) {
                        const next = [...times];
                        next[idx] = formatTime(picked);
                        setTimes(next);
                      }
                      return;
                    }
                    // iOS: the spinner fires on every tick — update live and
                    // KEEP it open; the user dismisses it with Done.
                    if (picked) {
                      const next = [...times];
                      next[idx] = formatTime(picked);
                      setTimes(next);
                    }
                  }}
                />
                {Platform.OS === 'ios' && (
                  <Button
                    compact
                    onPress={() => setOpenTimeIdx(null)}
                    style={styles.timeDone}
                  >
                    Done
                  </Button>
                )}
              </View>
            )}
          </View>
        ))}
        <Button
          mode="text"
          icon="plus"
          onPress={() => setTimes([...times, '08:00'])}
          accessibilityLabel={`Add ${label}`}
        >
          Add time
        </Button>
        {helper && <HelperText type="info">{helper}</HelperText>}
        {error && <HelperText type="error">{error}</HelperText>}
      </View>
    );
  }

  // Datetime / date / time — text input with format hint. A native picker is
  // used for arrays of times above; single date/time fields stay text for now.
  if (spec.type === 'datetime' || spec.type === 'date' || spec.type === 'time') {
    const placeholderByType: Record<string, string> = {
      datetime: 'YYYY-MM-DDTHH:MM:SS',
      date: 'YYYY-MM-DD',
      time: 'HH:MM',
    };
    return (
      <View style={styles.row}>
        <TextInput
          mode="outlined"
          label={label}
          value={value === null || value === undefined ? '' : String(value)}
          onChangeText={onChange}
          placeholder={spec.placeholder ?? placeholderByType[spec.type]}
          autoCapitalize="none"
          error={Boolean(error)}
        />
        {helper && <HelperText type="info">{helper}</HelperText>}
        {error && <HelperText type="error">{error}</HelperText>}
      </View>
    );
  }

  // String + unknown types: plain text input
  return (
    <View style={styles.row}>
      <TextInput
        mode="outlined"
        label={label}
        value={value === null || value === undefined ? '' : String(value)}
        onChangeText={onChange}
        placeholder={spec.placeholder}
        autoCapitalize={spec.type === 'string' ? 'sentences' : 'none'}
        error={Boolean(error)}
      />
      {helper && <HelperText type="info">{helper}</HelperText>}
      {error && <HelperText type="error">{error}</HelperText>}
      {spec.type !== 'string' && spec.type !== 'id' && spec.type !== 'user_ref' && (
        <HelperText type="info">Field type "{spec.type}" not supported by this app version; editing as text.</HelperText>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    marginBottom: 12,
  },
  label: {
    marginBottom: 4,
  },
  readonlyValue: {
    paddingVertical: 4,
  },
  boolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  boolLabel: {
    flex: 1,
    paddingRight: 12,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  timeChip: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 4,
  },
  timePickerWrap: {
    marginBottom: 8,
  },
  timeDone: {
    alignSelf: 'flex-end',
  },
});

export default FieldEditor;
