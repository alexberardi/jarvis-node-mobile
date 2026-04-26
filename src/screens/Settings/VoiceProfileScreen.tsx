/**
 * Voice Profile enrollment, testing, and management screen.
 *
 * Flow:
 * 1. Check if profile exists → show appropriate state
 * 2. Record: user reads a prompt sentence (~5–10s)
 * 3. Enroll: upload WAV to CC → whisper
 * 4. Test: record new phrase → verify match → show confidence
 * 5. Update: same as enroll (overwrites)
 * 6. Delete: confirmation → remove
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
import { useVoiceRecording } from '../../hooks/useVoiceRecording';
import { useThemePreference } from '../../theme/ThemeProvider';
import {
  deleteVoiceProfile,
  enrollVoiceProfile,
  getNodeEnrollmentResult,
  getVoiceProfileStatus,
  startNodeEnrollment,
  verifyVoiceProfile,
} from '../../api/voiceProfileApi';
import { listNodes, type NodeInfo } from '../../api/nodeApi';

// --- Types ---

type Phase =
  | 'loading'
  | 'idle'             // no profile enrolled
  | 'enrolled'         // profile exists
  | 'select_target'    // pick phone vs a specific node for enrollment
  | 'recording'        // recording enrollment sample (phone)
  | 'uploading'        // enrolling with backend
  | 'awaiting_node'    // node is recording + uploading; polling for result
  | 'test_prompt'      // prompt user to test
  | 'test_recording'   // recording test sample
  | 'verifying'        // verifying match
  | 'test_result'      // showing match result
  | 'deleting';

// Deliberately avoid "Hey Jarvis" / wake-word phrasing — when this is
// read aloud near a node mic during enrollment, any wake-word substring
// would trigger the wake detector and conflict with the enrollment
// recording.
const ENROLLMENT_PROMPT =
  "Please set a timer for five minutes, then remind me to check the oven. Also, what's the weather like tomorrow morning?";

const TEST_PROMPT =
  'Now say something different — any question or command. We\'ll check if it matches your voice.';

const MAX_RECORD_MS = 10_000;

// --- Component ---

const VoiceProfileScreen = () => {
  const navigation = useNavigation();
  const { state: authState } = useAuth();
  const { paperTheme } = useThemePreference();
  const { isRecording, startRecording, stopRecording } = useVoiceRecording();

  const householdId = authState.activeHouseholdId;

  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [matched, setMatched] = useState(false);

  // Node-mediated enrollment state
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [loadingNodes, setLoadingNodes] = useState(false);
  const [activeNode, setActiveNode] = useState<NodeInfo | null>(null);
  const [nodeRequestId, setNodeRequestId] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollDeadlineRef = useRef<number>(0);

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
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    timerRef.current = null;
    autoStopRef.current = null;
    pollRef.current = null;
  };

  // --- API calls ---

  const checkStatus = useCallback(async () => {
    if (!householdId) return;
    setPhase('loading');
    setError(null);
    try {
      const status = await getVoiceProfileStatus(householdId);
      setPhase(status.has_profile ? 'enrolled' : 'idle');
    } catch (e) {
      console.error('[VoiceProfile] status check failed:', e);
      setError('Could not check voice profile status.');
      setPhase('idle');
    }
  }, [householdId]);

  // --- Node target selection ---

  const openTargetPicker = useCallback(async () => {
    setError(null);
    setPhase('select_target');
    if (!householdId) return;
    setLoadingNodes(true);
    try {
      const all = await listNodes(householdId);
      // Only show online nodes — offline ones can't record.
      setNodes(all.filter((n) => n.online));
    } catch (e) {
      console.error('[VoiceProfile] listNodes failed:', e);
      setError('Could not load nodes — you can still enroll on your phone.');
      setNodes([]);
    } finally {
      setLoadingNodes(false);
    }
  }, [householdId]);

  const startNodeFlow = useCallback(async (node: NodeInfo) => {
    setError(null);
    setActiveNode(node);
    setPhase('awaiting_node');
    try {
      const { request_id } = await startNodeEnrollment(
        node.node_id,
        ENROLLMENT_PROMPT,
        8.0,
      );
      setNodeRequestId(request_id);

      // Poll every 1s, up to 60s total. Node-side flow runs ~10s
      // (TTS cue + 8s record + upload), so 60s gives generous slack.
      pollDeadlineRef.current = Date.now() + 60_000;
      pollRef.current = setInterval(async () => {
        if (Date.now() > pollDeadlineRef.current) {
          clearTimers();
          setError('Node didn\'t report back in time. Try again.');
          setPhase('idle');
          return;
        }
        try {
          const result = await getNodeEnrollmentResult(request_id);
          if (result === null) return; // still pending
          clearTimers();
          if (result.success) {
            setPhase('test_prompt');
          } else {
            setError(`Enrollment failed: ${result.error || 'unknown error'}`);
            setPhase('idle');
          }
        } catch (e) {
          console.error('[VoiceProfile] poll failed:', e);
          // transient errors — keep polling until deadline
        }
      }, 1000);
    } catch (e) {
      console.error('[VoiceProfile] startNodeEnrollment failed:', e);
      setError('Could not start enrollment on that node.');
      setPhase('idle');
    }
  }, []);

  // --- Recording logic ---

  const startRecordingFlow = useCallback(
    async (purpose: 'enroll' | 'test') => {
      setError(null);
      setElapsed(0);

      await startRecording();
      setPhase(purpose === 'enroll' ? 'recording' : 'test_recording');

      // Elapsed counter
      const start = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - start) / 1000));
      }, 500);

      // Auto-stop after MAX_RECORD_MS
      autoStopRef.current = setTimeout(async () => {
        await finishRecording(purpose);
      }, MAX_RECORD_MS);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [startRecording],
  );

  const finishRecording = useCallback(
    async (purpose: 'enroll' | 'test') => {
      clearTimers();
      const uri = await stopRecording();
      if (!uri || !householdId) {
        setError('Recording failed — no audio captured.');
        setPhase(phase === 'test_recording' ? 'enrolled' : 'idle');
        return;
      }

      if (purpose === 'enroll') {
        setPhase('uploading');
        try {
          await enrollVoiceProfile(uri, householdId);
          setPhase('test_prompt');
        } catch (e) {
          console.error('[VoiceProfile] enroll failed:', e);
          setError('Enrollment failed. Please try again.');
          setPhase('idle');
        }
      } else {
        setPhase('verifying');
        try {
          const result = await verifyVoiceProfile(uri, householdId);
          setMatched(result.matched);
          setConfidence(Math.round(result.confidence * 100));
          setPhase('test_result');
        } catch (e) {
          console.error('[VoiceProfile] verify failed:', e);
          setError('Verification failed. Please try again.');
          setPhase('enrolled');
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [householdId, stopRecording, phase],
  );

  const handleStopRecording = useCallback(() => {
    const purpose = phase === 'recording' ? 'enroll' : 'test';
    finishRecording(purpose);
  }, [phase, finishRecording]);

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
          Record a short voice sample so Jarvis can recognize you. This enables
          personalized responses and per-user memories.
        </Text>
        <Button
          mode="contained"
          icon="microphone"
          onPress={openTargetPicker}
          style={styles.button}
        >
          Start Recording
        </Button>
      </Card.Content>
    </Card>
  );

  const renderSelectTarget = () => (
    <Card style={styles.card}>
      <Card.Content>
        <Icon source="microphone-settings" size={48} color={paperTheme.colors.primary} />
        <Text variant="titleMedium" style={styles.title}>
          Where do you want to enroll?
        </Text>
        <Text variant="bodyMedium" style={styles.body}>
          Voice recognition works best when the same mic is used at
          enrollment and at runtime. If you mostly speak to a stationary
          node, enroll on that node — its mic will produce a better
          match than the phone's.
        </Text>

        <Button
          mode="contained"
          icon="cellphone"
          onPress={() => startRecordingFlow('enroll')}
          style={styles.button}
        >
          This Phone
        </Button>

        <Text variant="labelSmall" style={[styles.body, { marginTop: 16 }]}>
          Or pick a node:
        </Text>

        {loadingNodes ? (
          <ActivityIndicator style={styles.button} />
        ) : nodes.length === 0 ? (
          <Text variant="bodySmall" style={[styles.body, { opacity: 0.6 }]}>
            No online nodes available.
          </Text>
        ) : (
          <View>
            {nodes.map((node) => (
              <List.Item
                key={node.node_id}
                title={node.room || 'Unnamed node'}
                description={node.user || node.node_id.substring(0, 8)}
                left={(props) => <List.Icon {...props} icon="speaker" />}
                onPress={() => startNodeFlow(node)}
                style={styles.nodeRow}
              />
            ))}
          </View>
        )}

        <Divider style={{ marginVertical: 12 }} />

        <Button
          mode="text"
          onPress={() => setPhase(phase === 'select_target' ? 'idle' : 'enrolled')}
        >
          Cancel
        </Button>
      </Card.Content>
    </Card>
  );

  const renderAwaitingNode = () => (
    <Card style={styles.card}>
      <Card.Content style={styles.center}>
        <Icon source="microphone" size={64} color={paperTheme.colors.primary} />
        <Text variant="titleMedium" style={styles.title}>
          Recording on {activeNode?.room || 'node'}
        </Text>
        <ActivityIndicator size="large" style={{ marginVertical: 12 }} />
        <Text variant="bodyMedium" style={styles.prompt}>
          The node will play a cue and then record. Read this prompt
          aloud when you hear it:{'\n\n'}"{ENROLLMENT_PROMPT}"
        </Text>
        <Text variant="bodySmall" style={[styles.body, { marginTop: 12 }]}>
          Request ID: {nodeRequestId?.substring(0, 8) || '...'}
        </Text>
      </Card.Content>
    </Card>
  );

  const renderRecording = (purpose: 'enroll' | 'test') => (
    <Card style={styles.card}>
      <Card.Content style={styles.center}>
        <Icon
          source="microphone"
          size={64}
          color={paperTheme.colors.error}
        />
        <Text variant="titleMedium" style={styles.title}>
          {purpose === 'enroll' ? 'Recording...' : 'Testing...'}
        </Text>
        <Text variant="headlineMedium" style={styles.timer}>
          {elapsed}s / {MAX_RECORD_MS / 1000}s
        </Text>
        {purpose === 'enroll' && (
          <Text variant="bodyMedium" style={styles.prompt}>
            Please read aloud:{'\n'}"{ENROLLMENT_PROMPT}"
          </Text>
        )}
        {purpose === 'test' && (
          <Text variant="bodyMedium" style={styles.prompt}>
            Say anything — a question, a command, or just talk naturally.
          </Text>
        )}
        <Button
          mode="outlined"
          onPress={handleStopRecording}
          style={styles.button}
          icon="stop"
        >
          Stop Recording
        </Button>
      </Card.Content>
    </Card>
  );

  const renderUploading = () => (
    <View style={styles.center}>
      <ActivityIndicator size="large" />
      <Text variant="bodyMedium" style={styles.statusText}>
        Enrolling your voice...
      </Text>
    </View>
  );

  const renderTestPrompt = () => (
    <Card style={styles.card}>
      <Card.Content>
        <Icon source="check-circle" size={48} color={paperTheme.colors.primary} />
        <Text variant="titleMedium" style={styles.title}>
          Voice Enrolled!
        </Text>
        <Text variant="bodyMedium" style={styles.body}>
          {TEST_PROMPT}
        </Text>
        <Button
          mode="contained"
          icon="microphone"
          onPress={() => startRecordingFlow('test')}
          style={styles.button}
        >
          Test My Voice
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

  const renderVerifying = () => (
    <View style={styles.center}>
      <ActivityIndicator size="large" />
      <Text variant="bodyMedium" style={styles.statusText}>
        Checking for a match...
      </Text>
    </View>
  );

  const renderTestResult = () => (
    <Card style={styles.card}>
      <Card.Content style={styles.center}>
        <Icon
          source={matched ? 'check-circle' : 'close-circle'}
          size={64}
          color={matched ? paperTheme.colors.primary : paperTheme.colors.error}
        />
        <Text variant="titleMedium" style={styles.title}>
          {matched ? `Matched — ${confidence}% confidence` : 'No Match'}
        </Text>
        <Text variant="bodyMedium" style={styles.body}>
          {matched
            ? 'Your voice profile is working. Jarvis will recognize you on any node in your household.'
            : 'The test sample didn\'t match your profile. You can re-record your enrollment or try the test again.'}
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
              onPress={() => startRecordingFlow('test')}
              style={styles.button}
            >
              Try Test Again
            </Button>
            <Button
              mode="outlined"
              onPress={openTargetPicker}
              style={styles.button}
            >
              Re-Record Profile
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
          Jarvis recognizes your voice for personalized responses and memories.
        </Text>
        <Button
          mode="contained"
          icon="microphone"
          onPress={() => startRecordingFlow('test')}
          style={styles.button}
        >
          Test Match
        </Button>
        <Button
          mode="outlined"
          icon="refresh"
          onPress={openTargetPicker}
          style={styles.button}
        >
          Update Profile
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
      case 'recording':
        return renderRecording('enroll');
      case 'uploading':
        return renderUploading();
      case 'test_prompt':
        return renderTestPrompt();
      case 'test_recording':
        return renderRecording('test');
      case 'verifying':
        return renderVerifying();
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
  timer: {
    marginVertical: 8,
    fontVariant: ['tabular-nums'],
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
