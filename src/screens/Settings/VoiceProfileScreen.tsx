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
  Icon,
  Text,
} from 'react-native-paper';

import { useAuth } from '../../auth/AuthContext';
import { useVoiceRecording } from '../../hooks/useVoiceRecording';
import { useThemePreference } from '../../theme/ThemeProvider';
import {
  deleteVoiceProfile,
  enrollVoiceProfile,
  getVoiceProfileStatus,
  verifyVoiceProfile,
} from '../../api/voiceProfileApi';

// --- Types ---

type Phase =
  | 'loading'
  | 'idle'           // no profile enrolled
  | 'enrolled'       // profile exists
  | 'recording'      // recording enrollment sample
  | 'uploading'      // enrolling with backend
  | 'test_prompt'    // prompt user to test
  | 'test_recording' // recording test sample
  | 'verifying'      // verifying match
  | 'test_result'    // showing match result
  | 'deleting';

const ENROLLMENT_PROMPT =
  "Hey Jarvis, set a timer for five minutes, then remind me to check the oven. Also, what's the weather like tomorrow morning?";

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

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    timerRef.current = null;
    autoStopRef.current = null;
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
          onPress={() => startRecordingFlow('enroll')}
          style={styles.button}
        >
          Start Recording
        </Button>
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
              onPress={() => startRecordingFlow('enroll')}
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
          onPress={() => startRecordingFlow('enroll')}
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
