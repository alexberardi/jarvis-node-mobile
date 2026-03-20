import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
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
  Chip,
  IconButton,
  Menu,
  SegmentedButtons,
  Switch,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import { listNodes, NodeInfo } from '../../api/nodeApi';
import {
  pollSettingsResult,
  requestSettingsSnapshot,
} from '../../api/nodeSettingsApi';
import { useAuth } from '../../auth/AuthContext';
import ParameterArgRow from '../../components/ParameterArgRow';
import { RoutinesStackParamList } from '../../navigation/types';
import {
  getRoutine,
  loadRoutines,
  saveRoutine,
  slugify,
} from '../../services/routineStorageService';
import {
  decryptSettingsSnapshot,
} from '../../services/settingsDecryptService';
import type { CommandParameterEntry } from '../../services/settingsDecryptService';
import type {
  DayOfWeek,
  ResponseLength,
  Routine,
  RoutineBackground,
  RoutineStep,
  RoutineStepArg,
  ScheduleType,
  SummaryStyle,
} from '../../types/Routine';
import {
  ALL_DAYS,
  DEFAULT_BACKGROUND,
  INTERVAL_PRESETS,
  TTL_PRESETS,
  WEEKDAYS,
  WEEKENDS,
} from '../../types/Routine';

type Nav = NativeStackNavigationProp<RoutinesStackParamList>;
type Route = RouteProp<RoutinesStackParamList, 'RoutineEdit'>;

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 20;

const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

type DayPreset = 'every_day' | 'weekdays' | 'weekends' | 'custom';

const getDayPreset = (days: DayOfWeek[]): DayPreset => {
  if (days.length === 7) return 'every_day';
  if (days.length === 5 && WEEKDAYS.every((d) => days.includes(d))) return 'weekdays';
  if (days.length === 2 && days.includes('sat') && days.includes('sun')) return 'weekends';
  return 'custom';
};

const formatMinutes = (mins: number): string => {
  if (mins >= 1440) return `${mins / 1440}d`;
  if (mins >= 60) return `${mins / 60}h`;
  return `${mins}m`;
};

const RoutineEditScreen = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const theme = useTheme();
  const { state: authState } = useAuth();
  const isEditing = !!route.params?.routineId;

  // Form state
  const [name, setName] = useState('');
  const [triggerInput, setTriggerInput] = useState('');
  const [triggerPhrases, setTriggerPhrases] = useState<string[]>([]);
  const [steps, setSteps] = useState<RoutineStep[]>([]);
  const [responseInstruction, setResponseInstruction] = useState('');
  const [responseLength, setResponseLength] = useState<ResponseLength>('short');
  const [background, setBackground] = useState<RoutineBackground | null>(null);

  // Command metadata from node settings snapshot
  interface CommandMeta {
    command_name: string;
    description: string;
    parameters?: CommandParameterEntry[];
  }
  const [commandMap, setCommandMap] = useState<Record<string, CommandMeta>>({});
  const availableCommands = Object.keys(commandMap);
  const [commandsLoading, setCommandsLoading] = useState(false);
  const [commandMenuStep, setCommandMenuStep] = useState<number | null>(null);
  const [paramMenuStep, setParamMenuStep] = useState<number | null>(null);
  const commandsLoaded = useRef(false);

  // Load existing routine if editing
  useEffect(() => {
    if (route.params?.routineId) {
      getRoutine(route.params.routineId).then((r) => {
        if (r) {
          setName(r.name);
          setTriggerPhrases(r.trigger_phrases);
          setSteps(r.steps);
          setResponseInstruction(r.response_instruction);
          setResponseLength(r.response_length);
          setBackground(r.background);
        }
      });
    }
  }, [route.params?.routineId]);

  // Load available commands from a node's settings snapshot
  useEffect(() => {
    if (commandsLoaded.current || !authState.accessToken) return;
    commandsLoaded.current = true;

    const fetchCommands = async () => {
      setCommandsLoading(true);
      try {
        const nodes = await listNodes();
        if (nodes.length === 0) { setCommandsLoading(false); return; }
        const node: NodeInfo = nodes[0];
        const { request_id } = await requestSettingsSnapshot(node.node_id);
        let attempts = 0;
        const poll = async () => {
          if (attempts >= POLL_MAX_ATTEMPTS) { setCommandsLoading(false); return; }
          attempts++;
          try {
            const result = await pollSettingsResult(node.node_id, request_id);
            if (result.status === 'fulfilled' && result.snapshot) {
              const snapshot = await decryptSettingsSnapshot(
                node.node_id, result.snapshot.ciphertext, result.snapshot.nonce, result.snapshot.tag,
              );
              const map: Record<string, CommandMeta> = {};
              for (const c of snapshot.commands.filter((cmd) => cmd.enabled !== false)) {
                map[c.command_name] = {
                  command_name: c.command_name,
                  description: c.description,
                  parameters: c.parameters,
                };
              }
              setCommandMap(map);
              setCommandsLoading(false);
            } else {
              setTimeout(poll, POLL_INTERVAL_MS);
            }
          } catch { setCommandsLoading(false); }
        };
        poll();
      } catch { setCommandsLoading(false); }
    };
    fetchCommands();
  }, [authState.accessToken]);

  const slug = slugify(name);

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
    setSteps((prev) => [...prev, { command: '', args: [], label: '' }]);
  }, []);

  const updateStep = useCallback((index: number, updates: Partial<RoutineStep>) => {
    setSteps((prev) => {
      const n = [...prev];
      const updated = { ...n[index], ...updates };

      // When command changes, auto-add required parameters that aren't already present
      if (updates.command && updates.command !== n[index].command) {
        const meta = commandMap[updates.command];
        if (meta?.parameters) {
          const existingKeys = new Set(updated.args.map((a) => a.key));
          const requiredArgs: RoutineStepArg[] = meta.parameters
            .filter((p) => p.required && !existingKeys.has(p.name))
            .map((p) => ({ key: p.name, value: p.default_value ?? '' }));
          if (requiredArgs.length > 0) {
            updated.args = [...updated.args, ...requiredArgs];
          }
        }
      }

      n[index] = updated;
      return n;
    });
  }, [commandMap]);

  const removeStep = useCallback((index: number) => {
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
      const n = [...prev]; const args = [...n[si].args];
      args[ai] = { ...args[ai], ...u }; n[si] = { ...n[si], args };
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

  // --- Background helpers ---
  const updateBg = useCallback((updates: Partial<RoutineBackground>) => {
    setBackground((prev) => prev ? { ...prev, ...updates } : null);
  }, []);

  const toggleBackground = useCallback(() => {
    setBackground((prev) => prev ? null : { ...DEFAULT_BACKGROUND });
  }, []);

  const dayPreset = background ? getDayPreset(background.days) : 'every_day';
  const [showCustomDays, setShowCustomDays] = useState(false);

  const setDayPreset = useCallback((preset: DayPreset) => {
    if (preset === 'every_day') { updateBg({ days: [...ALL_DAYS] }); setShowCustomDays(false); }
    else if (preset === 'weekdays') { updateBg({ days: [...WEEKDAYS] }); setShowCustomDays(false); }
    else if (preset === 'weekends') { updateBg({ days: [...WEEKENDS] }); setShowCustomDays(false); }
    else { setShowCustomDays(true); }
  }, [updateBg]);

  const toggleDay = useCallback((day: DayOfWeek) => {
    if (!background) return;
    const days = background.days.includes(day)
      ? background.days.filter((d) => d !== day)
      : [...background.days, day];
    if (days.length > 0) updateBg({ days });
  }, [background, updateBg]);

  // --- Validation ---
  const validate = async (): Promise<string | null> => {
    if (!name.trim()) return 'Name is required.';
    if (!slug) return 'Name must contain at least one alphanumeric character.';

    if (!isEditing || route.params?.routineId !== slug) {
      const existing = await loadRoutines();
      if (existing.some((r) => r.id === slug && r.id !== route.params?.routineId)) {
        return `A routine with the ID "${slug}" already exists.`;
      }
    }

    if (triggerPhrases.length === 0) return 'At least one trigger phrase is required.';
    if (steps.length === 0) return 'At least one step is required.';
    for (let i = 0; i < steps.length; i++) {
      if (!steps[i].command) return `Step ${i + 1}: command is required.`;
    }
    const labels = steps.map((s) => s.label || s.command);
    if (new Set(labels).size !== labels.length) return 'Step labels must be unique.';

    if (background) {
      if (background.schedule_type === 'cron' && background.days.length === 0) {
        return 'Background: at least one day must be selected.';
      }
    }

    return null;
  };

  const handleSave = async () => {
    const error = await validate();
    if (error) { Alert.alert('Validation Error', error); return; }

    const routine: Routine = {
      id: isEditing ? route.params!.routineId! : slug,
      name: name.trim(),
      trigger_phrases: triggerPhrases,
      steps: steps.map((s) => ({ ...s, label: s.label || s.command })),
      response_instruction: responseInstruction.trim(),
      response_length: responseLength,
      background,
    };

    await saveRoutine(routine);
    navigation.navigate('RoutineNodePicker', { routineId: routine.id });
  };

  // --- Step card styling ---
  const cardBg = theme.dark ? `${theme.colors.primary}14` : `${theme.colors.primary}08`;
  const cardBorder = theme.dark ? `${theme.colors.primary}30` : `${theme.colors.outline}40`;

  const renderStep = ({ item, drag, getIndex }: RenderItemParams<RoutineStep>) => {
    const index = getIndex() ?? 0;
    return (
      <ScaleDecorator>
        <View style={[styles.stepCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.stepHeader}>
            <IconButton icon="menu" onLongPress={drag} size={18} style={styles.dragHandle} />
            <Text variant="labelLarge" style={[styles.stepLabel, { color: theme.colors.primary }]}>
              Step {index + 1}
            </Text>
            <IconButton icon="close" size={16} onPress={() => removeStep(index)} style={styles.removeBtn} />
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
                    {item.command || 'Select command...'}
                  </Button>
                }>
                {availableCommands.map((cmd) => (
                  <Menu.Item key={cmd} title={cmd}
                    onPress={() => { updateStep(index, { command: cmd, label: item.label || cmd }); setCommandMenuStep(null); }} />
                ))}
              </Menu>
            ) : (
              <TextInput mode="flat" label={commandsLoading ? 'Command (loading...)' : 'Command'}
                value={item.command} onChangeText={(v) => updateStep(index, { command: v, label: item.label || v })}
                dense style={styles.stepInput} placeholder="e.g. get_weather" />
            )}
            <TextInput mode="flat" label="Label" value={item.label}
              onChangeText={(v) => updateStep(index, { label: v })} dense style={[styles.stepInput, { flex: 1 }]} />
          </View>
          {item.args.length > 0 && (
            <View style={styles.argsContainer}>
              {item.args.map((arg, ai) => {
                const meta = commandMap[item.command];
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
          {(() => {
            const meta = commandMap[item.command];
            const hasParams = meta?.parameters && meta.parameters.length > 0;
            if (!hasParams) {
              return (
                <Button mode="text" icon="plus" compact onPress={() => addArg(index)} labelStyle={{ fontSize: 12 }}>
                  Arg
                </Button>
              );
            }
            const existingKeys = new Set(item.args.map((a) => a.key));
            const optionalParams = meta.parameters!.filter((p) => !existingKeys.has(p.name));
            return (
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {optionalParams.length > 0 && (
                  <Menu
                    visible={paramMenuStep === index}
                    onDismiss={() => setParamMenuStep(null)}
                    anchor={
                      <Button mode="text" icon="plus" compact onPress={() => setParamMenuStep(index)} labelStyle={{ fontSize: 12 }}>
                        Parameter
                      </Button>
                    }
                  >
                    {optionalParams.map((p) => (
                      <Menu.Item
                        key={p.name}
                        title={p.description ? `${p.name} — ${p.description}` : p.name}
                        onPress={() => { addNamedArg(index, p); setParamMenuStep(null); }}
                      />
                    ))}
                  </Menu>
                )}
                <Button mode="text" icon="plus" compact onPress={() => addArg(index)} labelStyle={{ fontSize: 12 }}>
                  Custom
                </Button>
              </View>
            );
          })()}
        </View>
      </ScaleDecorator>
    );
  };

  // --- Picker menu helpers ---
  const [intervalMenuVisible, setIntervalMenuVisible] = useState(false);
  const [ttlMenuVisible, setTtlMenuVisible] = useState(false);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Fixed header */}
      <View style={[styles.fixedHeader, { backgroundColor: theme.colors.background, borderBottomColor: theme.colors.outlineVariant }]}>
        <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
        <Text variant="headlineSmall" style={{ fontWeight: 'bold', flex: 1 }}>
          {isEditing ? 'Edit Routine' : 'New Routine'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Name */}
        <View style={styles.section}>
          <TextInput mode="flat" label="Routine Name" value={name} onChangeText={setName} style={styles.topInput} />
          {slug ? (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, paddingHorizontal: 4, marginTop: 2 }}>
              ID: {slug}
            </Text>
          ) : null}
        </View>

        {/* Trigger Phrases */}
        <View style={styles.section}>
          <Text variant="titleSmall" style={[styles.sectionTitle, { color: theme.colors.primary }]}>Trigger Phrases</Text>
          <View style={styles.triggerRow}>
            <TextInput mode="flat" label="Add phrase" value={triggerInput} onChangeText={setTriggerInput}
              onSubmitEditing={addTriggerPhrase} dense style={[styles.topInput, { flex: 1 }]} />
            <Button mode="contained-tonal" onPress={addTriggerPhrase} compact style={{ marginLeft: 8, alignSelf: 'center' }}>Add</Button>
          </View>
          {triggerPhrases.length > 0 && (
            <View style={styles.chips}>
              {triggerPhrases.map((phrase) => (
                <Chip key={phrase} onClose={() => removeTriggerPhrase(phrase)} compact textStyle={{ fontSize: 12 }}>{phrase}</Chip>
              ))}
            </View>
          )}
        </View>

        {/* Steps */}
        <View style={styles.section}>
          <Text variant="titleSmall" style={[styles.sectionTitle, { color: theme.colors.primary }]}>Steps</Text>
          <DraggableFlatList data={steps} keyExtractor={(_, i) => `step-${i}`} renderItem={renderStep}
            onDragEnd={({ data }) => setSteps(data)} scrollEnabled={false} />
          <Button mode="outlined" icon="plus" onPress={addStep} compact style={{ alignSelf: 'flex-start' }}>Add Step</Button>
        </View>

        {/* Response Instruction */}
        <View style={styles.section}>
          <Text variant="titleSmall" style={[styles.sectionTitle, { color: theme.colors.primary }]}>Response Instruction</Text>
          <TextInput mode="flat" label="How should the assistant respond?" value={responseInstruction}
            onChangeText={setResponseInstruction} multiline numberOfLines={2}
            placeholder="e.g. Give a cheerful morning briefing." style={styles.topInput} />
        </View>

        {/* Response Length */}
        <View style={styles.section}>
          <Text variant="titleSmall" style={[styles.sectionTitle, { color: theme.colors.primary }]}>Response Length</Text>
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
        </View>

        {/* Background Section */}
        <View style={styles.section}>
          <View style={styles.bgToggleRow}>
            <Text variant="titleSmall" style={[styles.sectionTitle, { color: theme.colors.primary, flex: 1, marginBottom: 0 }]}>
              Run in Background
            </Text>
            <Switch value={background !== null} onValueChange={toggleBackground} />
          </View>

          {background && (
            <View style={styles.bgContent}>
              {/* Schedule Type */}
              <SegmentedButtons
                value={background.schedule_type}
                onValueChange={(v) => updateBg({ schedule_type: v as ScheduleType })}
                density="small"
                buttons={[
                  { value: 'interval', label: 'Repeating' },
                  { value: 'cron', label: 'Scheduled' },
                ]}
              />

              {background.schedule_type === 'interval' ? (
                <>
                  {/* Interval picker */}
                  <View style={styles.bgRow}>
                    <Text variant="bodyMedium" style={styles.bgLabel}>Check every</Text>
                    <Menu
                      visible={intervalMenuVisible}
                      onDismiss={() => setIntervalMenuVisible(false)}
                      anchor={
                        <Button mode="outlined" compact onPress={() => setIntervalMenuVisible(true)}>
                          {formatMinutes(background.interval_minutes)}
                        </Button>
                      }>
                      {INTERVAL_PRESETS.map((mins) => (
                        <Menu.Item key={mins} title={formatMinutes(mins)}
                          onPress={() => { updateBg({ interval_minutes: mins }); setIntervalMenuVisible(false); }} />
                      ))}
                    </Menu>
                  </View>
                  {/* Run on startup */}
                  <View style={styles.bgRow}>
                    <Text variant="bodyMedium" style={styles.bgLabel}>Run on startup</Text>
                    <Switch value={background.run_on_startup} onValueChange={(v) => updateBg({ run_on_startup: v })} />
                  </View>
                </>
              ) : (
                <>
                  {/* Day presets */}
                  <View style={styles.bgRow}>
                    <Text variant="bodyMedium" style={styles.bgLabel}>Days</Text>
                  </View>
                  <SegmentedButtons
                    value={showCustomDays ? 'custom' : dayPreset}
                    onValueChange={(v) => setDayPreset(v as DayPreset)}
                    density="small"
                    buttons={[
                      { value: 'every_day', label: 'Every day' },
                      { value: 'weekdays', label: 'Weekdays' },
                      { value: 'weekends', label: 'Weekends' },
                      { value: 'custom', label: 'Custom' },
                    ]}
                  />
                  {(showCustomDays || dayPreset === 'custom') && (
                    <View style={styles.dayChips}>
                      {ALL_DAYS.map((day) => (
                        <Chip
                          key={day}
                          selected={background.days.includes(day)}
                          onPress={() => toggleDay(day)}
                          compact
                          showSelectedOverlay
                        >
                          {DAY_LABELS[day]}
                        </Chip>
                      ))}
                    </View>
                  )}
                  {/* Time */}
                  <View style={styles.bgRow}>
                    <Text variant="bodyMedium" style={styles.bgLabel}>Time</Text>
                    <TextInput
                      mode="outlined"
                      value={background.time}
                      onChangeText={(v) => updateBg({ time: v })}
                      dense
                      style={{ width: 100 }}
                      placeholder="08:00"
                    />
                  </View>
                </>
              )}

              {/* Summary style */}
              <View style={{ marginTop: 8 }}>
                <Text variant="bodyMedium" style={styles.bgLabel}>Summary style</Text>
                <SegmentedButtons
                  value={background.summary_style}
                  onValueChange={(v) => updateBg({ summary_style: v as SummaryStyle })}
                  density="small"
                  buttons={[
                    { value: 'compact', label: 'Compact' },
                    { value: 'detailed', label: 'Detailed' },
                  ]}
                />
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                  Controls how alerts sound when you ask "what's up"
                </Text>
              </View>

              {/* Priority */}
              <View style={{ marginTop: 12 }}>
                <Text variant="bodyMedium" style={styles.bgLabel}>Priority</Text>
                <SegmentedButtons
                  value={String(background.alert_priority)}
                  onValueChange={(v) => updateBg({ alert_priority: Number(v) as 1 | 2 | 3 })}
                  density="small"
                  buttons={[
                    { value: '1', label: 'Low' },
                    { value: '2', label: 'Medium' },
                    { value: '3', label: 'High' },
                  ]}
                />
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                  Higher priority alerts are delivered first
                </Text>
              </View>

              {/* TTL */}
              <View style={[styles.bgRow, { marginTop: 12 }]}>
                <Text variant="bodyMedium" style={styles.bgLabel}>Alert expires after</Text>
                <Menu
                  visible={ttlMenuVisible}
                  onDismiss={() => setTtlMenuVisible(false)}
                  anchor={
                    <Button mode="outlined" compact onPress={() => setTtlMenuVisible(true)}>
                      {formatMinutes(background.alert_ttl_minutes)}
                    </Button>
                  }>
                  {TTL_PRESETS.map((mins) => (
                    <Menu.Item key={mins} title={formatMinutes(mins)}
                      onPress={() => { updateBg({ alert_ttl_minutes: mins }); setTtlMenuVisible(false); }} />
                  ))}
                </Menu>
              </View>
            </View>
          )}
        </View>

        {/* Save */}
        <View style={styles.section}>
          <Button mode="contained" onPress={handleSave}>Save & Choose Nodes</Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48 },
  fixedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 1,
  },
  scroll: { paddingBottom: 48, paddingTop: 8 },
  section: { paddingHorizontal: 16, marginBottom: 20 },
  sectionTitle: { fontWeight: '600', marginBottom: 8 },
  topInput: { marginBottom: 4 },
  triggerRow: { flexDirection: 'row', alignItems: 'flex-end' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },

  // Step cards
  stepCard: { borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 10 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  dragHandle: { margin: 0, marginRight: 4 },
  stepLabel: { flex: 1, fontWeight: '600', fontSize: 13 },
  removeBtn: { margin: 0 },
  stepFields: { gap: 4, marginBottom: 4 },
  stepInput: { backgroundColor: 'transparent', fontSize: 13, paddingHorizontal: 4 },
  commandButton: { alignSelf: 'flex-start' },
  commandButtonLabel: { fontSize: 13 },
  argsContainer: { gap: 2, marginLeft: 4 },
  argRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  argInput: { flex: 1 },

  // Background section
  bgToggleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  bgContent: { gap: 8 },
  bgRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bgLabel: { fontWeight: '500' },
  dayChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
});

export default RoutineEditScreen;
