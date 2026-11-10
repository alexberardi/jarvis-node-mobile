/**
 * Voice recording hook: 16 kHz mono PCM WAV, the only format the server's STT reads.
 *
 * iOS records LINEARPCM through expo-av. Android's MediaRecorder (what expo-av uses there)
 * can't write WAV, so Android records through the local jarvis-wav-recorder module.
 */

import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import { startWavRecording, stopWavRecording } from 'jarvis-wav-recorder';

interface UseVoiceRecordingReturn {
  isRecording: boolean;
  /** Resolves true if recording started, false if permission was denied or
   *  setup failed (lets callers distinguish "listening" from "blocked"). */
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<string | null>;
}

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  isMeteringEnabled: false,
  // Unused: Android records through jarvis-wav-recorder.
  android: {
    extension: '.wav',
    outputFormat: Audio.AndroidOutputFormat.DEFAULT,
    audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
  },
  ios: {
    extension: '.wav',
    outputFormat: Audio.IOSOutputFormat.LINEARPCM,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/wav',
    bitsPerSecond: 256000,
  },
};

export function useVoiceRecording(): UseVoiceRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const androidRecordingRef = useRef(false);

  const startRecording = useCallback(async (): Promise<boolean> => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        console.warn('[Voice] Microphone permission denied');
        return false;
      }

      if (Platform.OS === 'android') {
        await startWavRecording();
        androidRecordingRef.current = true;
        setIsRecording(true);
        return true;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(RECORDING_OPTIONS);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
      return true;
    } catch (err) {
      console.error('[Voice] Failed to start recording:', err);
      setIsRecording(false);
      return false;
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (androidRecordingRef.current) {
      androidRecordingRef.current = false;
      setIsRecording(false);
      try {
        return await stopWavRecording();
      } catch (err) {
        console.error('[Voice] Failed to stop recording:', err);
        return null;
      }
    }

    const recording = recordingRef.current;
    if (!recording) return null;

    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
      const uri = recording.getURI();
      recordingRef.current = null;
      setIsRecording(false);
      return uri;
    } catch (err) {
      console.error('[Voice] Failed to stop recording:', err);
      recordingRef.current = null;
      setIsRecording(false);
      return null;
    }
  }, []);

  return { isRecording, startRecording, stopRecording };
}
