import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Chip,
  SegmentedButtons,
  Switch,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import {
  createMemory,
  deleteMemory,
  getMemory,
  Memory,
  MemoryScope,
  updateMemory,
} from '../../api/memoriesApi';
import { useAuth } from '../../auth/AuthContext';
import type { MemoriesStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<MemoriesStackParamList, 'MemoryEdit'>;

const CATEGORY_OPTIONS = ['general', 'preference', 'fact', 'note'] as const;

const MemoriesEditScreen = ({ navigation, route }: Props) => {
  const theme = useTheme();
  const { state: authState } = useAuth();
  const householdId = authState.activeHouseholdId;
  const memoryId = route.params?.memoryId;
  const isNew = memoryId === undefined;

  const activeRole = useMemo(
    () => authState.households.find((h) => h.id === householdId)?.role ?? 'member',
    [authState.households, householdId],
  );
  const elevated = activeRole === 'admin' || activeRole === 'power_user';
  const isAdmin = activeRole === 'admin';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<Memory | null>(null);

  const [content, setContent] = useState('');
  const [category, setCategory] = useState<string>('general');
  const [isPinned, setIsPinned] = useState(false);
  const [scope, setScope] = useState<MemoryScope>('user');

  useEffect(() => {
    if (isNew || !householdId || memoryId === undefined) return;
    let cancelled = false;
    setLoading(true);
    getMemory(memoryId, householdId)
      .then((m) => {
        if (cancelled) return;
        setExisting(m);
        setContent(m.content);
        setCategory(m.category);
        setIsPinned(m.is_pinned);
        setScope(m.user_id === null ? 'household' : 'user');
      })
      .catch(() => {
        if (cancelled) return;
        Alert.alert('Error', 'Could not load memory', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isNew, memoryId, householdId, navigation]);

  const readOnly = existing ? !existing.editable : false;

  const handleSave = useCallback(async () => {
    if (!householdId) return;
    const trimmed = content.trim();
    if (!trimmed) {
      Alert.alert('Required', 'Memory content cannot be empty');
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        await createMemory(householdId, {
          content: trimmed,
          category,
          is_pinned: isPinned,
          scope,
        });
      } else if (memoryId !== undefined) {
        await updateMemory(memoryId, householdId, {
          content: trimmed,
          category,
          is_pinned: isPinned,
        });
      }
      navigation.goBack();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  }, [householdId, isNew, memoryId, content, category, isPinned, scope, navigation]);

  const handleDelete = useCallback(() => {
    if (!householdId || memoryId === undefined) return;
    Alert.alert(
      'Forget',
      'Delete this memory? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMemory(memoryId, householdId);
              navigation.goBack();
            } catch {
              Alert.alert('Error', 'Failed to delete');
            }
          },
        },
      ],
    );
  }, [householdId, memoryId, navigation]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header mode="small">
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={isNew ? 'New Memory' : 'Edit Memory'} />
        {!isNew && !readOnly && (
          <Appbar.Action icon="delete-outline" onPress={handleDelete} />
        )}
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {readOnly && existing && (
          <View style={styles.readOnlyBanner}>
            <Chip icon="lock" compact style={{ alignSelf: 'flex-start' }}>
              Read-only — agent-injected memory
            </Chip>
            <Text variant="bodySmall" style={styles.hint}>
              These are managed automatically (calendar, news, weather). Ask an admin if you need
              this removed.
            </Text>
          </View>
        )}

        <Text variant="labelLarge" style={styles.label}>
          Content
        </Text>
        <TextInput
          mode="outlined"
          multiline
          numberOfLines={4}
          value={content}
          onChangeText={setContent}
          placeholder="e.g. likes oat milk in coffee"
          disabled={readOnly || saving}
          maxLength={2000}
          style={styles.input}
        />

        <Text variant="labelLarge" style={styles.label}>
          Category
        </Text>
        <SegmentedButtons
          value={category}
          onValueChange={setCategory}
          buttons={CATEGORY_OPTIONS.map((c) => ({
            value: c,
            label: c,
            disabled: readOnly || saving,
          }))}
          style={styles.input}
        />

        {isNew && elevated && (
          <>
            <Text variant="labelLarge" style={styles.label}>
              Scope
            </Text>
            <SegmentedButtons
              value={scope}
              onValueChange={(v) => setScope(v as MemoryScope)}
              buttons={[
                { value: 'user', label: 'Just me', icon: 'account' },
                { value: 'household', label: 'Household', icon: 'home-group' },
              ]}
              style={styles.input}
            />
            <Text variant="bodySmall" style={styles.hint}>
              Household memories are visible to everyone in the household.
            </Text>
          </>
        )}

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium">Pin to identity</Text>
            <Text variant="bodySmall" style={styles.hint}>
              Pinned memories are always included in Jarvis's context.
            </Text>
          </View>
          <Switch value={isPinned} onValueChange={setIsPinned} disabled={readOnly || saving} />
        </View>

        {existing && (
          <View style={styles.metaRow}>
            <Text variant="bodySmall" style={styles.meta}>
              Source: {existing.source}
            </Text>
            <Text variant="bodySmall" style={styles.meta}>
              Updated: {new Date(existing.updated_at).toLocaleString()}
            </Text>
          </View>
        )}

        {!readOnly && (
          <Button
            mode="contained"
            onPress={handleSave}
            loading={saving}
            disabled={saving || !content.trim()}
            style={styles.saveButton}
          >
            {isNew ? 'Save' : 'Update'}
          </Button>
        )}

        {/* Admin-only hint for elevating to agent_context — keeping the
            backend permission explicit, UI just blocks the category from the list above. */}
        {isNew && !isAdmin && (
          <Text variant="bodySmall" style={[styles.hint, { marginTop: 24 }]}>
            Note: agent-context memories (calendar/news/weather) are managed automatically.
          </Text>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, paddingBottom: 48, gap: 4 },
  label: { fontWeight: '600', marginTop: 16, marginBottom: 8 },
  input: { marginBottom: 4 },
  hint: { opacity: 0.6, marginTop: 4 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingVertical: 4,
    gap: 12,
  },
  metaRow: { marginTop: 24, gap: 4 },
  meta: { opacity: 0.6 },
  saveButton: { marginTop: 24, alignSelf: 'flex-start' },
  readOnlyBanner: {
    padding: 12,
    backgroundColor: 'rgba(100,116,139,0.08)',
    borderRadius: 8,
    gap: 6,
  },
});

export default MemoriesEditScreen;
