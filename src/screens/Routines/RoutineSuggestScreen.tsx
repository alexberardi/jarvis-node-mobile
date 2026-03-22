import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  IconButton,
  Menu,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import { fetchNodeTools } from '../../api/chatApi';
import { listNodes, NodeInfo } from '../../api/nodeApi';
import {
  generateRoutines,
  GeneratedRoutine,
  getRoutineModels,
  RoutineModelInfo,
} from '../../api/pantryApi';
import { RoutinesStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RoutinesStackParamList>;
type ScreenState = 'config' | 'loading' | 'results';
type ProviderFilter = 'anthropic' | 'openai';

import { ROUTINE_API_KEY as SECURE_STORE_KEY } from '../../config/storageKeys';

const RoutineSuggestScreen = () => {
  const navigation = useNavigation<Nav>();
  const theme = useTheme();

  const [screenState, setScreenState] = useState<ScreenState>('config');

  // Config state
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeMenuVisible, setNodeMenuVisible] = useState(false);
  const [userPrompt, setUserPrompt] = useState('');
  const [models, setModels] = useState<RoutineModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState('haiku');
  const [modelMenuVisible, setModelMenuVisible] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('anthropic');

  // Results state
  const [results, setResults] = useState<GeneratedRoutine[]>([]);
  const [explanation, setExplanation] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [initError, setInitError] = useState<string | null>(null);

  // Load nodes + models on mount
  useEffect(() => {
    const init = async () => {
      const errors: string[] = [];

      try {
        const nodeList = await listNodes();
        setNodes(nodeList);
        if (nodeList.length > 0) setSelectedNodeId(nodeList[0].node_id);
      } catch (err) {
        console.error('[RoutineSuggestScreen] Failed to load nodes', err);
        errors.push('nodes');
      }

      try {
        const modelList = await getRoutineModels();
        setModels(modelList);
      } catch (err) {
        console.error('[RoutineSuggestScreen] Failed to load models', err);
        errors.push('models');
      }

      try {
        const cached = await SecureStore.getItemAsync(SECURE_STORE_KEY);
        if (cached) setApiKey(cached);
      } catch {
        // non-critical
      }

      if (errors.length > 0) {
        setInitError(`Could not load ${errors.join(' and ')}. Check your connection.`);
      }
    };
    init();
  }, []);

  const filteredModels = models.filter((m) => m.provider === providerFilter);

  // When provider changes, select first available model of that provider
  useEffect(() => {
    const available = models.filter((m) => m.provider === providerFilter);
    if (available.length > 0 && !available.find((m) => m.id === selectedModel)) {
      setSelectedModel(available[0].id);
    }
  }, [providerFilter, models, selectedModel]);

  const handleGenerate = async () => {
    if (!selectedNodeId || !apiKey.trim()) return;

    setScreenState('loading');
    setError(null);

    try {
      // Cache API key
      await SecureStore.setItemAsync(SECURE_STORE_KEY, apiKey.trim());

      // Fetch node's available commands
      const tools = await fetchNodeTools(selectedNodeId);

      if (tools.available_commands.length === 0) {
        setError(
          'No commands found on this node. Make sure the node is online and has commands installed.',
        );
        setScreenState('config');
        return;
      }

      const result = await generateRoutines({
        available_commands: tools.available_commands,
        model: selectedModel,
        llm_api_key: apiKey.trim(),
        user_prompt: userPrompt.trim() || undefined,
      });

      setResults(result.routines);
      setExplanation(result.explanation);
      setWarnings(result.validation_warnings);
      setScreenState('results');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      setError(err.response?.data?.detail || err.message || 'Generation failed');
      setScreenState('config');
    }
  };

  const handleUseRoutine = (routine: GeneratedRoutine) => {
    // Ensure background is explicitly null for the Routine type
    const routineForEdit = {
      ...routine,
      background: routine.background ?? null,
    };
    navigation.navigate('RoutineEdit', {
      routineData: JSON.stringify(routineForEdit),
    });
  };

  const selectedNode = nodes.find((n) => n.node_id === selectedNodeId);
  const nodeLabel = selectedNode
    ? `${selectedNode.room || 'Unknown'} — ${selectedNode.user || selectedNode.node_id.slice(0, 8)}`
    : 'Select a node...';

  const selectedModelInfo = models.find((m) => m.id === selectedModel);
  const modelLabel = selectedModelInfo
    ? `${selectedModelInfo.display_name} (${selectedModelInfo.estimated_cost})`
    : selectedModel;

  const canGenerate = selectedNodeId !== null && apiKey.trim().length > 0;

  // ─── Config UI ──────────────────────────────────────────────────────────────

  const renderConfig = () => (
    <ScrollView contentContainerStyle={styles.scroll}>
      {/* Node selector */}
      <View style={styles.section}>
        <Text variant="titleSmall" style={[styles.sectionTitle, { color: theme.colors.primary }]}>
          Node
        </Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
          The AI will generate routines based on the commands available on this node.
        </Text>
        <Menu
          visible={nodeMenuVisible}
          onDismiss={() => setNodeMenuVisible(false)}
          anchor={
            <Button
              mode="outlined"
              onPress={() => setNodeMenuVisible(true)}
              contentStyle={{ justifyContent: 'flex-start' }}
              style={styles.dropdown}
            >
              {nodeLabel}
            </Button>
          }
        >
          {nodes.map((node) => (
            <Menu.Item
              key={node.node_id}
              title={`${node.room || 'Unknown'} — ${node.user || node.node_id.slice(0, 8)}`}
              onPress={() => {
                setSelectedNodeId(node.node_id);
                setNodeMenuVisible(false);
              }}
            />
          ))}
        </Menu>
      </View>

      {/* Optional prompt */}
      <View style={styles.section}>
        <Text variant="titleSmall" style={[styles.sectionTitle, { color: theme.colors.primary }]}>
          What kind of routines?
        </Text>
        <TextInput
          mode="flat"
          label="Optional prompt"
          value={userPrompt}
          onChangeText={setUserPrompt}
          multiline
          numberOfLines={2}
          placeholder='e.g. "Morning briefing with weather and news"'
          style={styles.topInput}
        />
      </View>

      {/* Provider toggle */}
      <View style={styles.section}>
        <Text variant="titleSmall" style={[styles.sectionTitle, { color: theme.colors.primary }]}>
          LLM Provider
        </Text>
        <SegmentedButtons
          value={providerFilter}
          onValueChange={(v) => setProviderFilter(v as ProviderFilter)}
          density="small"
          buttons={[
            { value: 'anthropic', label: 'Anthropic' },
            { value: 'openai', label: 'OpenAI' },
          ]}
        />
      </View>

      {/* Model dropdown */}
      <View style={styles.section}>
        <Text variant="titleSmall" style={[styles.sectionTitle, { color: theme.colors.primary }]}>
          Model
        </Text>
        <Menu
          visible={modelMenuVisible}
          onDismiss={() => setModelMenuVisible(false)}
          anchor={
            <Button
              mode="outlined"
              onPress={() => setModelMenuVisible(true)}
              contentStyle={{ justifyContent: 'flex-start' }}
              style={styles.dropdown}
            >
              {modelLabel}
            </Button>
          }
        >
          {filteredModels.map((model) => (
            <Menu.Item
              key={model.id}
              title={`${model.display_name} (${model.estimated_cost})`}
              onPress={() => {
                setSelectedModel(model.id);
                setModelMenuVisible(false);
              }}
            />
          ))}
          {filteredModels.length === 0 && (
            <Menu.Item title="No models available" disabled onPress={() => {}} />
          )}
        </Menu>
      </View>

      {/* API key */}
      <View style={styles.section}>
        <Text variant="titleSmall" style={[styles.sectionTitle, { color: theme.colors.primary }]}>
          API Key
        </Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
          Your key is sent directly to the LLM provider and cached locally. It is never stored on Jarvis servers.
        </Text>
        <TextInput
          mode="flat"
          label="API Key"
          value={apiKey}
          onChangeText={setApiKey}
          secureTextEntry
          style={styles.topInput}
          placeholder={providerFilter === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
        />
      </View>

      {/* Init / generation error */}
      {initError && (
        <View style={styles.section}>
          <Card style={[styles.errorCard, { backgroundColor: `${theme.colors.error}15` }]}>
            <Card.Content>
              <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
                {initError}
              </Text>
            </Card.Content>
          </Card>
        </View>
      )}
      {error && (
        <View style={styles.section}>
          <Card style={[styles.errorCard, { backgroundColor: `${theme.colors.error}15` }]}>
            <Card.Content>
              <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
                {error}
              </Text>
            </Card.Content>
          </Card>
        </View>
      )}

      {/* Generate button */}
      <View style={styles.section}>
        <Button
          mode="contained"
          onPress={handleGenerate}
          disabled={!canGenerate}
          icon="auto-fix"
        >
          Generate Suggestions
        </Button>
      </View>
    </ScrollView>
  );

  // ─── Loading UI ─────────────────────────────────────────────────────────────

  const renderLoading = () => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text
        variant="bodyLarge"
        style={{ color: theme.colors.onSurfaceVariant, marginTop: 16, textAlign: 'center' }}
      >
        Generating routine suggestions...
      </Text>
      <Text
        variant="bodySmall"
        style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center', opacity: 0.7 }}
      >
        This may take up to a minute.
      </Text>
      <Button
        mode="text"
        onPress={() => setScreenState('config')}
        style={{ marginTop: 24 }}
      >
        Cancel
      </Button>
    </View>
  );

  // ─── Results UI ─────────────────────────────────────────────────────────────

  const renderResults = () => (
    <ScrollView contentContainerStyle={styles.scroll}>
      {/* Explanation */}
      {explanation ? (
        <View style={styles.section}>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {explanation}
          </Text>
        </View>
      ) : null}

      {/* Warnings */}
      {warnings.length > 0 && (
        <View style={styles.section}>
          <Card style={[styles.warningCard, { backgroundColor: `${theme.colors.tertiary}15` }]}>
            <Card.Content>
              <Text
                variant="labelMedium"
                style={{ color: theme.colors.tertiary, fontWeight: '600', marginBottom: 4 }}
              >
                Warnings
              </Text>
              {warnings.map((w, i) => (
                <Text key={i} variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {'\u2022'} {w}
                </Text>
              ))}
            </Card.Content>
          </Card>
        </View>
      )}

      {/* Routine cards */}
      {results.map((routine) => (
        <View key={routine.id} style={styles.section}>
          <Card style={styles.resultCard}>
            <Card.Content>
              <Text variant="titleMedium" style={{ fontWeight: '600', marginBottom: 8 }}>
                {routine.name}
              </Text>

              {/* Trigger phrases */}
              <View style={styles.chips}>
                {routine.trigger_phrases.map((phrase) => (
                  <Chip key={phrase} compact style={styles.chip} textStyle={styles.chipText}>
                    {phrase}
                  </Chip>
                ))}
              </View>

              {/* Steps */}
              <View style={styles.stepsContainer}>
                {routine.steps.map((step, i) => (
                  <View key={i} style={styles.stepRow}>
                    <Text
                      variant="labelSmall"
                      style={[styles.stepNumber, { color: theme.colors.primary }]}
                    >
                      {i + 1}.
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodySmall" style={{ fontWeight: '600' }}>
                        {step.label || step.command}
                      </Text>
                      {step.label && step.label !== step.command && (
                        <Text
                          variant="bodySmall"
                          style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}
                        >
                          {step.command}
                          {step.args.length > 0
                            ? ` (${step.args.map((a) => `${a.key}=${a.value}`).join(', ')})`
                            : ''}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>

              {/* Response length */}
              <View style={styles.metaRow}>
                <Chip compact style={styles.chip} textStyle={styles.chipText}>
                  {routine.response_length}
                </Chip>
                {routine.response_instruction ? (
                  <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.onSurfaceVariant, flex: 1, marginLeft: 8 }}
                    numberOfLines={1}
                  >
                    {routine.response_instruction}
                  </Text>
                ) : null}
              </View>

              {/* Use button */}
              <Button
                mode="contained-tonal"
                onPress={() => handleUseRoutine(routine)}
                style={{ marginTop: 12 }}
                icon="pencil-outline"
              >
                Use This Routine
              </Button>
            </Card.Content>
          </Card>
        </View>
      ))}

      {results.length === 0 && (
        <View style={styles.section}>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
            No routines were generated. Try adjusting your prompt or selecting a different node.
          </Text>
        </View>
      )}

      {/* Bottom actions */}
      <View style={[styles.section, styles.bottomActions]}>
        <Button
          mode="outlined"
          onPress={() => {
            setScreenState('config');
            setResults([]);
            setExplanation('');
            setWarnings([]);
          }}
          icon="auto-fix"
          style={{ flex: 1, marginRight: 8 }}
        >
          Generate More
        </Button>
        <Button
          mode="text"
          onPress={() => setScreenState('config')}
          style={{ flex: 1, marginLeft: 8 }}
        >
          Back to Settings
        </Button>
      </View>
    </ScrollView>
  );

  // ─── Main render ────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Fixed header */}
      <View
        style={[
          styles.fixedHeader,
          {
            backgroundColor: theme.colors.background,
            borderBottomColor: theme.colors.outlineVariant,
          },
        ]}
      >
        <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
        <Text variant="headlineSmall" style={{ fontWeight: 'bold', flex: 1 }}>
          AI Routine Suggestions
        </Text>
      </View>

      {screenState === 'config' && renderConfig()}
      {screenState === 'loading' && renderLoading()}
      {screenState === 'results' && renderResults()}
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
  dropdown: { alignSelf: 'stretch' },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },

  // Result cards
  resultCard: { marginBottom: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip: { height: 30, paddingHorizontal: 2 },
  chipText: { fontSize: 11 },
  stepsContainer: { gap: 6, marginBottom: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  stepNumber: { fontWeight: '700', fontSize: 12, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  bottomActions: { flexDirection: 'row', marginTop: 8 },

  // Error / warning cards
  errorCard: { borderRadius: 8 },
  warningCard: { borderRadius: 8 },
});

export default RoutineSuggestScreen;
