import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  Chip,
  Dialog,
  FAB,
  Portal,
  SegmentedButtons,
  Text,
  useTheme,
} from 'react-native-paper';

import { RoutinesStackParamList } from '../../navigation/types';
import {
  deleteRoutine,
  loadRoutines,
} from '../../services/routineStorageService';
import type { Routine } from '../../types/Routine';

type Nav = NativeStackNavigationProp<RoutinesStackParamList>;
type Filter = 'all' | 'on_demand' | 'background';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const getRoutineIcon = (routine: Routine): { name: IconName; color?: string } => {
  if (!routine.background) return { name: 'microphone-outline' };
  if (!routine.background.enabled) return { name: 'pause-circle-outline' };
  if (routine.background.schedule_type === 'cron') return { name: 'calendar-clock' };
  return { name: 'timer-sand' };
};

const formatSchedule = (routine: Routine): string | null => {
  const bg = routine.background;
  if (!bg) return null;

  if (bg.schedule_type === 'cron') {
    const dayLabel =
      bg.days.length === 7
        ? 'Every day'
        : bg.days.length === 5 &&
            ['mon', 'tue', 'wed', 'thu', 'fri'].every((d) => bg.days.includes(d as typeof bg.days[number]))
          ? 'Weekdays'
          : bg.days.length === 2 &&
              bg.days.includes('sat') &&
              bg.days.includes('sun')
            ? 'Weekends'
            : bg.days.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(', ');
    const [h, m] = bg.time.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${dayLabel} · ${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  const mins = bg.interval_minutes;
  const label = mins >= 60 ? `${mins / 60}h` : `${mins}m`;
  return `Every ${label}`;
};

const RoutineListScreen = () => {
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Routine | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    const data = await loadRoutines();
    setRoutines(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await deleteRoutine(deleteTarget.id);
    setDeleteTarget(null);
    load();
  };

  const filtered = useMemo(() => {
    if (filter === 'on_demand') return routines.filter((r) => !r.background);
    if (filter === 'background') return routines.filter((r) => r.background !== null);
    return routines;
  }, [routines, filter]);

  const renderRoutine = ({ item }: { item: Routine }) => {
    const schedule = formatSchedule(item);
    const icon = getRoutineIcon(item);
    const bgEnabled = item.background?.enabled ?? true;

    return (
      <Card
        style={styles.card}
        onPress={() => navigation.navigate('RoutineEdit', { routineId: item.id })}
        onLongPress={() => setDeleteTarget(item)}
      >
        <Card.Content>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons
              name={icon.name}
              size={20}
              color={bgEnabled ? theme.colors.primary : theme.colors.onSurfaceVariant}
              style={{ marginRight: 8 }}
            />
            <Text variant="titleMedium" style={[{ flex: 1 }, !bgEnabled && { opacity: 0.5 }]}>
              {item.name}
            </Text>
          </View>
          <View style={styles.chips}>
            {item.trigger_phrases.slice(0, 3).map((phrase) => (
              <Chip key={phrase} compact style={styles.chip} textStyle={styles.chipText}>
                {phrase}
              </Chip>
            ))}
          </View>
          <View style={styles.metaRow}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {item.steps.length} step{item.steps.length !== 1 ? 's' : ''}
            </Text>
            {schedule && (
              <Chip
                compact
                style={[styles.scheduleBadge, !bgEnabled && { opacity: 0.5 }]}
                textStyle={[styles.chipText, { color: theme.colors.primary }]}
              >
                {schedule}
              </Chip>
            )}
          </View>
        </Card.Content>
      </Card>
    );
  };

  const emptyComponent = (
    <View style={styles.center}>
      <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
        {filter !== 'all'
          ? `No ${filter === 'background' ? 'background' : 'on-demand'} routines.`
          : 'No routines yet. Tap + to create your first routine.'}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.onBackground }]}>
        Routines
      </Text>

      <View style={styles.filterRow}>
        <SegmentedButtons
          value={filter}
          onValueChange={(v) => setFilter(v as Filter)}
          density="small"
          buttons={[
            { value: 'all', label: 'All' },
            { value: 'on_demand', label: 'On-demand' },
            { value: 'background', label: 'Background' },
          ]}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(r) => r.id}
        renderItem={renderRoutine}
        contentContainerStyle={filtered.length === 0 ? styles.emptyList : styles.list}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={emptyComponent}
      />

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        color={theme.colors.onPrimary}
        onPress={() => navigation.navigate('RoutineEdit', {})}
        label="New Routine"
      />

      <Portal>
        <Dialog visible={deleteTarget !== null} onDismiss={() => setDeleteTarget(null)}>
          <Dialog.Title>Delete Routine</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={{ fontWeight: '600', marginBottom: 8 }}>
              {deleteTarget?.name}
            </Text>
            <Text variant="bodySmall" style={{ opacity: 0.6 }}>
              This will remove the routine from the app. Nodes that already
              received it will keep their copy until overwritten.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteTarget(null)}>Cancel</Button>
            <Button onPress={handleDeleteConfirm} textColor={theme.colors.error}>Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 64 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  title: { fontWeight: 'bold', paddingHorizontal: 16, marginBottom: 12 },
  filterRow: { paddingHorizontal: 16, marginBottom: 12 },
  list: { padding: 16, gap: 12, paddingBottom: 96 },
  emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  card: {},
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, marginBottom: 6 },
  chip: { height: 30, paddingHorizontal: 2 },
  chipText: { fontSize: 11 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  scheduleBadge: { height: 26 },
  fab: { position: 'absolute', right: 16, bottom: 24 },
});

export default RoutineListScreen;
