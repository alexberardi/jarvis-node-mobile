import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import {
  Button,
  Card,
  Chip,
  Icon,
  IconButton,
  Menu,
  Modal,
  Portal,
  Surface,
  TouchableRipple,
  SegmentedButtons,
  Switch,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import { getSmartHomeConfig, type NodeOption } from '../../api/smartHomeApi';
import {
  createRoutine,
  deleteRoutine,
  getRoutine,
  getRoutineModes,
  updateRoutine,
  type RoutineWrite,
} from '../../api/routineApi';
import { listNodes } from '../../api/nodeApi';
import { useAuth } from '../../auth/AuthContext';
import { HelpIcon } from '../../components/HelpIcon';
import { friendlyCommand } from '../../utils/labels';
import ParameterArgRow from '../../components/ParameterArgRow';
import { helpCopy } from '../../copy/help';
import { useSettingsSnapshot } from '../../hooks/useSettingsSnapshot';
import { RoutinesStackParamList } from '../../navigation/types';
import type { CommandParameterEntry } from '../../services/settingsDecryptService';
import type {
  DayOfWeek,
  ResponseLength,
  RoutineSchedule,
  RoutineStep,
  RoutineStepArg,
  RoutineMode,
  ScheduleType,
} from '../../types/Routine';
import { ALL_DAYS, INTERVAL_PRESETS, WEEKDAYS, WEEKENDS } from '../../types/Routine';
import KeyboardSafeView from '../../components/KeyboardSafeView';
import { NodeKindIcon } from '../../components/NodeKindIcon';
import { useNodeKinds } from '../../hooks/useNodeKinds';
import { nodeDisplayName, withKnownKind } from '../../utils/nodeKind';

type Nav = NativeStackNavigationProp<RoutinesStackParamList>;
type Route = RouteProp<RoutinesStackParamList, 'RoutineEdit'>;

const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};
const DAY_TO_CRON: Record<DayOfWeek, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const CRON_TO_DAY: Record<number, DayOfWeek> = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };

const deviceTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

const formatMinutes = (mins: number): string => {
  if (mins >= 1440) return `${mins / 1440}d`;
  if (mins >= 60) return `${mins / 60}h`;
  return `${mins}m`;
};

const buildCron = (time: string, days: DayOfWeek[]): string => {
  const [h, m] = time.split(':');
  const hour = parseInt(h ?? '8', 10);
  const minute = parseInt(m ?? '0', 10);
  const dayField =
    days.length === 0 || days.length === 7
      ? '*'
      : days.map((d) => DAY_TO_CRON[d]).sort((a, b) => a - b).join(',');
  return `${Number.isNaN(minute) ? 0 : minute} ${Number.isNaN(hour) ? 8 : hour} * * ${dayField}`;
};

const parseCron = (cron: string | null | undefined): { time: string; days: DayOfWeek[] } => {
  const def = { time: '08:00', days: [...ALL_DAYS] };
  if (!cron) return def;
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return def;
  const minute = parseInt(parts[0], 10);
  const hour = parseInt(parts[1], 10);
  const time = `${String(Number.isNaN(hour) ? 8 : hour).padStart(2, '0')}:${String(
    Number.isNaN(minute) ? 0 : minute,
  ).padStart(2, '0')}`;
  const dayField = parts[4];
  const days: DayOfWeek[] =
    dayField === '*'
      ? [...ALL_DAYS]
      : (dayField.split(',').map((n) => CRON_TO_DAY[parseInt(n, 10) % 7]).filter(Boolean) as DayOfWeek[]);
  return { time, days };
};

// Client-side metadata bridge for core commands, so their params render as live
// dropdowns even when a node's reported catalog predates these hints. The node's
// own catalog always takes precedence (we only fill in what it didn't provide).
const CONTROL_DEVICE_ACTIONS = [
  'turn_on', 'turn_off', 'play', 'pause', 'volume_up', 'volume_down',
  'next', 'previous', 'lock', 'unlock', 'set_temperature', 'set_mode',
  'set_brightness', 'set_color',
];
const PARAM_META_OVERRIDES: Record<string, Record<string, Partial<CommandParameterEntry>>> = {
  control_device: {
    device_name: { options_source: 'devices' },
    entity_id: { options_source: 'entities' },
    action: { enum_values: CONTROL_DEVICE_ACTIONS },
  },
};

// Cap dropdown height so long lists (many commands / devices) scroll instead of
// running off-screen — react-native-paper's Menu doesn't scroll on its own.
const MENU_MAX_HEIGHT = Math.round(Dimensions.get('window').height * 0.45);

type DayPreset = 'every_day' | 'weekdays' | 'weekends' | 'custom';
const dayPresetFor = (days: DayOfWeek[]): DayPreset => {
  if (days.length === 7) return 'every_day';
  if (days.length === 5 && WEEKDAYS.every((d) => days.includes(d))) return 'weekdays';
  if (days.length === 2 && days.includes('sat') && days.includes('sun')) return 'weekends';
  return 'custom';
};

export { friendlyCommand };

/** The routine in one plain sentence, built from what the editor holds. */
export const routineSummary = (r: {
  mode: RoutineMode;
  triggerPhrases: string[];
  utterance: string;
  steps: RoutineStep[];
  responseInstruction: string;
  responseLength: ResponseLength;
  scheduled: boolean;
}): string => {
  const quoted = r.triggerPhrases.slice(0, 2).map((p) => `\u201c${p}\u201d`);
  const when = quoted.length
    ? `When you say ${quoted.join(' or ')}${r.triggerPhrases.length > 2 ? ' (or another phrase)' : ''}`
    : r.scheduled ? 'On its schedule' : 'When it runs';
  let what: string;
  if (r.mode === 'simple') {
    what = r.utterance.trim() ? `Jarvis does: ${r.utterance.trim()}` : 'Jarvis does what you describe below';
  } else {
    // Labels are often raw command names (tomorrow_weather), so they get the same cleanup.
    const named = r.steps.filter((st) => st.command || st.label).map((st) => friendlyCommand(st.label || st.command).toLowerCase());
    what = named.length ? `Jarvis will: ${named.join(', then ')}` : 'Jarvis runs the steps you add below';
    if (r.responseInstruction.trim()) what += `, then give a ${r.responseLength} reply: ${r.responseInstruction.trim()}`;
  }
  const sentence = `${when}, ${what}`.replace(/([^.!?])$/, '$1.');
  return r.scheduled && quoted.length ? `${sentence} It also runs on a schedule.` : sentence;
};

const RoutineEditScreen = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const theme = useTheme();
  const { state: authState } = useAuth();
  const householdId = authState.activeHouseholdId;
  const routineId = route.params?.routineId;
  const isEditing = !!routineId;

  // Form state
  const [mode, setMode] = useState<RoutineMode>(isEditing ? 'advanced' : 'simple');
  const [utterance, setUtterance] = useState('');
  const modeChosen = useRef(false);
  const [name, setName] = useState('');
  const [triggerInput, setTriggerInput] = useState('');
  const [triggerPhrases, setTriggerPhrases] = useState<string[]>([]);
  const [steps, setSteps] = useState<RoutineStep[]>([]);
  const [responseInstruction, setResponseInstruction] = useState('');
  const [responseLength, setResponseLength] = useState<ResponseLength>('short');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(!isEditing);

  const modesQuery = useQuery({
    queryKey: ['routineModes', householdId],
    queryFn: () => getRoutineModes(householdId!),
    enabled: !!householdId,
    retry: false,
  });
  const supportsSimple = modesQuery.data?.includes('simple') === true;
  useEffect(() => {
    if (!isEditing && !modeChosen.current && modesQuery.data && !supportsSimple) setMode('advanced');
  }, [isEditing, modesQuery.data, supportsSimple]);
  const { data: nodeDetails } = useQuery({
    queryKey: ['routineNodes', householdId],
    queryFn: () => listNodes(householdId!),
    enabled: !!householdId && mode === 'simple',
  });
  const supportsSimpleOn = (id: string) => nodeDetails?.some((n) => n.node_id === id && n.capabilities?.simple_routines === true) === true;

  // Schedule state
  const [schedEnabled, setSchedEnabled] = useState(false);
  const [schedType, setSchedType] = useState<ScheduleType>('cron');
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [cronTime, setCronTime] = useState('08:00');
  const [cronDays, setCronDays] = useState<DayOfWeek[]>([...ALL_DAYS]);
  const [targetNodeId, setTargetNodeId] = useState<string | null>(null);

  // Household nodes (catalog source + scheduled target dropdowns)
  const { data: smartHomeConfig } = useQuery({
    queryKey: ['smartHomeConfig', householdId],
    queryFn: () => getSmartHomeConfig(householdId!),
    enabled: !!householdId,
  });
  const nodes = smartHomeConfig?.nodes ?? [];
  const nodeKinds = useNodeKinds(householdId, nodes.map((n) => n.node_id));
  const primaryNodeId = smartHomeConfig?.primary_node_id || null;
  const [nodeMenuVisible, setNodeMenuVisible] = useState(false);

  // Which node provides the command catalog. Default to the primary node (the
  // reliable one) or the first ONLINE node — never just nodes[0], which may be
  // an offline/stale node and would time out the snapshot request.
  const [catalogNodeId, setCatalogNodeId] = useState<string | null>(null);
  const [catalogMenuVisible, setCatalogMenuVisible] = useState(false);
  useEffect(() => {
    if (catalogNodeId || nodes.length === 0) return;
    const primaryOnline = nodes.find((n) => n.node_id === primaryNodeId && n.online);
    const firstOnline = nodes.find((n) => n.online);
    const primaryAny = nodes.find((n) => n.node_id === primaryNodeId);
    setCatalogNodeId((primaryOnline ?? firstOnline ?? primaryAny ?? nodes[0]).node_id);
  }, [catalogNodeId, nodes, primaryNodeId]);

  // Command catalog (live, from the chosen catalog node's installed commands)
  interface CommandMeta {
    command_name: string;
    description: string;
    parameters?: CommandParameterEntry[];
  }
  const {
    snapshot: cmdSnapshot,
    state: cmdState,
    error: commandsError,
    provisionKey: provisionCatalogKey,
  } = useSettingsSnapshot({
    nodeId: catalogNodeId ?? undefined,
    enabled: mode === 'advanced' && !!authState.accessToken && !!catalogNodeId,
  });
  const commandsLoading = cmdState === 'loading';
  const commandMap: Record<string, CommandMeta> = {};
  if (cmdSnapshot) {
    for (const c of cmdSnapshot.commands.filter((cmd) => cmd.enabled !== false)) {
      // Bridge: fill in dropdown hints for core-command params that an older
      // node catalog didn't report. The node's own values always win.
      const overrides = PARAM_META_OVERRIDES[c.command_name];
      const parameters = overrides
        ? (c.parameters ?? []).map((p) => {
            const ov = overrides[p.name];
            if (!ov) return p;
            return {
              ...p,
              options_source: p.options_source ?? ov.options_source ?? null,
              enum_values: p.enum_values && p.enum_values.length ? p.enum_values : (ov.enum_values ?? p.enum_values),
            };
          })
        : c.parameters;
      commandMap[c.command_name] = {
        command_name: c.command_name,
        description: c.description,
        parameters,
      };
    }
  }
  const availableCommands = Object.keys(commandMap);
  const [commandMenuStep, setCommandMenuStep] = useState<number | null>(null);
  const [paramMenuStep, setParamMenuStep] = useState<number | null>(null);
  // The step open in the bottom sheet; the list itself shows one line per step.
  const [editingStep, setEditingStep] = useState<number | null>(null);

  // Load existing routine when editing
  useEffect(() => {
    if (!isEditing || !householdId) return;
    getRoutine(householdId, routineId!)
      .then((r) => {
        setMode(r.mode ?? 'advanced');
        setUtterance(r.utterance ?? '');
        setName(r.name);
        setTriggerPhrases(r.trigger_phrases);
        setSteps(r.steps);
        setResponseInstruction(r.response_instruction);
        setResponseLength(r.response_length);
        const s = r.schedule;
        if (s) {
          setSchedEnabled(true);
          setSchedType(s.type);
          if (s.type === 'interval') {
            setIntervalMinutes(Math.max(1, Math.round((s.interval_seconds ?? 3600) / 60)));
          } else {
            const { time, days } = parseCron(s.cron);
            setCronTime(time);
            setCronDays(days);
          }
          setTargetNodeId(s.target_node_id ?? null);
        }
        setLoaded(true);
      })
      .catch((error) => {
        console.error('[RoutineEditScreen] Failed to load routine', error);
        Alert.alert('Error', 'Could not load routine.');
        navigation.goBack();
      });
  }, [isEditing, householdId, routineId, navigation]);

  // Default the schedule target node to the household primary node.
  useEffect(() => {
    if (schedEnabled && !targetNodeId && primaryNodeId) {
      setTargetNodeId(primaryNodeId);
    }
  }, [schedEnabled, targetNodeId, primaryNodeId]);

  // --- Trigger phrases ---
  const addTriggerPhrase = useCallback(() => {
    const phrase = triggerInput.trim();
    if (phrase && !triggerPhrases.includes(phrase)) {
      setTriggerPhrases((prev) => [...prev, phrase]);
      setTriggerInput('');
    }
  }, [triggerInput, triggerPhrases]);

  const removeTriggerPhrase = useCallback((phrase: string) => {
    setTriggerPhrases((prev) => prev.filter((p) => p !== phrase));
  }, []);

  // --- Steps ---
  const addStep = useCallback(() => {
    setEditingStep(steps.length);
    setSteps((prev) => [...prev, { command: '', args: [], label: '' }]);
  }, [steps.length]);

  const updateStep = useCallback((index: number, updates: Partial<RoutineStep>) => {
    setSteps((prev) => {
      const n = [...prev];
      const updated = { ...n[index], ...updates };
      // When the command changes, auto-add its required parameters.
      if (updates.command && updates.command !== n[index].command) {
        const meta = commandMap[updates.command];
        if (meta?.parameters) {
          const existingKeys = new Set(updated.args.map((a) => a.key));
          const requiredArgs: RoutineStepArg[] = meta.parameters
            .filter((p) => p.required && !existingKeys.has(p.name))
            .map((p) => ({ key: p.name, value: p.default_value ?? '' }));
          if (requiredArgs.length > 0) updated.args = [...updated.args, ...requiredArgs];
        }
      }
      n[index] = updated;
      return n;
    });
  }, [commandMap]);

  const removeStep = useCallback((index: number) => {
    setEditingStep(null);
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addArg = useCallback((si: number) => {
    setSteps((prev) => {
      const n = [...prev];
      n[si] = { ...n[si], args: [...n[si].args, { key: '', value: '' }] };
      return n;
    });
  }, []);

  const addNamedArg = useCallback((si: number, param: CommandParameterEntry) => {
    setSteps((prev) => {
      const n = [...prev];
      n[si] = { ...n[si], args: [...n[si].args, { key: param.name, value: param.default_value ?? '' }] };
      return n;
    });
  }, []);

  const updateArg = useCallback((si: number, ai: number, u: Partial<RoutineStepArg>) => {
    setSteps((prev) => {
      const n = [...prev];
      const args = [...n[si].args];
      args[ai] = { ...args[ai], ...u };
      n[si] = { ...n[si], args };
      return n;
    });
  }, []);

  const removeArg = useCallback((si: number, ai: number) => {
    setSteps((prev) => {
      const n = [...prev];
      n[si] = { ...n[si], args: n[si].args.filter((_, i) => i !== ai) };
      return n;
    });
  }, []);

  const setDayPreset = useCallback((preset: DayPreset) => {
    if (preset === 'every_day') setCronDays([...ALL_DAYS]);
    else if (preset === 'weekdays') setCronDays([...WEEKDAYS]);
    else if (preset === 'weekends') setCronDays([...WEEKENDS]);
  }, []);

  const toggleDay = useCallback((day: DayOfWeek) => {
    setCronDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }, []);

  // --- Validation gate (makes broken steps impossible to save) ---
  const validationError = useMemo<string | null>(() => {
    if (!name.trim()) return 'Add a routine name';
    if (triggerPhrases.length === 0) return 'Add at least one trigger phrase';
    if (modesQuery.isPending) return 'Checking routine support…';
    if (utterance && !supportsSimple) return 'Check server support before saving the Simple instruction';
    if (mode === 'simple') {
      if (!supportsSimple) return modesQuery.isError ? 'Could not check Simple support. Retry above.' : 'Simple routines need a compatible server.';
      if (!utterance.trim()) return 'Add an instruction for Jarvis';
      if ([...utterance].length > 5000) return 'Keep the instruction within 5,000 characters';
    } else {
      if (steps.length === 0) return 'Add at least one step';
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        if (!s.command) return `Step ${i + 1}: choose a command`;
        const required = commandMap[s.command]?.parameters?.filter((p) => p.required) ?? [];
        for (const p of required) {
          const a = s.args.find((x) => x.key === p.name);
          if (!a || a.value.trim() === '') return `Step ${i + 1}: "${p.name}" is required`;
        }
      }
      const labels = steps.map((s) => s.label || s.command);
      if (new Set(labels).size !== labels.length) return 'Step labels must be unique';
    }
    if (schedEnabled) {
      if (!targetNodeId) return 'Schedule: choose a node to run on';
      if (mode === 'simple' && !supportsSimpleOn(targetNodeId)) return 'Schedule: choose a node with Simple routine support';
      if (schedType === 'cron' && cronDays.length === 0) return 'Schedule: pick at least one day';
      if (schedType === 'interval' && intervalMinutes <= 0) return 'Schedule: pick an interval';
    }
    return null;
  }, [name, triggerPhrases, steps, commandMap, schedEnabled, targetNodeId, schedType, cronDays, intervalMinutes, mode, utterance, supportsSimple, modesQuery.isError, modesQuery.isPending, nodeDetails]);

  const buildSchedule = (): RoutineSchedule | null => {
    if (!schedEnabled) return null;
    const tz = deviceTimezone();
    if (schedType === 'interval') {
      return { type: 'interval', interval_seconds: intervalMinutes * 60, timezone: tz, target_node_id: targetNodeId, enabled: true };
    }
    return { type: 'cron', cron: buildCron(cronTime, cronDays), timezone: tz, target_node_id: targetNodeId, enabled: true };
  };

  const handleDelete = useCallback(() => {
    if (!isEditing || !householdId || !routineId) return;
    Alert.alert('Delete', `Remove "${name || 'this routine'}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteRoutine(householdId, routineId);
            navigation.goBack();
          } catch (error) {
            console.error('[RoutineEditScreen] Failed to delete routine', error);
            Alert.alert('Error', 'Could not delete routine. Please try again.');
          }
        },
      },
    ]);
  }, [isEditing, householdId, routineId, name, navigation]);

  const handleSave = async () => {
    if (validationError || !householdId) {
      if (validationError) Alert.alert('Not ready', validationError);
      return;
    }
    const body: RoutineWrite = {
      name: name.trim(),
      trigger_phrases: triggerPhrases,
      steps: steps.map((s) => ({ ...s, label: s.label || s.command })),
      response_instruction: responseInstruction.trim(),
      response_length: responseLength,
      schedule: buildSchedule(),
    };
    if (supportsSimple) {
      body.mode = mode;
      body.utterance = utterance;
    }
    setSaving(true);
    try {
      if (isEditing) await updateRoutine(householdId, routineId!, body);
      else await createRoutine(householdId, body);
      navigation.goBack();
    } catch (error) {
      console.error('[RoutineEditScreen] Failed to save routine', error);
      Alert.alert('Error', 'Could not save routine. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // --- Steps ---

  const renderStep = ({ item, drag, getIndex }: RenderItemParams<RoutineStep>) => {
    const index = getIndex() ?? 0;
    return (
      <ScaleDecorator>
        <TouchableRipple
          testID={`routine-step-row-${index}`}
          onPress={() => setEditingStep(index)}
          onLongPress={drag}
          style={[styles.stepRow, { borderTopColor: theme.colors.outlineVariant, borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth }]}
        >
          <View style={styles.stepRowInner}>
            <IconButton icon="drag-vertical" onLongPress={drag} size={18} style={styles.dragHandle} accessibilityLabel="Drag to reorder" />
            <View style={{ flex: 1 }}>
              <Text variant="bodyLarge">{item.label || friendlyCommand(item.command)}</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
                {item.args.length > 0
                  ? item.args.filter((a) => a.key).map((a) => `${a.key}: ${a.value}`).join(' · ')
                  : item.command || 'Tap to choose a command'}
              </Text>
            </View>
            <Icon source="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
          </View>
        </TouchableRipple>
      </ScaleDecorator>
    );
  };

  /** One step's editor, in the bottom sheet. */
  const renderStepEditor = (index: number) => {
    const item = steps[index];
    if (!item) return null;
    const meta = commandMap[item.command];
    const existingKeys = new Set(item.args.map((a) => a.key));
    const optionalParams = meta?.parameters?.filter((p) => !existingKeys.has(p.name)) ?? [];
    return (
      <View testID="routine-step-sheet">
        <View style={styles.stepHeader}>
          <Text variant="titleMedium" style={{ flex: 1, fontWeight: '600' }}>Step {index + 1}</Text>
          <Button compact textColor={theme.colors.error} onPress={() => removeStep(index)} testID={`routine-step-remove-${index}`}>
            Remove
          </Button>
        </View>
      <View style={styles.stepFields}>
        {availableCommands.length > 0 ? (
          <Menu
            visible={commandMenuStep === index}
            onDismiss={() => setCommandMenuStep(null)}
            anchor={
              <Button mode="outlined" onPress={() => setCommandMenuStep(index)} compact
                style={styles.commandButton} labelStyle={styles.commandButtonLabel}
                contentStyle={{ justifyContent: 'flex-start' }}>
                {item.command || 'Select command…'}
              </Button>
            }>
            <ScrollView style={{ maxHeight: MENU_MAX_HEIGHT }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {availableCommands.map((cmd) => (
                <Menu.Item key={cmd} title={cmd}
                  onPress={() => { updateStep(index, { command: cmd, label: item.label || cmd }); setCommandMenuStep(null); }} />
              ))}
            </ScrollView>
          </Menu>
        ) : (
          <TextInput mode="flat" label={commandsLoading ? 'Command (loading…)' : 'Command'} testID={`routine-step-command-${index}`}
            value={item.command} onChangeText={(v) => updateStep(index, { command: v, label: item.label || v })}
            dense style={styles.stepInput} placeholder="e.g. get_weather" />
        )}
        <TextInput mode="flat" label="Label" value={item.label}
          onChangeText={(v) => updateStep(index, { label: v })} dense style={[styles.stepInput, { flex: 1 }]} />
      </View>
      {item.args.length > 0 && (
        <View style={styles.argsContainer}>
          {item.args.map((arg, ai) => {
            const paramMeta = meta?.parameters?.find((p) => p.name === arg.key) ?? null;
            return (
              <ParameterArgRow
                key={ai}
                arg={arg}
                paramMeta={paramMeta}
                onUpdate={(u) => updateArg(index, ai, u)}
                onRemove={() => removeArg(index, ai)}
              />
            );
          })}
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {optionalParams.length > 0 && (
          <Menu
            visible={paramMenuStep === index}
            onDismiss={() => setParamMenuStep(null)}
            anchor={
              <Button mode="text" icon="plus" compact onPress={() => setParamMenuStep(index)} labelStyle={{ fontSize: 12 }}>
                Parameter
              </Button>
            }>
            <ScrollView style={{ maxHeight: MENU_MAX_HEIGHT }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {optionalParams.map((p) => (
                <Menu.Item key={p.name}
                  title={p.description ? `${p.name} — ${p.description}` : p.name}
                  onPress={() => { addNamedArg(index, p); setParamMenuStep(null); }} />
              ))}
            </ScrollView>
          </Menu>
        )}
        <Button mode="text" icon="plus" compact onPress={() => addArg(index)} labelStyle={{ fontSize: 12 }}>
          Custom
        </Button>
      </View>
        <Button mode="contained" onPress={() => setEditingStep(null)} style={{ marginTop: 12 }} testID="routine-step-done">
          Done
        </Button>
      </View>
    );
  };

  const [intervalMenuVisible, setIntervalMenuVisible] = useState(false);
  // A node's name in the pickers: a computer's name, else its room (nodeDisplayName).
  const nodeLabel = (n: NodeOption): string => nodeDisplayName(withKnownKind(n, nodeKinds[n.node_id]), '');
  const targetNode = nodes.find((n) => n.node_id === targetNodeId);
  const catalogNode = nodes.find((n) => n.node_id === catalogNodeId);
  const targetNodeLabel =
    targetNode && nodeLabel(targetNode)
      ? `${nodeLabel(targetNode)} (${targetNodeId})`
      : targetNodeId || 'Select node…';
  const dayPreset = dayPresetFor(cronDays);

  const summary = routineSummary({
    mode,
    triggerPhrases,
    utterance,
    steps,
    responseInstruction,
    responseLength,
    scheduled: schedEnabled,
  });

  if (!loaded) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text>Loading…</Text>
      </View>
    );
  }

  return (
    // A local Portal.Host: the app-level portal sits outside the auth provider, and the
    // step sheet's parameter rows read it.
    <Portal.Host>
    <KeyboardSafeView style={styles.container} iosBehavior="padding">
      <View style={[styles.fixedHeader, { backgroundColor: theme.colors.background, borderBottomColor: theme.colors.outlineVariant }]}>
        <IconButton icon="arrow-left" onPress={() => navigation.goBack()} accessibilityLabel="Back" />
        <Text variant="titleLarge" style={{ fontWeight: 'bold', flex: 1 }} numberOfLines={1}>
          {isEditing ? name || 'Routine' : 'New routine'}
        </Text>
        {isEditing && (
          <IconButton icon="delete-outline" testID="routine-delete-button" onPress={handleDelete} accessibilityLabel="Delete routine" />
        )}
      </View>

      {/* 'handled': with the default, the first tap on a button while the keyboard is up
          only dismisses the keyboard, so Add / Add Step need two taps. */}
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" testID="routine-edit-scroll">
        <View style={styles.section}>
          <TextInput mode="flat" label="Routine name" testID="routine-name-input" value={name} onChangeText={setName} style={styles.topInput} />
        </View>

        <Surface style={[styles.summary, { backgroundColor: theme.colors.secondaryContainer }]} elevation={0} testID="routine-summary">
          <Text variant="bodyLarge" style={{ color: theme.colors.onSecondaryContainer }}>{summary}</Text>
        </Surface>
        {validationError && (
          <Text variant="bodySmall" accessibilityLiveRegion="polite" style={[styles.validation, { color: theme.colors.onSurfaceVariant }]}>
            {validationError}
          </Text>
        )}

        {/* When */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text variant="labelLarge" style={[styles.cardTitle, { color: theme.colors.primary }]}>WHEN YOU SAY</Text>
              <HelpIcon text={helpCopy.routines.triggerPhrases} size={16} />
            </View>
          <View style={styles.triggerRow}>
            <TextInput mode="flat" label="Add phrase" testID="routine-trigger-input" value={triggerInput} onChangeText={setTriggerInput}
              onSubmitEditing={addTriggerPhrase} dense style={[styles.topInput, { flex: 1 }]} />
            <Button mode="contained-tonal" testID="routine-trigger-add" onPress={addTriggerPhrase} compact style={{ marginLeft: 8, alignSelf: 'center' }}>Add</Button>
          </View>
          {triggerPhrases.length > 0 && (
            <View style={styles.chips}>
              {triggerPhrases.map((phrase) => (
                <Chip key={phrase} testID={`routine-trigger-${phrase}`} onClose={() => removeTriggerPhrase(phrase)} compact textStyle={{ fontSize: 12 }}>{phrase}</Chip>
              ))}
            </View>
          )}
            <View style={[styles.bgToggleRow, { marginTop: 12 }]}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyLarge">On a schedule</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Also run it at set times</Text>
              </View>
              <Switch value={schedEnabled} onValueChange={setSchedEnabled} testID="routine-schedule-switch" />
            </View>
          {schedEnabled && (
            <View style={styles.bgContent}>
              <SegmentedButtons
                value={schedType}
                onValueChange={(v) => setSchedType(v as ScheduleType)}
                density="small"
                buttons={[
                  { value: 'cron', label: 'At a time' },
                  { value: 'interval', label: 'Repeating' },
                ]}
              />

              {schedType === 'interval' ? (
                <View style={styles.bgRow}>
                  <Text variant="bodyMedium" style={styles.bgLabel}>Every</Text>
                  <Menu
                    visible={intervalMenuVisible}
                    onDismiss={() => setIntervalMenuVisible(false)}
                    anchor={
                      <Button mode="outlined" compact onPress={() => setIntervalMenuVisible(true)}>
                        {formatMinutes(intervalMinutes)}
                      </Button>
                    }>
                    {INTERVAL_PRESETS.map((mins) => (
                      <Menu.Item key={mins} title={formatMinutes(mins)}
                        onPress={() => { setIntervalMinutes(mins); setIntervalMenuVisible(false); }} />
                    ))}
                  </Menu>
                </View>
              ) : (
                <>
                  <View style={styles.bgRow}>
                    <Text variant="bodyMedium" style={styles.bgLabel}>Time</Text>
                    <TextInput mode="outlined" value={cronTime} onChangeText={setCronTime} dense
                      style={{ width: 100 }} placeholder="08:00" />
                  </View>
                  <SegmentedButtons
                    value={dayPreset === 'custom' ? 'custom' : dayPreset}
                    onValueChange={(v) => { if (v !== 'custom') setDayPreset(v as DayPreset); }}
                    density="small"
                    buttons={[
                      { value: 'every_day', label: 'Daily' },
                      { value: 'weekdays', label: 'Weekdays' },
                      { value: 'weekends', label: 'Weekends' },
                      { value: 'custom', label: 'Custom' },
                    ]}
                  />
                  <View style={styles.dayChips}>
                    {ALL_DAYS.map((day) => (
                      <Chip key={day} selected={cronDays.includes(day)} onPress={() => toggleDay(day)} compact showSelectedOverlay>
                        {DAY_LABELS[day]}
                      </Chip>
                    ))}
                  </View>
                </>
              )}

              {/* Target node */}
              <View style={[styles.bgRow, { marginTop: 8 }]}>
                <Text variant="bodyMedium" style={styles.bgLabel}>Run on</Text>
                <Menu
                  visible={nodeMenuVisible}
                  onDismiss={() => setNodeMenuVisible(false)}
                  anchor={
                    <Button mode="outlined" compact onPress={() => setNodeMenuVisible(true)} style={{ maxWidth: 220 }}>
                      {targetNodeLabel}
                    </Button>
                  }>
                  {nodes.map((n) => (
                    <Menu.Item key={n.node_id}
                      disabled={mode === 'simple' && !supportsSimpleOn(n.node_id)}
                      title={`${nodeLabel(n) || n.node_id}${mode === 'simple' && !supportsSimpleOn(n.node_id) ? ' — update required' : ''}`}
                      onPress={() => { setTargetNodeId(n.node_id); setNodeMenuVisible(false); }} />
                  ))}
                </Menu>
              </View>
            </View>
          )}
          </Card.Content>
        </Card>

        {/* Do */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Text variant="labelLarge" style={[styles.cardTitle, { color: theme.colors.primary, flex: 1, marginBottom: 0 }]}>JARVIS WILL</Text>
              <SegmentedButtons value={mode} onValueChange={(value) => {
                modeChosen.current = true;
                setMode(value as RoutineMode);
              }} density="small" style={{ width: 190 }} buttons={[
                { value: 'simple', label: 'Describe', testID: 'routine-mode-simple', disabled: !!modesQuery.data && !supportsSimple },
                { value: 'advanced', label: 'Steps', testID: 'routine-mode-advanced' },
              ]} />
            </View>
          {modesQuery.isPending && <Text variant="bodySmall" style={{ marginTop: 8 }}>Checking routine support…</Text>}
          {modesQuery.data && !supportsSimple && <Text variant="bodySmall" style={{ marginTop: 8 }}>Update the server to use Simple routines.</Text>}
          {modesQuery.isError && <View style={{ marginTop: 8 }}>
            <Text variant="bodySmall">Could not check Simple routine support. Advanced is still available.</Text>
            <Button compact onPress={() => modesQuery.refetch()}>Retry</Button>
          </View>}
            {mode === 'simple' ? (
              <>
            <TextInput mode="flat" label="What should Jarvis do?" testID="routine-utterance-input"
              value={utterance} onChangeText={setUtterance} multiline numberOfLines={5}
              placeholder="Turn on the living room lights and play Room Lights."
              style={[styles.topInput, { minHeight: 128 }]} contentStyle={{ textAlignVertical: 'top' }} />
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Write what you'd normally ask Jarvis. It will interpret this each time.
            </Text>
              </>
            ) : (
              <>
          {nodes.length > 0 && (
            <View style={styles.catalogRow}>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Commands from</Text>
              <Menu
                visible={catalogMenuVisible}
                onDismiss={() => setCatalogMenuVisible(false)}
                anchor={
                  <Button mode="outlined" compact icon="cellphone-link" onPress={() => setCatalogMenuVisible(true)} labelStyle={{ fontSize: 12 }}>
                    {commandsLoading
                      ? 'Loading…'
                      : (catalogNode && nodeLabel(catalogNode)) || 'Select node'}
                  </Button>
                }>
                {nodes.map((n) => (
                  <Menu.Item key={n.node_id}
                    leadingIcon={({ size, color }) => (
                      <NodeKindIcon node={nodeKinds[n.node_id]} size={size} color={color} />
                    )}
                    title={`${nodeLabel(n) || n.node_id}${n.online ? '' : ' (offline)'}`}
                    onPress={() => { setCatalogNodeId(n.node_id); setCatalogMenuVisible(false); }} />
                ))}
              </Menu>
            </View>
          )}
          {commandsError && cmdState === 'needs_k2' && (
            <View style={{ marginBottom: 8 }} testID="routine-catalog-needs-k2">
              <Text variant="bodySmall" style={{ color: theme.colors.error }}>
                This phone has no key for that node, so its commands can’t be listed. Set one up, or pick another node.
              </Text>
              <Button mode="outlined" icon="key-variant" compact onPress={provisionCatalogKey}
                style={{ alignSelf: 'flex-start', marginTop: 6 }}>
                Set up encryption key
              </Button>
            </View>
          )}
          {commandsError && cmdState !== 'needs_k2' && (
            <View style={{ marginBottom: 8 }}>
              <Text variant="bodySmall" style={{ color: theme.colors.error }}>
                {commandsError} Pick a different node with “Commands from” above.
              </Text>
            </View>
          )}
                <DraggableFlatList data={steps} keyExtractor={(_, i) => `step-${i}`} renderItem={renderStep}
                  onDragEnd={({ data }) => setSteps(data)} scrollEnabled={false} />
                <Button mode="text" icon="plus" testID="routine-add-step" onPress={addStep} compact style={{ alignSelf: 'flex-start' }}>Add step</Button>
              </>
            )}
          </Card.Content>
        </Card>

        {/* Then say */}
        {mode !== 'simple' && (
          <Card style={styles.card} mode="outlined">
            <Card.Content>
              <Text variant="labelLarge" style={[styles.cardTitle, { color: theme.colors.primary }]}>THEN SAY</Text>
          <TextInput mode="flat" label="How should the assistant respond?" value={responseInstruction}
            onChangeText={setResponseInstruction} multiline numberOfLines={2}
            placeholder="e.g. Give a cheerful morning briefing." style={styles.topInput} />
          <SegmentedButtons
            value={responseLength}
            onValueChange={(v) => setResponseLength(v as ResponseLength)}
            density="small"
            buttons={[
              { value: 'short', label: 'Short' },
              { value: 'medium', label: 'Medium' },
              { value: 'long', label: 'Long' },
            ]}
          />
            </Card.Content>
          </Card>
        )}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.colors.background, borderTopColor: theme.colors.outlineVariant }]}>
        <Button mode="contained" testID="routine-save-button" onPress={handleSave} disabled={!!validationError || saving} loading={saving}>
          {isEditing ? 'Save' : 'Create routine'}
        </Button>
      </View>

      <Portal>
        <Modal
          visible={editingStep !== null}
          onDismiss={() => setEditingStep(null)}
          contentContainerStyle={[styles.sheet, { backgroundColor: theme.colors.surface }]}
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            {editingStep !== null && renderStepEditor(editingStep)}
          </ScrollView>
        </Modal>
      </Portal>
    </KeyboardSafeView>
    </Portal.Host>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48 },
  fixedHeader: {
    flexDirection: 'row', alignItems: 'center', paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, zIndex: 1,
  },
  scroll: { paddingBottom: 24, paddingTop: 8 },
  footer: { paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  summary: { marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 14 },
  validation: { marginHorizontal: 20, marginTop: -4, marginBottom: 10 },
  card: { marginHorizontal: 16, marginBottom: 12 },
  cardTitle: { fontWeight: '700', letterSpacing: 0.6, marginBottom: 8 },
  stepRow: { paddingVertical: 4 },
  stepRowInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sheet: { marginTop: 'auto', padding: 16, paddingBottom: 28, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '85%' },
  section: { paddingHorizontal: 16, marginBottom: 20 },
  sectionTitle: { fontWeight: '600', marginBottom: 8 },
  topInput: { marginBottom: 4 },
  triggerRow: { flexDirection: 'row', alignItems: 'flex-end' },
  catalogRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  dragHandle: { margin: 0, marginRight: 4 },
  stepLabel: { flex: 1, fontWeight: '600', fontSize: 13 },
  removeBtn: { margin: 0 },
  stepFields: { gap: 4, marginBottom: 4 },
  stepInput: { backgroundColor: 'transparent', fontSize: 13, paddingHorizontal: 4 },
  commandButton: { alignSelf: 'flex-start' },
  commandButtonLabel: { fontSize: 13 },
  argsContainer: { gap: 2, marginLeft: 4 },
  bgToggleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  bgContent: { gap: 8 },
  bgRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bgLabel: { fontWeight: '500' },
  dayChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
});

export default RoutineEditScreen;
