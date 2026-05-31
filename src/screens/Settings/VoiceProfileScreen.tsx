/**
 * Voice Profile enrollment, testing, and management screen.
 *
 * Node-mic only — phone-mic enrollment was dropped because its acoustic
 * profile diverges enough from the stationary node's mic that profiles
 * built on phone audio score poorly at runtime. Every flow on this
 * screen orchestrates the target node's mic via MQTT.
 *
 * Flow:
 * 1. Check if profile exists → idle / enrolled
 * 2. Pick a node → orchestrate 3 takes (varied prompts) on that node
 * 3. After all takes: test verification on the same node
 * 4. Enrolled view: add one more sample, re-record all, or delete
 */

import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
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

// --- Types ---

type Phase =
  | 'loading'
  | 'idle'             // no profile enrolled
  | 'enrolled'         // profile exists
  | 'select_target'    // pick which node to enroll/test on
  | 'awaiting_node'    // node is recording + uploading; polling for result
  | 'test_prompt'      // prompt user to verify after enrollment
  | 'test_result'      // showing match result
  | 'deleting';

// Multi-take wizard state. When non-null, we're mid-wizard — each take is
// a full round-trip (mobile → CC → MQTT → node TTS + record + upload →
// mobile poll). After all `totalTakes` complete, we drop into test_prompt.
// `useExplicitIndices` is unused for node-mic (the whisper backend
// auto-allocates next index for each enrollment), kept structurally for
// symmetry with the prior phone-mic flow.
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
  //   'enroll'  → fresh 3-take wizard (clears existing profile)
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
    setPhase('awaiting_node');
    const prompt =
      ENROLLMENT_PROMPTS[ctx.currentTake % ENROLLMENT_PROMPTS.length];
    try {
      const { request_id } = await startNodeEnrollment(
        ctx.node.node_id,
        prompt,
        NODE_ENROLLMENT_DURATION_S,
      );
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
          if (result === null) return; // still pending
          clearTimers();
          if (!result.success) {
            setError(`Enrollment failed: ${result.error || 'unknown error'}`);
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
            setSampleCount(status.sample_count);
          } catch (statusErr) {
            console.warn('[VoiceProfile] post-take status refresh failed:', statusErr);
          }

          const live = multiTakeRef.current;
          if (!live) return; // user cancelled mid-poll
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

  /**
   * Begin a multi-take wizard on the given node.
   * - clearExisting=true → wipes any prior profile so the new takes form
   *   a fresh centroid (used for "Re-Record All").
   * - totalTakes=1 with clearExisting=false → "Add One More Sample".
   */
  const startMultiTakeNodeWizard = useCallback(
    async (node: NodeInfo, totalTakes: number, clearExisting: boolean) => {
      if (!householdId) return;
      setError(null);
      setActiveNode(node);
      if (clearExisting) {
        setPhase('deleting');
        try {
          await deleteVoiceProfile(householdId);
          setSampleCount(0);
        } catch (e) {
          console.error('[VoiceProfile] clear-before-wizard failed:', e);
          setError('Could not clear existing profile. Try again.');
          setPhase('idle');
          return;
        }
      }
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
      'Are you sure? You can always re-enroll later.',
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

  const renderLoading = () => (
    <View style={styles.center}>
      <ActivityIndicator size="large" />
      <Text variant="bodyMedium" style={styles.statusText}>
        Checking voice profile...
      </Text>
    </View>
  );

  const renderIdle = () => (
    <Card style={styles.card}>
      <Card.Content>
        <Icon source="account-voice" size={48} color={paperTheme.colors.primary} />
        <Text variant="titleMedium" style={styles.title}>
          Set Up Voice Recognition
        </Text>
        <Text variant="bodyMedium" style={styles.body}>
          We'll record {TARGET_TAKES} short voice samples on the node you
          pick — a command, a question, and a casual statement. The varied
          prompts help Jarvis recognize you across the natural pitch and
          tone shifts in your everyday speech.
        </Text>
        <Button
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
        ? 'Pick a node to test on'
        : purpose === 'add_one'
          ? 'Add a sample on which node?'
          : 'Pick a node to enroll on';
    const subhead =
      purpose === 'test'
        ? 'The verification will run on the same mic, so use the node you usually speak to.'
        : purpose === 'add_one'
          ? 'One short take. Pick the node whose mic you want to enrich this profile with.'
          : `Enrollment runs on the node's mic so daytime recognition matches your enrollment acoustics. ${TARGET_TAKES} takes total.`;
    const onPickNode = (node: NodeInfo) => {
      switch (purpose) {
        case 'test':
          return startNodeVerifyFlow(node);
        case 'add_one':
          return startMultiTakeNodeWizard(node, 1, false);
        case 'enroll':
        default:
          return startMultiTakeNodeWizard(node, TARGET_TAKES, sampleCount > 0);
      }
    };
    return (
      <Card style={styles.card}>
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
              No online nodes available. Make sure a node is online and try again.
            </Text>
          ) : (
            <View>
              {nodes.map((node) => (
                <List.Item
                  key={node.node_id}
                  title={node.room || 'Unnamed node'}
                  description={node.user || node.node_id.substring(0, 8)}
                  left={(props) => <List.Icon {...props} icon="speaker" />}
                  onPress={() => onPickNode(node)}
                  style={styles.nodeRow}
                />
              ))}
            </View>
          )}

          <Divider style={{ marginVertical: 12 }} />

          <Button
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
            {isVerify ? 'Testing' : 'Recording'} on {activeNode?.room || 'node'}
            {titleSuffix}
          </Text>
          <ActivityIndicator size="large" style={{ marginVertical: 12 }} />
          <Text variant="bodyMedium" style={styles.prompt}>
            The node will play a cue and then record. Read this prompt
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
          {sampleCount} samples enrolled on {activeNode?.room || 'the node'}.
          Now let's verify it works — speak to the same node.
        </Text>
        <Button
          mode="contained"
          icon="microphone"
          onPress={() =>
            activeNode ? startNodeVerifyFlow(activeNode) : openTargetPicker('test')
          }
          style={styles.button}
        >
          Test My Voice{activeNode ? ` on ${activeNode.room || 'node'}` : ''}
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
            ? 'Your voice profile is working on this node.'
            : "The test sample didn't match your profile. You can re-record the test, add more enrollment samples, or re-record the full profile from scratch."}
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
            ? '1 sample enrolled. Adding more samples improves accuracy across pitch and tone variation.'
            : `${sampleCount} samples enrolled. Add more to widen recognition across pitch and tone.`}
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
          icon="refresh"
          onPress={() => openTargetPicker()}
          style={styles.button}
        >
          Re-Record All {TARGET_TAKES} Samples
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

      <View style={styles.content}>
        {error && (
          <Text
            variant="bodySmall"
            style={[styles.error, { color: paperTheme.colors.error }]}
          >
            {error}
          </Text>
        )}
        {renderPhase()}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
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
});

export default VoiceProfileScreen;
