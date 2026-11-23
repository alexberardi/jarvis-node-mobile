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
  FAB,
  IconButton,
  SegmentedButtons,
  Menu,
  Text,
  useTheme,
} from 'react-native-paper';

import { getSmartHomeConfig } from '../../api/smartHomeApi';
import { deleteRoutine, listRoutines, runRoutineNow } from '../../api/routineApi';
import { listNodes } from '../../api/nodeApi';
import { useAuth } from '../../auth/AuthContext';
import { RoutinesStackParamList } from '../../navigation/types';
import { fabListPaddingBottom, fabStyle } from '../../theme/fab';
import type { Routine, RoutineSchedule } from '../../types/Routine';
import { NodeKindIcon } from '../../components/NodeKindIcon';
import ScheduleListScreen from '../Schedules/ScheduleListScreen';
import SignalAutomationsScreen from '../Settings/SignalAutomationsScreen';
import { useNodeKinds } from '../../hooks/useNodeKinds';
import { nodeDisplayName, withKnownKind } from '../../utils/nodeKind';

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

type Section = 'routines' | 'scheduled' | 'triggers';

const RoutineListScreen = () => {
  // Routines you start, errands on a schedule, and triggers ("when I leave, lock the door").
  const [section, setSection] = useState<Section>('routines');
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
  const nodeKinds = useNodeKinds(householdId, nodes.map((n) => n.node_id));
  const hasSimple = routines.some((r) => r.mode === 'simple');
  const nodeSupport = useQuery({
    queryKey: ['routineNodes', householdId],
    queryFn: () => listNodes(householdId!),
    enabled: !!householdId && hasSimple,
  });
  const refreshNodeSupport = nodeSupport.refetch;
  const supportsSimpleOn = (id: string) => nodeSupport.data?.some((n) => n.node_id === id && n.capabilities?.simple_routines === true) === true;

  const [runMenuOpen, setRunMenuOpen] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (householdId) {
        refetch();
        if (hasSimple) refreshNodeSupport();
      }
    }, [householdId, refetch, hasSimple, refreshNodeSupport]),
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
      if (routine.mode === 'simple' && !supportsSimpleOn(nodeId)) {
        Alert.alert('Update required', 'Update Jarvis on this node to run Simple routines.');
        return;
      }
      setRunMenuOpen(null);
      setRunning(routine.id);
      try {
        const result = await runRoutineNow(householdId!, routine.id, nodeId);
        if (result.status === 'timeout') {
          Alert.alert('No response', result.message || 'The node did not respond. Some actions may have run.');
        } else if (result.message) {
          Alert.alert(routine.name, result.message);
        } else {
          Alert.alert(routine.name, result.success ? 'Done.' : 'The routine reported an error.');
        }
      } catch (e) {
        console.error('[RoutineListScreen] run-now failed', e);
        if ((e as { code?: string })?.code === 'ECONNABORTED') {
          // Our own (long) client timeout — the routine may still finish on the node.
          Alert.alert('Still running', 'No result yet. The routine may still finish on the node.');
        } else {
          Alert.alert('Error', 'Could not run the routine.');
        }
      } finally {
        setRunning(null);
      }
    },
    [householdId, nodeSupport.data],
  );

  const handleRun = useCallback(
    (routine: Routine) => {
      if (routine.mode === 'simple' && !nodeSupport.data) {
        Alert.alert('Node support unavailable', 'Could not check node support. Refresh the routines list and try again.');
        return;
      }
      const eligible = routine.mode === 'simple' ? nodes.filter((n) => supportsSimpleOn(n.node_id)) : nodes;
      if (routine.mode === 'simple' && eligible.length === 0) {
        Alert.alert('Update required', 'Update Jarvis on a node to run Simple routines.');
        return;
      }
      if (eligible.length === 0) {
        // No known nodes — let the server fall back to the primary node.
        runOnNode(routine, primaryNodeId ?? '');
        return;
      }
      if (eligible.length === 1) {
        runOnNode(routine, eligible[0].node_id);
        return;
      }
      setRunMenuOpen(routine.id);
    },
    [nodes, primaryNodeId, runOnNode, nodeSupport.data],
  );

  const renderRightActions = (routine: Routine) => () => (
    <TouchableOpacity testID={`routine-delete-${routine.id}`} style={styles.deleteAction} onPress={() => handleDelete(routine)} activeOpacity={0.7}>
      <IconButton icon="delete-outline" iconColor="#fff" size={24} />
    </TouchableOpacity>
  );
  const makeRightActions = (routine: Routine) =>
    (_p: SharedValue<number>, _d: SharedValue<number>) => renderRightActions(routine)();

  const renderRoutine = ({ item }: { item: Routine }) => {
    const schedule = formatSchedule(item.schedule);
    return (
      <ReanimatedSwipeable renderRightActions={makeRightActions(item)} overshootRight={false}>
        <Card testID={`routine-card-${item.id}`} style={styles.card} onPress={() => navigation.navigate('RoutineEdit', { routineId: item.id })}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <View style={[styles.rowIcon, { backgroundColor: theme.colors.secondaryContainer }]}>
                <MaterialCommunityIcons name={scheduleIcon(item.schedule)} size={20} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text variant="titleMedium">{item.name}</Text>
                {item.trigger_phrases.length > 0 && (
                  <Text variant="bodyMedium" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
                    {item.trigger_phrases.slice(0, 2).map((p) => `\u201c${p}\u201d`).join(', ')}
                    {item.trigger_phrases.length > 2 ? ` +${item.trigger_phrases.length - 2}` : ''}
                  </Text>
                )}
                <Text variant="bodySmall" numberOfLines={2} style={{ color: theme.colors.onSurfaceVariant, opacity: 0.8 }}>
                  {[
                    item.mode === 'simple'
                      ? item.utterance
                      : `${item.steps.length} step${item.steps.length !== 1 ? 's' : ''}`,
                    schedule,
                  ].filter(Boolean).join(' \u00b7 ')}
                </Text>
              </View>
              {running === item.id ? (
                <View testID={`routine-running-${item.id}`} style={styles.running}>
                  <ActivityIndicator size={16} />
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Running…
                  </Text>
                </View>
              ) : (
                <Menu
                  visible={runMenuOpen === item.id}
                  onDismiss={() => setRunMenuOpen(null)}
                  anchor={
                    <IconButton testID={`routine-run-${item.id}`} icon="play-circle-outline" size={22}
                      disabled={item.mode === 'simple' && nodeSupport.isPending} onPress={() => handleRun(item)} style={{ margin: -4 }} />
                  }
                >
                  {nodes.map((n) => (
                    <Menu.Item key={n.node_id}
                      disabled={item.mode === 'simple' && !supportsSimpleOn(n.node_id)}
                      title={`${nodeDisplayName(withKnownKind(n, nodeKinds[n.node_id]), n.node_id)}${item.mode === 'simple' && !supportsSimpleOn(n.node_id) ? ' — update required' : ''}`}
                      leadingIcon={({ size, color }) => (
                        <NodeKindIcon
                          node={nodeKinds[n.node_id]}
                          size={size}
                          color={color}
                          testID={`routine-run-node-kind-${n.node_id}`}
                        />
                      )}
                      onPress={() => runOnNode(item, n.node_id)} />
                  ))}
                </Menu>
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

  const header = (
    <>
      <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.onBackground }]}>Routines</Text>
      <SegmentedButtons
        value={section}
        onValueChange={(v) => setSection(v as Section)}
        style={styles.segments}
        buttons={[
          { value: 'routines', label: 'Routines', testID: 'routines-tab-routines' },
          { value: 'scheduled', label: 'Scheduled', testID: 'open-schedules' },
          { value: 'triggers', label: 'Triggers', testID: 'routines-tab-triggers' },
        ]}
      />
    </>
  );

  if (section === 'scheduled') {
    return <View style={styles.container}>{header}<ScheduleListScreen /></View>;
  }
  if (section === 'triggers') {
    return (
      <View style={styles.container}>
        {header}
        {householdId ? <SignalAutomationsScreen householdId={householdId} /> : null}
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.center}><ActivityIndicator size="large" /></View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {header}
      <FlatList
        data={routines}
        keyExtractor={(r) => r.id}
        renderItem={renderRoutine}
        contentContainerStyle={routines.length === 0 ? styles.emptyList : styles.list}
        refreshing={isRefetching}
        onRefresh={() => { refetch(); nodeSupport.refetch(); }}
        ListEmptyComponent={emptyComponent}
      />
      <FAB
        testID="routine-add-fab"
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        onPress={() => navigation.navigate('RoutineEdit', {})}
        color={theme.colors.onPrimary}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 64 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  header: { flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
  title: { fontWeight: 'bold', paddingHorizontal: 16, marginBottom: 12 },
  segments: { marginHorizontal: 16, marginBottom: 4 },
  list: { padding: 16, gap: 12, paddingBottom: fabListPaddingBottom },
  running: { flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 8 },
  emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  card: {},
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fab: fabStyle,
  deleteAction: {
    backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center',
    width: 72, borderRadius: 12, marginLeft: 8,
  },
});

export default RoutineListScreen;
