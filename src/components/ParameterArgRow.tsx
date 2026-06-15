import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Checkbox,
  IconButton,
  Menu,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import { listDevices, listRooms } from '../api/smartHomeApi';
import { useAuth } from '../auth/AuthContext';
import type { CommandParameterEntry } from '../services/settingsDecryptService';
import type { RoutineStepArg } from '../types/Routine';

interface Props {
  arg: RoutineStepArg;
  paramMeta: CommandParameterEntry | null;
  onUpdate: (updates: Partial<RoutineStepArg>) => void;
  onRemove: () => void;
}

/** Relative date keywords the date parameters accept (today/tomorrow/…). */
const DATE_KEYS = [
  'today', 'tomorrow', 'yesterday',
  'this_weekend', 'next_weekend', 'this_week', 'next_week',
];

const isArrayType = (t: string): boolean =>
  t === 'array' || t === 'list' || t.startsWith('array<') || t.startsWith('array[') || t.endsWith('[]');

const isDateType = (t: string): boolean => t.includes('datetime') || t.includes('date');

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

const serializeArray = (items: string[]): string => JSON.stringify(items.filter((i) => i !== ''));

/**
 * Resolve an `options_source` hint to a live list of allowed values.
 * Supports 'devices', 'devices:<domain>', and 'rooms'. Returns null options
 * for unknown sources so the caller falls back to enum/free-text.
 */
const useDynamicOptions = (
  source: string | null | undefined,
): { options: string[] | null; loading: boolean } => {
  const { state } = useAuth();
  const householdId = state.activeHouseholdId;
  const [kind, domain] = (source ?? '').split(':');
  const enabled = !!householdId && (kind === 'devices' || kind === 'entities' || kind === 'rooms');

  const query = useQuery({
    queryKey: ['routine-options', source, householdId],
    queryFn: async (): Promise<string[]> => {
      let values: string[] = [];
      if (kind === 'rooms') {
        values = (await listRooms(householdId!)).map((r) => r.name);
      } else if (kind === 'devices' || kind === 'entities') {
        const devices = await listDevices(householdId!, domain ? { domain } : undefined);
        // 'devices' → friendly names; 'entities' → entity_ids.
        values = devices.map((d) => (kind === 'entities' ? d.entity_id : d.name));
      }
      // De-duplicate: two devices can share a name (e.g. "ZW6HD"), which would
      // both collide as a stored value and break dropdown React keys.
      return Array.from(new Set(values.filter(Boolean)));
    },
    enabled,
    staleTime: 60_000,
  });

  if (!enabled) return { options: null, loading: false };
  return { options: query.data ?? null, loading: query.isLoading };
};

/**
 * A dropdown constrained to `options`, with an explicit "Other…" escape hatch:
 * choosing it reveals a confirm checkbox + free-text field so a power user can
 * enter a custom value ("that's on them"). A value not in `options` is treated
 * as an existing override and starts in custom mode.
 */
const ConstrainedSelect: React.FC<{
  value: string;
  options: string[];
  loading?: boolean;
  onChange: (v: string) => void;
  flex?: boolean;
}> = ({ value, options, loading, onChange, flex }) => {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);
  const valueKnown = value === '' || options.includes(value);
  const [override, setOverride] = useState(value !== '' && !valueKnown);

  if (override) {
    return (
      <View style={flex ? styles.flex : undefined}>
        <View style={styles.overrideRow}>
          <Checkbox
            status="checked"
            onPress={() => { setOverride(false); onChange(''); }}
          />
          <Text variant="bodySmall" style={{ flex: 1, color: theme.colors.onSurfaceVariant }}>
            Custom value (may not work)
          </Text>
        </View>
        <TextInput
          mode="flat"
          value={value}
          onChangeText={onChange}
          dense
          style={styles.input}
          placeholder="Enter custom value"
          autoFocus
        />
      </View>
    );
  }

  return (
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      anchor={
        <TextInput
          mode="flat"
          value={value}
          dense
          style={[styles.input, flex && styles.flex]}
          editable={false}
          placeholder={loading ? 'Loading…' : 'Select…'}
          right={
            loading
              ? <TextInput.Icon icon={() => <ActivityIndicator size={14} />} />
              : <TextInput.Icon icon="menu-down" onPress={() => setVisible(true)} />
          }
          onFocus={() => setVisible(true)}
        />
      }
    >
      {options.map((o, idx) => (
        <Menu.Item key={`${o}-${idx}`} title={o} onPress={() => { onChange(o); setVisible(false); }} />
      ))}
      <Menu.Item
        leadingIcon="pencil-outline"
        title="Other…"
        onPress={() => { setVisible(false); onChange(''); setOverride(true); }}
      />
    </Menu>
  );
};

const ParamBlock: React.FC<{
  label: string;
  description?: string | null;
  onRemove: () => void;
  children: React.ReactNode;
}> = ({ label, description, onRemove, children }) => {
  const theme = useTheme();
  return (
    <View style={styles.paramBlock}>
      <View style={styles.labelRow}>
        <Text variant="labelMedium" style={[styles.paramLabel, { color: theme.colors.primary }]}>
          {label}
        </Text>
        <IconButton icon="close" size={14} onPress={onRemove} style={styles.removeBtn} />
      </View>
      {description ? (
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
          {description}
        </Text>
      ) : null}
      {children}
    </View>
  );
};

const ParameterArgRow: React.FC<Props> = ({ arg, paramMeta, onUpdate, onRemove }) => {
  const theme = useTheme();
  const { options: dynamicOptions, loading: dynamicLoading } = useDynamicOptions(
    paramMeta?.options_source,
  );

  // No metadata — free-text key + value (un-annotated / custom arg).
  if (!paramMeta) {
    return (
      <View style={styles.row}>
        <TextInput
          mode="flat" label="Key" value={arg.key} onChangeText={(v) => onUpdate({ key: v })}
          dense style={[styles.input, styles.flex]}
        />
        <Text style={[styles.equals, { color: theme.colors.onSurfaceVariant }]}>=</Text>
        <TextInput
          mode="flat" label="Value" value={arg.value} onChangeText={(v) => onUpdate({ value: v })}
          dense style={[styles.input, styles.flex]}
        />
        <IconButton icon="close" size={14} onPress={onRemove} style={styles.removeBtn} />
      </View>
    );
  }

  const { type, enum_values, description } = paramMeta;
  const hasEnum = !!(enum_values && enum_values.length > 0);
  const dateParam = isDateType(type);

  // Constrained option list (priority: live source > static enum > date keys).
  const constrained: string[] | null =
    dynamicOptions ?? (hasEnum ? enum_values! : dateParam ? DATE_KEYS : null);

  // Array types — each item gets the right control.
  if (isArrayType(type)) {
    const items = parseArrayValue(arg.value);
    const itemOptions: string[] | null =
      dynamicOptions ?? (hasEnum ? enum_values! : dateParam ? DATE_KEYS : null);

    const updateItem = (idx: number, val: string) => {
      const next = [...items];
      next[idx] = val;
      onUpdate({ value: serializeArray(next) });
    };
    const addItem = () => onUpdate({ value: serializeArray([...items, '']) });
    const removeItem = (idx: number) =>
      onUpdate({ value: serializeArray(items.filter((_, i) => i !== idx)) });

    return (
      <ParamBlock label={arg.key} description={description} onRemove={onRemove}>
        {items.map((item, idx) => (
          <View key={idx} style={styles.row}>
            {itemOptions ? (
              <ConstrainedSelect
                value={item}
                options={itemOptions}
                loading={dynamicLoading}
                onChange={(v) => updateItem(idx, v)}
                flex
              />
            ) : (
              <TextInput
                mode="flat" label={`Item ${idx + 1}`} value={item}
                onChangeText={(v) => updateItem(idx, v)} dense style={[styles.input, styles.flex]}
              />
            )}
            <IconButton icon="minus-circle-outline" size={16} onPress={() => removeItem(idx)} style={styles.removeBtn} />
          </View>
        ))}
        <Text variant="labelSmall" style={{ color: theme.colors.primary, marginTop: 2 }} onPress={addItem}>
          + Add item
        </Text>
      </ParamBlock>
    );
  }

  // Bool
  if (type === 'bool' || type === 'boolean') {
    return (
      <ParamBlock label={arg.key} description={description} onRemove={onRemove}>
        <SegmentedButtons
          value={arg.value || 'true'}
          onValueChange={(v) => onUpdate({ value: v })}
          density="small"
          buttons={[
            { value: 'true', label: 'True' },
            { value: 'false', label: 'False' },
          ]}
        />
      </ParamBlock>
    );
  }

  // Constrained scalar — live source, enum, or date keys → dropdown + Other.
  if (constrained) {
    return (
      <ParamBlock label={arg.key} description={description} onRemove={onRemove}>
        <ConstrainedSelect
          value={arg.value}
          options={constrained}
          loading={dynamicLoading}
          onChange={(v) => onUpdate({ value: v })}
        />
      </ParamBlock>
    );
  }

  // Numeric / free-text scalar
  const isNumeric = type === 'int' || type === 'integer' || type === 'float' || type === 'number';
  return (
    <ParamBlock label={arg.key} description={description} onRemove={onRemove}>
      <TextInput
        mode="flat" value={arg.value} onChangeText={(v) => onUpdate({ value: v })}
        dense style={styles.input}
        keyboardType={isNumeric ? 'numeric' : 'default'}
      />
    </ParamBlock>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  overrideRow: { flexDirection: 'row', alignItems: 'center' },
  paramBlock: { marginBottom: 4, marginLeft: 4 },
  labelRow: { flexDirection: 'row', alignItems: 'center' },
  paramLabel: { fontWeight: '600', fontSize: 12, flex: 1 },
  input: { backgroundColor: 'transparent', fontSize: 13, paddingHorizontal: 4 },
  flex: { flex: 1 },
  equals: { paddingTop: 12 },
  removeBtn: { margin: 0 },
});

export default ParameterArgRow;
