import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Button,
  HelperText,
  Menu,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import {
  CallContextField,
  CallContextTier,
  CatalogField,
  putCallContext,
} from '../../api/callContextApi';
import type { CallContextStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<CallContextStackParamList, 'CallContextEdit'>;

const DEFAULT_CATEGORY = 'general';
const DEFAULT_TIER: CallContextTier = 'if_asked';

const CallContextEditScreen = ({ navigation, route }: Props) => {
  const theme = useTheme();
  const { fields, catalog, index } = route.params;
  const isNew = index === undefined;
  const existing = isNew ? undefined : fields[index];

  const [label, setLabel] = useState(existing?.label ?? '');
  const [value, setValue] = useState(existing?.value ?? '');
  const [category, setCategory] = useState(existing?.category ?? DEFAULT_CATEGORY);
  const [tier, setTier] = useState<CallContextTier>(existing?.tier ?? DEFAULT_TIER);
  // A well-known field keeps its key so an edit updates the same row rather
  // than minting a new one; a custom field has none and the server derives it.
  const [key, setKey] = useState<string | undefined>(existing?.key);

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ label?: string; value?: string }>({});
  const [presetMenu, setPresetMenu] = useState(false);
  const [categoryMenu, setCategoryMenu] = useState(false);

  // Presets the user hasn't already added — offering a duplicate would just
  // collide on save.
  const availablePresets = useMemo(() => {
    const used = new Set(fields.map((f) => f.key).filter(Boolean));
    return catalog.well_known.filter((w) => !used.has(w.key));
  }, [fields, catalog.well_known]);

  const applyPreset = (preset: CatalogField) => {
    setKey(preset.key);
    setLabel(preset.label);
    setCategory(preset.category);
    setTier(preset.tier);
    setPresetMenu(false);
    setErrors({});
  };

  const categoryLabel =
    catalog.categories.find((c) => c.value === category)?.label ?? category;

  const tierButtons = catalog.tiers.map((t) => ({
    value: t.value,
    label: t.label,
  }));

  const handleSave = async () => {
    const trimmedLabel = label.trim();
    const trimmedValue = value.trim();
    const localErrors: { label?: string; value?: string } = {};
    if (!trimmedLabel) localErrors.label = 'Give this a name';
    if (!trimmedValue) localErrors.value = 'Enter a value';
    // A same-named field would slug to the same key and the server would drop
    // one on dedup — catch it here rather than let a row silently vanish.
    const clashes = fields.some(
      (f, i) =>
        i !== index && f.label.trim().toLowerCase() === trimmedLabel.toLowerCase(),
    );
    if (clashes) localErrors.label = 'You already have a detail with that name';
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }
    setErrors({});

    const edited: CallContextField = {
      ...(key ? { key } : {}),
      label: trimmedLabel,
      value: trimmedValue,
      category,
      tier,
    };
    const next = isNew
      ? [...fields, edited]
      : fields.map((f, i) => (i === index ? edited : f));

    setSaving(true);
    try {
      await putCallContext(next);
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header mode="small">
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={isNew ? 'Add detail' : 'Edit detail'} />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {isNew && availablePresets.length > 0 && (
          <>
            <Menu
              visible={presetMenu}
              onDismiss={() => setPresetMenu(false)}
              anchor={
                <Button
                  testID="call-context-preset-button"
                  mode="outlined"
                  icon="star-outline"
                  onPress={() => setPresetMenu(true)}
                >
                  Start from a common detail
                </Button>
              }
            >
              {availablePresets.map((preset) => (
                <Menu.Item
                  key={preset.key}
                  title={preset.label}
                  onPress={() => applyPreset(preset)}
                />
              ))}
            </Menu>
            <Text variant="bodySmall" style={styles.presetHint}>
              …or just fill in your own below.
            </Text>
          </>
        )}

        <Text variant="labelLarge" style={styles.label}>
          Name
        </Text>
        <TextInput
          testID="call-context-label-input"
          mode="outlined"
          value={label}
          onChangeText={(v) => {
            setLabel(v);
            // Typing a fresh name means this is no longer that preset's row.
            if (key) setKey(undefined);
            if (errors.label) setErrors((p) => ({ ...p, label: undefined }));
          }}
          placeholder="e.g. Rewards number"
          disabled={saving}
          maxLength={100}
          error={!!errors.label}
          style={styles.input}
        />
        {!!errors.label && (
          <HelperText type="error" visible testID="call-context-label-error">
            {errors.label}
          </HelperText>
        )}

        <Text variant="labelLarge" style={styles.label}>
          Value
        </Text>
        <TextInput
          testID="call-context-value-input"
          mode="outlined"
          value={value}
          onChangeText={(v) => {
            setValue(v);
            if (errors.value) setErrors((p) => ({ ...p, value: undefined }));
          }}
          placeholder="e.g. 9982-4471"
          disabled={saving}
          maxLength={300}
          error={!!errors.value}
          style={styles.input}
        />
        {!!errors.value && (
          <HelperText type="error" visible testID="call-context-value-error">
            {errors.value}
          </HelperText>
        )}

        <Text variant="labelLarge" style={styles.label}>
          Category
        </Text>
        <Text variant="bodySmall" style={styles.hint}>
          Tags this detail so calls can use it later. For now every detail is
          available on every call — categories will let a member ID stay off a
          pizza order down the line.
        </Text>
        <Menu
          visible={categoryMenu}
          onDismiss={() => setCategoryMenu(false)}
          anchor={
            <Button
              testID="call-context-category-button"
              mode="outlined"
              icon="shape-outline"
              onPress={() => setCategoryMenu(true)}
              style={styles.categoryButton}
              disabled={saving}
            >
              {categoryLabel}
            </Button>
          }
        >
          {catalog.categories.map((c) => (
            <Menu.Item
              key={c.value}
              title={c.label}
              onPress={() => {
                setCategory(c.value);
                setCategoryMenu(false);
              }}
            />
          ))}
        </Menu>

        <Text variant="labelLarge" style={styles.label}>
          When can Jarvis say it?
        </Text>
        <Text variant="bodySmall" style={styles.hint}>
          "Only if asked" is kept back unless the other side asks for it — use
          it for anything sensitive.
        </Text>
        {tierButtons.length > 0 && (
          <View testID="call-context-tier-segmented" style={styles.tier}>
            <SegmentedButtons
              value={tier}
              onValueChange={(v) => setTier(v as CallContextTier)}
              buttons={tierButtons}
            />
          </View>
        )}

        <Button
          testID="call-context-save-button"
          mode="contained"
          onPress={handleSave}
          loading={saving}
          disabled={saving || !label.trim() || !value.trim()}
          style={styles.saveButton}
        >
          {isNew ? 'Save' : 'Update'}
        </Button>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 48, gap: 4 },
  presetHint: { opacity: 0.6, marginTop: 8, marginBottom: 4 },
  label: { fontWeight: '600', marginTop: 16, marginBottom: 8 },
  input: { marginBottom: 4 },
  hint: { opacity: 0.6, marginBottom: 8 },
  categoryButton: { alignSelf: 'flex-start' },
  tier: { marginTop: 4 },
  saveButton: { marginTop: 28, alignSelf: 'flex-start' },
});

export default CallContextEditScreen;
