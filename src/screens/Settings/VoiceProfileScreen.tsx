/**
 * Voice Profile enrollment, testing, and management screen.
 *
 * Records on a household node or desktop agent, using the microphone
 * the member normally speaks to. Every flow on this screen orchestrates
 * the selected device's mic via MQTT.
 *
 * Flow:
 * 1. Check if profile exists → idle / enrolled
 * 2. Pick a node → orchestrate 3 takes (varied prompts) on that node
 * 3. After all takes: test verification on the same node
 * 4. Enrolled view: add samples from any device, test, or explicitly delete
 */

import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Divider,
  Icon,
  List,
  Text,
} from 'react-native-paper';

import { useAuth } from '../../auth/AuthContext';
import { HelpIcon } from '../../components/HelpIcon';
import { helpCopy } from '../../copy/help';
import { useThemePreference } from '../../theme/ThemeProvider';
import {
  deleteVoiceProfile,
  getNodeEnrollmentResult,
  getVoiceProfileStatus,
  startNodeEnrollment,
  startNodeVerification,
} from '../../api/voiceProfileApi';
import { listNodes, type NodeInfo } from '../../api/nodeApi';
import { NodeKindIcon } from '../../components/NodeKindIcon';
import { isDesktopAgent, nodeDisplayName } from '../../utils/nodeKind';
import { voiceEnrollmentError } from '../../utils/voiceEnrollmentError';

// --- Types ---

type Phase =
  | 'loading'
  | 'idle'             // no profile enrolled
  | 'enrolled'         // profile exists
  | 'select_target'    // pick which node to enroll/test on
  | 'awaiting_node'    // node is recording + uploading; polling for result
  | 'take_failed'      // rejected take; keep its prompt and earlier successes for retry
  | 'test_prompt'      // prompt user to verify after enrollment
  | 'test_result'      // showing match result
  | 'deleting';

// Multi-take wizard state. When non-null, we're mid-wizard — each take is
// a full round-trip (mobile → CC → MQTT → node TTS + record + upload →
// mobile poll). After all `totalTakes` complete, we drop into test_prompt.
type MultiTakeContext = {
  totalTakes: number;
  currentTake: number; // 0-indexed
  node: NodeInfo;
};

const TARGET_TAKES = 3;

// Deliberately avoid "Hey Jarvis" / wake-word phrasing — when read aloud
// near a node mic during enrollment, any wake-word substring would
// trigger the wake detector and conflict with the enrollment recording.
//
// The 3-take wizard uses prompts with deliberately varied prosody —
// command/question/statement. ECAPA is text-independent but reading the
// same sentence 3 times produces a tight centroid around one prosodic
// pattern; varied prompts force varied intonation, widening the centroid
// so everyday speech (which spans all these patterns) matches reliably.
const ENROLLMENT_PROMPTS: string[] = [
  // 1. Commands — flat-then-emphatic prosody
  "Please set a timer for five minutes, then remind me to check the oven. Also, what's the weather like tomorrow morning?",
  // 2. Questions — rising intonation at the end of each clause
  "Can you tell me what's on my calendar today? Are there any reminders for this afternoon? And how long until sunset?",
  // 3. Casual statements — declarative, calmer pace
  "I'm thinking about ordering something light for dinner tonight, maybe a salad or a sandwich. Tomorrow I'd like to start the day a bit earlier.",
];

const VERIFY_NODE_PROMPT =
  "What's the weather like this weekend? Also, can you set a reminder for tomorrow at noon?";

// Per-take poll deadline. Each cycle is ~10s (TTS cue + 8s record + upload),
// so 60s gives generous slack for network/disk variance.
const POLL_DEADLINE_MS = 60_000;
const POLL_INTERVAL_MS = 1_000;
const NODE_ENROLLMENT_DURATION_S = 8.0;
const NODE_VERIFICATION_DURATION_S = 5.0;

// --- Component ---

const VoiceProfileScreen = () => {
  const navigation = useNavigation();
  const { state: authState } = useAuth();
  const { paperTheme } = useThemePreference();

  const householdId = authState.activeHouseholdId;

  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [matched, setMatched] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  // Household's voice.recognition_enabled (off by default; enrolling does not
  // turn it on). null = unknown (older server that doesn't report it).
  const [recognitionEnabled, setRecognitionEnabled] = useState<boolean | null>(null);

  // Multi-take wizard state. Null when not in a wizard.
  // Mirrored in a ref so async polling closures can read the latest value
  // without being trapped in a stale snapshot from before setMultiTake
  // re-rendered.
  const [multiTake, setMultiTake] = useState<MultiTakeContext | null>(null);
  const multiTakeRef = useRef<MultiTakeContext | null>(null);
  useEffect(() => {
    multiTakeRef.current = multiTake;
  }, [multiTake]);

  // Node-mediated enrollment state
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [loadingNodes, setLoadingNodes] = useState(false);
  const [activeNode, setActiveNode] = useState<NodeInfo | null>(null);
  const [nodeRequestId, setNodeRequestId] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollDeadlineRef = useRef<number>(0);
  // What the node picker should do when a node is tapped:
  //   'enroll'  → 3 takes appended to the household profile
  //   'add_one' → single-take wizard appended to existing profile
  //   'test'    → run node verification against existing profile
  type TargetPurpose = 'enroll' | 'add_one' | 'test';
  const targetPurposeRef = useRef<TargetPurpose>('enroll');

  // --- Lifecycle ---

  useEffect(() => {
    if (householdId) {
      checkStatus();
    }
    return () => {
      clearTimers();
      multiTakeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

  const clearTimers = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  // --- API calls ---

  const checkStatus = useCallback(async () => {
    if (!householdId) return;
    setPhase('loading');
    setError(null);
    try {
      const status = await getVoiceProfileStatus(householdId);
      setSampleCount(status.sample_count);
      setRecognitionEnabled(
        typeof status.recognition_enabled === 'boolean' ? status.recognition_enabled : null,
      );
      setPhase(status.has_profile ? 'enrolled' : 'idle');
    } catch (e) {
      console.error('[VoiceProfile] status check failed:', e);
      setError('Could not check voice profile status.');
      setPhase('idle');
    }
  }, [householdId]);

  // --- Node target selection ---

  const openTargetPicker = useCallback(async (purpose: TargetPurpose = 'enroll') => {
    setError(null);
    targetPurposeRef.current = purpose;
    setPhase('select_target');
    if (!householdId) return;
    setLoadingNodes(true);
    try {
      const all = await listNodes(householdId);
      // Only show online nodes — offline ones can't record.
      setNodes(all.filter((n) => n.online));
    } catch (e) {
      console.error('[VoiceProfile] listNodes failed:', e);
      setError('Could not load nodes.');
      setNodes([]);
    } finally {
      setLoadingNodes(false);
    }
  }, [householdId]);

  // --- Multi-take node-mic enrollment ---

  /**
   * Trigger one node enrollment cycle for the current take in the
   * wizard. Reads context from the ref so it can be safely re-invoked
   * after `currentTake` increments without dependency-array churn.
   */
  const triggerCurrentNodeTake = useCallback(async () => {
    const ctx = multiTakeRef.current;
    if (!ctx || !householdId) return;
    setError(null);
    setNodeRequestId(null);
    setPhase('awaiting_node');
    const prompt =
      ENROLLMENT_PROMPTS[ctx.currentTake % ENROLLMENT_PROMPTS.length];
    try {
      const { request_id } = await startNodeEnrollment(
        ctx.node.node_id,
        prompt,
        NODE_ENROLLMENT_DURATION_S,
      );
      if (multiTakeRef.current !== ctx) return;
      setNodeRequestId(request_id);

      pollDeadlineRef.current = Date.now() + POLL_DEADLINE_MS;
      pollRef.current = setInterval(async () => {
        if (Date.now() > pollDeadlineRef.current) {
          clearTimers();
          setError("Node didn't report back in time. Try again.");
          // Drop out of the wizard to whichever resting state matches.
          multiTakeRef.current = null;
          setMultiTake(null);
          setPhase(sampleCount > 0 ? 'enrolled' : 'idle');
          return;
        }
        try {
          const result = await getNodeEnrollmentResult(request_id);
          if (multiTakeRef.current !== ctx) return;
          if (result === null) return; // still pending
          clearTimers();
          if (!result.success) {
            setError(voiceEnrollmentError(result));
            if (result.error === 'low_quality') {
              setPhase('take_failed');
              return;
            }
            multiTakeRef.current = null;
            setMultiTake(null);
            setPhase(sampleCount > 0 ? 'enrolled' : 'idle');
            return;
          }

          // Successful take. Pull fresh count so the UI reflects what
          // whisper actually stored (auto-allocated indices can differ
          // from currentTake when the user added samples piecemeal).
          try {
            const status = await getVoiceProfileStatus(householdId);
            if (multiTakeRef.current !== ctx) return;
            setSampleCount(status.sample_count);
          } catch (statusErr) {
            console.warn('[VoiceProfile] post-take status refresh failed:', statusErr);
          }

          const live = multiTakeRef.current;
          if (live !== ctx) return; // user cancelled or started another wizard mid-poll
          const nextTake = live.currentTake + 1;
          if (nextTake >= live.totalTakes) {
            // Wizard complete — drop into the test step.
            multiTakeRef.current = null;
            setMultiTake(null);
            setPhase('test_prompt');
          } else {
            const advanced = { ...live, currentTake: nextTake };
            multiTakeRef.current = advanced;
            setMultiTake(advanced);
            // Kick off the next take immediately.
            await triggerCurrentNodeTake();
          }
        } catch (e) {
          console.error('[VoiceProfile] poll failed:', e);
          // transient errors — keep polling until deadline
        }
      }, POLL_INTERVAL_MS);
    } catch (e) {
      console.error('[VoiceProfile] startNodeEnrollment failed:', e);
      setError('Could not start enrollment on that node.');
      multiTakeRef.current = null;
      setMultiTake(null);
      setPhase(sampleCount > 0 ? 'enrolled' : 'idle');
    }
  }, [householdId, sampleCount]);

  // Adding a microphone never deletes samples recorded on other devices.
  const startMultiTakeNodeWizard = useCallback(
    async (node: NodeInfo, totalTakes: number) => {
      if (!householdId) return;
      setError(null);
      setActiveNode(node);
      const ctx: MultiTakeContext = {
        totalTakes,
        currentTake: 0,
        node,
      };
      multiTakeRef.current = ctx;
      setMultiTake(ctx);
      await triggerCurrentNodeTake();
    },
    [householdId, triggerCurrentNodeTake],
  );

  const startNodeVerifyFlow = useCallback(async (node: NodeInfo) => {
    if (!householdId) return;
    setError(null);
    setActiveNode(node);
    setPhase('awaiting_node');
    try {
      const { request_id } = await startNodeVerification(
        node.node_id,
        VERIFY_NODE_PROMPT,
        NODE_VERIFICATION_DURATION_S,
      );
      setNodeRequestId(request_id);

      pollDeadlineRef.current = Date.now() + POLL_DEADLINE_MS;
      pollRef.current = setInterval(async () => {
        if (Date.now() > pollDeadlineRef.current) {
          clearTimers();
          setError("Node didn't report back in time. Try again.");
          setPhase('enrolled');
          return;
        }
        try {
          const result = await getNodeEnrollmentResult(request_id);
          if (result === null) return;
          clearTimers();
          if (result.success) {
            setMatched(result.matched ?? false);
            setConfidence(Math.round((result.confidence ?? 0) * 100));
            setPhase('test_result');
          } else {
            setError(`Verification failed: ${result.error || 'unknown error'}`);
            setPhase('enrolled');
          }
        } catch (e) {
          console.error('[VoiceProfile] verify poll failed:', e);
        }
      }, POLL_INTERVAL_MS);
    } catch (e) {
      console.error('[VoiceProfile] startNodeVerification failed:', e);
      setError('Could not start verification on that node.');
      setPhase('enrolled');
    }
  }, [householdId]);

  const cancelNodeFlow = useCallback(() => {
    clearTimers();
    multiTakeRef.current = null;
    setMultiTake(null);
    setNodeRequestId(null);
    setActiveNode(null);
    setError(null);
    // Verification was launched from "enrolled"; enrollment from "idle".
    setPhase(
      targetPurposeRef.current === 'test'
        ? 'enrolled'
        : sampleCount > 0
          ? 'enrolled'
          : 'idle',
    );
  }, [sampleCount]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete Voice Profile',
      'This deletes all your voice samples for this household, including samples from other devices. You can enroll again later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!householdId) return;
            setPhase('deleting');
            try {
              await deleteVoiceProfile(householdId);
              setSampleCount(0);
              setPhase('idle');
            } catch (e) {
              console.error('[VoiceProfile] delete failed:', e);
              setError('Delete failed.');
              setPhase('enrolled');
            }
          },
        },
      ],
    );
  }, [householdId]);

  // --- Render helpers ---

  // Shown above every phase once the status says recognition is off, so it's
  // visible before AND after enrolling. Enrollment stays fully usable.
  const renderRecognitionOffNotice = () => (
    <Card
      testID="voice-recognition-off-notice"
      style={[styles.card, { backgroundColor: paperTheme.colors.secondaryContainer }]}
    >
      <Card.Content>
        <View style={styles.noticeRow}>
          <Icon source="information-outline" size={24} color={paperTheme.colors.onSecondaryContainer} />
          <Text
            variant="titleSmall"
            style={[styles.noticeTitle, { color: paperTheme.colors.onSecondaryContainer }]}
          >
            {helpCopy.voiceProfile.recognitionOffTitle}
          </Text>
        </View>
        <Text variant="bodySmall" style={{ color: paperTheme.colors.onSecondaryContainer }}>
          {helpCopy.voiceProfile.recognitionOff}
        </Text>
      </Card.Content>
    </Card>
  );

  const renderLoading = () => (
    <View style={styles.center}>
      <ActivityIndicator size="large" />
      <Text variant="bodyMedium" style={styles.statusText}>
        Checking voice profile...
      </Text>
    </View>
  );

  const renderIdle = () => (
    <Card style={styles.card} testID="voice-idle">
      <Card.Content>
        <Icon source="account-voice" size={48} color={paperTheme.colors.primary} />
        <Text variant="titleMedium" style={styles.title}>
          Set Up Voice Recognition
        </Text>
        <Text variant="bodyMedium" style={styles.body}>
          We'll record {TARGET_TAKES} short voice samples on the device you
          pick — a command, a question, and a casual statement. The varied
          prompts help Jarvis recognize you across the natural pitch and
          tone shifts in your everyday speech.
        </Text>
        <Button
          testID="voice-start-enrollment"
          mode="contained"
          icon="microphone"
          onPress={() => openTargetPicker()}
          style={styles.button}
        >
          Start Enrollment
        </Button>
      </Card.Content>
    </Card>
  );

  const renderSelectTarget = () => {
    const purpose = targetPurposeRef.current;
    const heading =
      purpose === 'test'
        ? 'Pick a device to test on'
        : purpose === 'add_one'
          ? 'Add a sample on which device?'
          : 'Pick a device to enroll on';
    const subhead =
      purpose === 'test'
        ? 'Choose any household node or computer with a microphone to test your profile.'
        : purpose === 'add_one'
          ? 'One short take from this microphone, added to your existing household profile.'
          : `Add ${TARGET_TAKES} samples from this microphone. All your existing household samples are kept.`;
    const onPickNode = (node: NodeInfo) => {
      switch (purpose) {
        case 'test':
          return startNodeVerifyFlow(node);
        case 'add_one':
          return startMultiTakeNodeWizard(node, 1);
        case 'enroll':
        default:
          return startMultiTakeNodeWizard(node, TARGET_TAKES);
      }
    };
    return (
      <Card style={styles.card} testID="voice-select-target">
        <Card.Content>
          <Icon source="microphone-settings" size={48} color={paperTheme.colors.primary} />
          <Text variant="titleMedium" style={styles.title}>
            {heading}
          </Text>
          <Text variant="bodyMedium" style={styles.body}>
            {subhead}
          </Text>

          {loadingNodes ? (
            <ActivityIndicator style={styles.button} />
          ) : nodes.length === 0 ? (
            <Text variant="bodySmall" style={[styles.body, { opacity: 0.6 }]}>
              No online devices available. Make sure a node or computer is online and try again.
            </Text>
          ) : (
            <View>
              {nodes.map((node) => {
                // Older desktop agents ignore enrollment commands. Only offer
                // recording once the agent advertises support in its heartbeat.
                const cannotRecord = isDesktopAgent(node) && node.capabilities?.voice_enrollment !== true;
                return (
                  <List.Item
                    key={node.node_id}
                    title={nodeDisplayName(node, 'Unnamed node')}
                    description={
                      cannotRecord
                        ? node.capabilities?.voice_enrollment === false
                          ? 'Voice recording is not available on this computer'
                          : 'Update the Jarvis agent to record voice samples'
                        : node.user || node.node_id.substring(0, 8)
                    }
                    left={(props) => (
                      <NodeKindIcon
                        node={node}
                        size={24}
                        color={props.color}
                        testID={`voice-target-kind-${node.node_id}`}
                        style={[props.style, { justifyContent: 'center' }]}
                      />
                    )}
                    onPress={cannotRecord ? undefined : () => onPickNode(node)}
                    disabled={cannotRecord}
                    style={[styles.nodeRow, cannotRecord && { opacity: 0.5 }]}
                  />
                );
              })}
            </View>
          )}

          <Divider style={{ marginVertical: 12 }} />

          <Button
            testID="voice-select-target-cancel"
            mode="text"
            onPress={() =>
              setPhase(sampleCount > 0 ? 'enrolled' : 'idle')
            }
          >
            Cancel
          </Button>
        </Card.Content>
      </Card>
    );
  };

  const renderAwaitingNode = () => {
    const isVerify = targetPurposeRef.current === 'test' && !multiTake;
    const prompt = isVerify
      ? VERIFY_NODE_PROMPT
      : multiTake
        ? ENROLLMENT_PROMPTS[multiTake.currentTake % ENROLLMENT_PROMPTS.length]
        : ENROLLMENT_PROMPTS[0];
    const titleSuffix = multiTake
      ? ` — Take ${multiTake.currentTake + 1} of ${multiTake.totalTakes}`
      : '';
    return (
      <Card style={styles.card}>
        <Card.Content style={styles.center}>
          <Icon source="microphone" size={64} color={paperTheme.colors.primary} />
          <Text variant="titleMedium" style={styles.title}>
            {isVerify ? 'Testing' : 'Recording'} on {activeNode ? nodeDisplayName(activeNode, 'node') : 'node'}
            {titleSuffix}
          </Text>
          <ActivityIndicator size="large" style={{ marginVertical: 12 }} />
          <Text variant="bodyMedium" style={styles.prompt}>
            The device will play a cue and then record. Read this prompt
            aloud when you hear it:{'\n\n'}"{prompt}"
          </Text>
          <Text variant="bodySmall" style={[styles.body, { marginTop: 12 }]}>
            Request ID: {nodeRequestId?.substring(0, 8) || '...'}
          </Text>
          <Button
            mode="outlined"
            onPress={cancelNodeFlow}
            style={styles.button}
            icon="stop"
          >
            Cancel
          </Button>
        </Card.Content>
      </Card>
    );
  };

  const renderTestPrompt = () => (
    <Card style={styles.card}>
      <Card.Content>
        <Icon source="check-circle" size={48} color={paperTheme.colors.primary} />
        <Text variant="titleMedium" style={styles.title}>
          Enrollment Complete
        </Text>
        <Text variant="bodyMedium" style={styles.body}>
          Your household profile now has {sampleCount} samples, including the new samples from {activeNode ? nodeDisplayName(activeNode, 'this device') : 'this device'}.
          Test your voice on this microphone next.
        </Text>
        <Button
          mode="contained"
          icon="microphone"
          onPress={() =>
            activeNode ? startNodeVerifyFlow(activeNode) : openTargetPicker('test')
          }
          style={styles.button}
        >
          Test My Voice{activeNode ? ` on ${nodeDisplayName(activeNode, 'node')}` : ''}
        </Button>
        <Button
          mode="text"
          onPress={() => setPhase('enrolled')}
          style={styles.skipButton}
        >
          Skip Test
        </Button>
      </Card.Content>
    </Card>
  );

  const renderFailedTake = () => (
    <Card style={styles.card}>
      <Card.Content>
        <Text variant="titleMedium" style={styles.title}>
          Take {(multiTake?.currentTake ?? 0) + 1} of {multiTake?.totalTakes ?? 1} needs another try
        </Text>
        <Text variant="bodyMedium" accessibilityRole="alert" style={styles.body}>
          {error}
        </Text>
        <Text variant="bodyMedium" style={styles.body}>
          Your earlier samples are kept. Retry this take on {activeNode ? nodeDisplayName(activeNode, 'this device') : 'this device'}, or finish for now.
        </Text>
        <Button mode="contained" icon="microphone" onPress={triggerCurrentNodeTake} style={styles.button}>
          Retry This Take
        </Button>
        <Button mode="text" onPress={cancelNodeFlow} style={styles.button}>
          Finish for Now
        </Button>
      </Card.Content>
    </Card>
  );

  const renderTestResult = () => (
    <Card style={styles.card}>
      <Card.Content style={styles.center}>
        <Icon
          source={matched ? 'check-circle' : 'close-circle'}
          size={64}
          color={matched ? paperTheme.colors.primary : paperTheme.colors.error}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="titleMedium" style={styles.title}>
            {matched ? `Matched — ${confidence}% confidence` : 'No Match'}
          </Text>
          {matched && <HelpIcon text={helpCopy.voiceProfile.confidenceAnchor} size={16} />}
        </View>
        <Text variant="bodyMedium" style={styles.body}>
          {matched
            ? 'Your voice profile is working on this device.'
            : "The test sample didn't match your profile. You can re-record the test or add more samples from this microphone."}
        </Text>
        {matched ? (
          <Button
            mode="contained"
            onPress={() => setPhase('enrolled')}
            style={styles.button}
          >
            Done
          </Button>
        ) : (
          <>
            <Button
              mode="contained"
              icon="microphone"
              onPress={() =>
                activeNode ? startNodeVerifyFlow(activeNode) : openTargetPicker('test')
              }
              style={styles.button}
            >
              Try Test Again
            </Button>
            <Button
              mode="outlined"
              onPress={() => openTargetPicker()}
              style={styles.button}
            >
              Add More Samples
            </Button>
          </>
        )}
      </Card.Content>
    </Card>
  );

  const renderEnrolled = () => (
    <Card style={styles.card}>
      <Card.Content>
        <Icon source="account-check" size={48} color={paperTheme.colors.primary} />
        <Text variant="titleMedium" style={styles.title}>
          Voice Profile Active
        </Text>
        <Text variant="bodyMedium" style={styles.body}>
          {sampleCount === 1
            ? '1 sample in your household profile. Add samples from any node or computer without replacing it.'
            : `${sampleCount} samples in your household profile. Add samples from any node or computer without replacing them.`}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Button
            mode="contained"
            icon="microphone"
            onPress={() => openTargetPicker('test')}
            style={[styles.button, { flex: 1 }]}
          >
            Test Match
          </Button>
          <HelpIcon text={helpCopy.voiceProfile.testMatch} size={16} />
        </View>
        <Button
          mode="outlined"
          icon="plus"
          onPress={() => openTargetPicker('add_one')}
          style={styles.button}
        >
          Add One More Sample
        </Button>
        <Button
          mode="outlined"
          icon="plus-circle-outline"
          onPress={() => openTargetPicker()}
          style={styles.button}
        >
          Add Another Device
        </Button>
        <Button
          mode="text"
          icon="delete"
          textColor={paperTheme.colors.error}
          onPress={handleDelete}
          style={styles.button}
        >
          Delete Profile
        </Button>
      </Card.Content>
    </Card>
  );

  const renderDeleting = () => (
    <View style={styles.center}>
      <ActivityIndicator size="large" />
      <Text variant="bodyMedium" style={styles.statusText}>
        Deleting voice profile...
      </Text>
    </View>
  );

  // --- Main render ---

  const renderPhase = () => {
    switch (phase) {
      case 'loading':
        return renderLoading();
      case 'idle':
        return renderIdle();
      case 'select_target':
        return renderSelectTarget();
      case 'awaiting_node':
        return renderAwaitingNode();
      case 'take_failed':
        return renderFailedTake();
      case 'test_prompt':
        return renderTestPrompt();
      case 'test_result':
        return renderTestResult();
      case 'enrolled':
        return renderEnrolled();
      case 'deleting':
        return renderDeleting();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: paperTheme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Voice Recognition" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        {error && phase !== 'take_failed' && (
          <Text
            variant="bodySmall"
            style={[styles.error, { color: paperTheme.colors.error }]}
          >
            {error}
          </Text>
        )}
        {recognitionEnabled === false && phase !== 'loading' && renderRecognitionOffNotice()}
        {renderPhase()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: 16,
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
  },
  card: {
    marginVertical: 8,
  },
  title: {
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  body: {
    marginBottom: 16,
    textAlign: 'center',
    opacity: 0.7,
  },
  prompt: {
    marginVertical: 16,
    textAlign: 'center',
    fontStyle: 'italic',
    opacity: 0.8,
    paddingHorizontal: 8,
  },
  button: {
    marginTop: 8,
  },
  skipButton: {
    marginTop: 4,
  },
  nodeRow: {
    paddingHorizontal: 0,
  },
  statusText: {
    marginTop: 12,
    opacity: 0.7,
  },
  error: {
    textAlign: 'center',
    marginBottom: 12,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  noticeTitle: {
    flex: 1,
    fontWeight: '600',
  },
});

export default VoiceProfileScreen;
