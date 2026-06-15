import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SharedValue } from 'react-native-reanimated';
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  FAB,
  IconButton,
  Menu,
  Text,
  useTheme,
} from 'react-native-paper';

import { getSmartHomeConfig } from '../../api/smartHomeApi';
import { deleteRoutine, listRoutines, runRoutineNow } from '../../api/routineApi';
import { useAuth } from '../../auth/AuthContext';
import { RoutinesStackParamList } from '../../navigation/types';
import type { Routine, RoutineSchedule } from '../../types/Routine';

type Nav = NativeStackNavigationProp<RoutinesStackParamList>;
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const scheduleIcon = (s: RoutineSchedule | null | undefined): IconName => {
  if (!s) return 'microphone-outline';
  return s.type === 'cron' ? 'calendar-clock' : 'timer-sand';
};

const formatSchedule = (s: RoutineSchedule | null | undefined): string | null => {
  if (!s) return null;
  if (s.type === 'interval') {
    const mins = Math.round((s.interval_seconds ?? 0) / 60);
    return `Every ${mins >= 60 ? `${mins / 60}h` : `${mins}m`}`;
  }
  const parts = (s.cron ?? '').trim().split(/\s+/);
  if (parts.length < 5) return 'Scheduled';
  const minute = parseInt(parts[0], 10);
  const hour = parseInt(parts[1], 10);
  const df = parts[4];
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  const tlabel = `${h12}:${String(Number.isNaN(minute) ? 0 : minute).padStart(2, '0')} ${ampm}`;
  let dlabel = 'Daily';
  if (df !== '*') {
    const nums = df.split(',').map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
    const set = new Set(nums);
    if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) dlabel = 'Weekdays';
    else if (set.size === 2 && set.has(0) && set.has(6)) dlabel = 'Weekends';
    else dlabel = nums.map((n) => DAY_NAMES[n % 7]).join(', ');
  }
  return `${dlabel} · ${tlabel}`;
};

const RoutineListScreen = () => {
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const { state: authState } = useAuth();
  const householdId = authState.activeHouseholdId;

  const {
    data: routines = [],
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['routines', householdId],
    queryFn: () => listRoutines(householdId!),
    enabled: !!householdId,
  });

  const { data: smartHomeConfig } = useQuery({
    queryKey: ['smartHomeConfig', householdId],
    queryFn: () => getSmartHomeConfig(householdId!),
    enabled: !!householdId,
  });
  const nodes = smartHomeConfig?.nodes ?? [];
  const primaryNodeId = smartHomeConfig?.primary_node_id || null;

  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [runMenuOpen, setRunMenuOpen] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (householdId) refetch();
    }, [householdId, refetch]),
  );

  const handleDelete = useCallback(
    (routine: Routine) => {
      Alert.alert('Delete', `Remove "${routine.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRoutine(householdId!, routine.id);
              refetch();
            } catch (e) {
              console.error('[RoutineListScreen] delete failed', e);
              Alert.alert('Error', 'Could not delete routine.');
            }
          },
        },
      ]);
    },
    [householdId, refetch],
  );

  const runOnNode = useCallback(
    async (routine: Routine, nodeId: string) => {
      setRunMenuOpen(null);
      setRunning(routine.id);
      try {
        const result = await runRoutineNow(householdId!, routine.id, nodeId);
        if (result.status === 'timeout') {
          Alert.alert('No response', 'The node did not respond. Is it online?');
        } else if (result.message) {
          Alert.alert(routine.name, result.message);
        } else {
          Alert.alert(routine.name, result.success ? 'Done.' : 'The routine reported an error.');
        }
      } catch (e) {
        console.error('[RoutineListScreen] run-now failed', e);
        Alert.alert('Error', 'Could not run the routine.');
      } finally {
        setRunning(null);
      }
    },
    [householdId],
  );

  const handleRun = useCallback(
    (routine: Routine) => {
      setMenuOpen(null);
      if (nodes.length === 0) {
        // No known nodes — let the server fall back to the primary node.
        runOnNode(routine, primaryNodeId ?? '');
        return;
      }
      if (nodes.length === 1) {
        runOnNode(routine, nodes[0].node_id);
        return;
      }
      setRunMenuOpen(routine.id);
    },
    [nodes, primaryNodeId, runOnNode],
  );

  const renderRightActions = (routine: Routine) => () => (
    <TouchableOpacity style={styles.deleteAction} onPress={() => handleDelete(routine)} activeOpacity={0.7}>
      <IconButton icon="delete-outline" iconColor="#fff" size={24} />
    </TouchableOpacity>
  );
  const makeRightActions = (routine: Routine) =>
    (_p: SharedValue<number>, _d: SharedValue<number>) => renderRightActions(routine)();

  const renderRoutine = ({ item }: { item: Routine }) => {
    const schedule = formatSchedule(item.schedule);
    return (
      <ReanimatedSwipeable renderRightActions={makeRightActions(item)} overshootRight={false}>
        <Card style={styles.card} onPress={() => navigation.navigate('RoutineEdit', { routineId: item.id })}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons
                name={scheduleIcon(item.schedule)}
                size={20}
                color={theme.colors.primary}
                style={{ marginRight: 8 }}
              />
              <Text variant="titleMedium" style={{ flex: 1 }}>{item.name}</Text>
              {running === item.id ? (
                <ActivityIndicator size={20} style={{ marginRight: 8 }} />
              ) : (
                <Menu
                  visible={runMenuOpen === item.id}
                  onDismiss={() => setRunMenuOpen(null)}
                  anchor={
                    <IconButton icon="play-circle-outline" size={22} onPress={() => handleRun(item)} style={{ margin: -4 }} />
                  }
                >
                  {nodes.map((n) => (
                    <Menu.Item key={n.node_id}
                      title={n.room ? `${n.room}` : n.node_id}
                      leadingIcon="play"
                      onPress={() => runOnNode(item, n.node_id)} />
                  ))}
                </Menu>
              )}
              <Menu
                visible={menuOpen === item.id}
                onDismiss={() => setMenuOpen(null)}
                anchor={<IconButton icon="dots-vertical" size={20} onPress={() => setMenuOpen(item.id)} style={{ margin: -4 }} />}
              >
                <Menu.Item leadingIcon="pencil-outline" title="Edit"
                  onPress={() => { setMenuOpen(null); navigation.navigate('RoutineEdit', { routineId: item.id }); }} />
                <Menu.Item leadingIcon="delete-outline" title="Delete"
                  onPress={() => { setMenuOpen(null); handleDelete(item); }} />
              </Menu>
            </View>
            <View style={styles.chips}>
              {item.trigger_phrases.slice(0, 3).map((phrase) => (
                <Chip key={phrase} compact style={styles.chip} textStyle={styles.chipText}>{phrase}</Chip>
              ))}
            </View>
            <View style={styles.metaRow}>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {item.steps.length} step{item.steps.length !== 1 ? 's' : ''}
              </Text>
              {schedule && (
                <Chip compact style={styles.scheduleBadge} textStyle={[styles.chipText, { color: theme.colors.primary }]}>
                  {schedule}
                </Chip>
              )}
            </View>
          </Card.Content>
        </Card>
      </ReanimatedSwipeable>
    );
  };

  const emptyComponent = error ? (
    <View style={styles.center}>
      <Text variant="bodyLarge" style={{ color: theme.colors.error, marginBottom: 12 }}>Could not load routines.</Text>
      <Button mode="outlined" onPress={() => refetch()}>Retry</Button>
    </View>
  ) : (
    <View style={styles.center}>
      <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
        No routines yet. Tap + to create one — a phrase that runs a group of commands.
      </Text>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.onBackground }]}>Routines</Text>
        <View style={styles.center}><ActivityIndicator size="large" /></View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.onBackground }]}>Routines</Text>
      <FlatList
        data={routines}
        keyExtractor={(r) => r.id}
        renderItem={renderRoutine}
        contentContainerStyle={routines.length === 0 ? styles.emptyList : styles.list}
        refreshing={isRefetching}
        onRefresh={() => refetch()}
        ListEmptyComponent={emptyComponent}
      />
      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => navigation.navigate('RoutineEdit', {})}
        color={theme.colors.onPrimary}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 64 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  title: { fontWeight: 'bold', paddingHorizontal: 16, marginBottom: 12 },
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
  deleteAction: {
    backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center',
    width: 72, borderRadius: 12, marginLeft: 8,
  },
});

export default RoutineListScreen;
