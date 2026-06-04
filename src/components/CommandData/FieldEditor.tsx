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
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  HelperText,
  Menu,
  Switch,
  Text,
  TextInput,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';

import type { FieldSpec } from '../../api/commandDataApi';

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
              <TextInput
                mode="outlined"
                value={value === null || value === undefined ? '' : String(value)}
                editable={false}
                right={<TextInput.Icon icon="menu-down" />}
                placeholder={spec.placeholder ?? 'Select...'}
                error={Boolean(error)}
              />
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

  // Datetime / date / time — text input with format hint until a native
  // picker dep lands. `@react-native-community/datetimepicker` is
  // declared in package.json; wiring it here is a v1.1 task.
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
});

export default FieldEditor;
