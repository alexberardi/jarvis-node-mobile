import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  IconButton,
  Menu,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import type { CommandParameterEntry } from '../services/settingsDecryptService';
import type { RoutineStepArg } from '../types/Routine';

interface Props {
  arg: RoutineStepArg;
  paramMeta: CommandParameterEntry | null;
  onUpdate: (updates: Partial<RoutineStepArg>) => void;
  onRemove: () => void;
}

/** Returns true if the param_type represents an array type. */
const isArrayType = (t: string): boolean =>
  t === 'array' || t === 'list' || t.startsWith('array<') || t.startsWith('array[') || t.endsWith('[]');

/** Parse a JSON array string into individual items, or return as single-element array. */
const parseArrayValue = (value: string): string[] => {
  if (!value) return [''];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.length > 0 ? parsed.map(String) : [''];
    return [value];
  } catch {
    return [value];
  }
};

/** Serialize an array of strings back to JSON. */
const serializeArray = (items: string[]): string => JSON.stringify(items.filter((i) => i !== ''));

const ParameterArgRow: React.FC<Props> = ({ arg, paramMeta, onUpdate, onRemove }) => {
  const theme = useTheme();
  const [enumMenuVisible, setEnumMenuVisible] = useState(false);

  // No metadata — free-text key + value (current behavior)
  if (!paramMeta) {
    return (
      <View style={styles.row}>
        <TextInput
          mode="flat"
          label="Key"
          value={arg.key}
          onChangeText={(v) => onUpdate({ key: v })}
          dense
          style={[styles.input, styles.flex]}
        />
        <Text style={[styles.equals, { color: theme.colors.onSurfaceVariant }]}>=</Text>
        <TextInput
          mode="flat"
          label="Value"
          value={arg.value}
          onChangeText={(v) => onUpdate({ value: v })}
          dense
          style={[styles.input, styles.flex]}
        />
        <IconButton icon="close" size={14} onPress={onRemove} style={styles.removeBtn} />
      </View>
    );
  }

  const { type, enum_values, description } = paramMeta;
  const hasEnum = enum_values && enum_values.length > 0;

  // Array type
  if (isArrayType(type)) {
    const items = parseArrayValue(arg.value);

    const updateItem = (idx: number, val: string) => {
      const next = [...items];
      next[idx] = val;
      onUpdate({ value: serializeArray(next) });
    };

    const addItem = () => {
      onUpdate({ value: serializeArray([...items, '']) });
    };

    const removeItem = (idx: number) => {
      const next = items.filter((_, i) => i !== idx);
      onUpdate({ value: serializeArray(next.length > 0 ? next : []) });
    };

    return (
      <View style={styles.paramBlock}>
        <View style={styles.labelRow}>
          <Text variant="labelMedium" style={[styles.paramLabel, { color: theme.colors.primary }]}>
            {arg.key}
          </Text>
          <IconButton icon="close" size={14} onPress={onRemove} style={styles.removeBtn} />
        </View>
        {description && (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
            {description}
          </Text>
        )}
        {items.map((item, idx) => (
          <View key={idx} style={styles.row}>
            {hasEnum ? (
              <ArrayEnumItem
                value={item}
                enumValues={enum_values}
                onChange={(v) => updateItem(idx, v)}
              />
            ) : (
              <TextInput
                mode="flat"
                label={`Item ${idx + 1}`}
                value={item}
                onChangeText={(v) => updateItem(idx, v)}
                dense
                style={[styles.input, styles.flex]}
              />
            )}
            <IconButton icon="minus-circle-outline" size={16} onPress={() => removeItem(idx)} style={styles.removeBtn} />
          </View>
        ))}
        <Text
          variant="labelSmall"
          style={{ color: theme.colors.primary, marginTop: 2 }}
          onPress={addItem}
        >
          + Add item
        </Text>
      </View>
    );
  }

  // Bool type
  if (type === 'bool' || type === 'boolean') {
    return (
      <View style={styles.paramBlock}>
        <View style={styles.labelRow}>
          <Text variant="labelMedium" style={[styles.paramLabel, { color: theme.colors.primary }]}>
            {arg.key}
          </Text>
          <IconButton icon="close" size={14} onPress={onRemove} style={styles.removeBtn} />
        </View>
        {description && (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
            {description}
          </Text>
        )}
        <SegmentedButtons
          value={arg.value || 'true'}
          onValueChange={(v) => onUpdate({ value: v })}
          density="small"
          buttons={[
            { value: 'true', label: 'True' },
            { value: 'false', label: 'False' },
          ]}
        />
      </View>
    );
  }

  // Enum values (overrides type)
  if (hasEnum) {
    return (
      <View style={styles.paramBlock}>
        <View style={styles.labelRow}>
          <Text variant="labelMedium" style={[styles.paramLabel, { color: theme.colors.primary }]}>
            {arg.key}
          </Text>
          <IconButton icon="close" size={14} onPress={onRemove} style={styles.removeBtn} />
        </View>
        {description && (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
            {description}
          </Text>
        )}
        <Menu
          visible={enumMenuVisible}
          onDismiss={() => setEnumMenuVisible(false)}
          anchor={
            <TextInput
              mode="flat"
              value={arg.value}
              dense
              style={styles.input}
              right={<TextInput.Icon icon="menu-down" onPress={() => setEnumMenuVisible(true)} />}
              onFocus={() => setEnumMenuVisible(true)}
              editable={false}
              placeholder="Select..."
            />
          }
        >
          {enum_values.map((v) => (
            <Menu.Item
              key={v}
              title={v}
              onPress={() => { onUpdate({ value: v }); setEnumMenuVisible(false); }}
            />
          ))}
        </Menu>
      </View>
    );
  }

  // Numeric types
  const isNumeric = type === 'int' || type === 'integer' || type === 'float';

  // Default: TextInput with appropriate keyboard
  return (
    <View style={styles.paramBlock}>
      <View style={styles.labelRow}>
        <Text variant="labelMedium" style={[styles.paramLabel, { color: theme.colors.primary }]}>
          {arg.key}
        </Text>
        <IconButton icon="close" size={14} onPress={onRemove} style={styles.removeBtn} />
      </View>
      {description && (
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
          {description}
        </Text>
      )}
      <TextInput
        mode="flat"
        value={arg.value}
        onChangeText={(v) => onUpdate({ value: v })}
        dense
        style={styles.input}
        keyboardType={isNumeric ? 'numeric' : 'default'}
        placeholder={type === 'datetime' ? 'YYYY-MM-DD HH:MM' : undefined}
      />
    </View>
  );
};

/** Dropdown for a single item within an array that has enum_values. */
const ArrayEnumItem: React.FC<{
  value: string;
  enumValues: string[];
  onChange: (v: string) => void;
}> = ({ value, enumValues, onChange }) => {
  const [visible, setVisible] = useState(false);
  return (
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      anchor={
        <TextInput
          mode="flat"
          value={value}
          dense
          style={[styles.input, styles.flex]}
          right={<TextInput.Icon icon="menu-down" onPress={() => setVisible(true)} />}
          onFocus={() => setVisible(true)}
          editable={false}
          placeholder="Select..."
        />
      }
    >
      {enumValues.map((v) => (
        <Menu.Item key={v} title={v} onPress={() => { onChange(v); setVisible(false); }} />
      ))}
    </Menu>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  paramBlock: { marginBottom: 4, marginLeft: 4 },
  labelRow: { flexDirection: 'row', alignItems: 'center' },
  paramLabel: { fontWeight: '600', fontSize: 12, flex: 1 },
  input: { backgroundColor: 'transparent', fontSize: 13, paddingHorizontal: 4 },
  flex: { flex: 1 },
  equals: { paddingTop: 12 },
  removeBtn: { margin: 0 },
});

export default ParameterArgRow;
