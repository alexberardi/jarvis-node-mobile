import { renderHook, act } from '@testing-library/react-native';
import { Audio } from 'expo-av';

import { useVoiceRecording } from '../../src/hooks/useVoiceRecording';

// Mock Recording instance
const mockRecordingInstance = {
  prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
  startAsync: jest.fn().mockResolvedValue(undefined),
  stopAndUnloadAsync: jest.fn().mockResolvedValue(undefined),
  getURI: jest.fn().mockReturnValue('file:///tmp/recording.wav'),
};

// Mock expo-av
jest.mock('expo-av', () => {
  const MockRecording = jest.fn().mockImplementation(() => mockRecordingInstance);

  return {
    Audio: {
      requestPermissionsAsync: jest.fn(),
      setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
      Recording: MockRecording,
      AndroidOutputFormat: { DEFAULT: 0 },
      AndroidAudioEncoder: { DEFAULT: 0 },
      IOSOutputFormat: { LINEARPCM: 'lpcm' },
      IOSAudioQuality: { HIGH: 127 },
    },
  };
});

describe('useVoiceRecording', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecordingInstance.prepareToRecordAsync.mockResolvedValue(undefined);
    mockRecordingInstance.startAsync.mockResolvedValue(undefined);
    mockRecordingInstance.stopAndUnloadAsync.mockResolvedValue(undefined);
    mockRecordingInstance.getURI.mockReturnValue('file:///tmp/recording.wav');
  });

  describe('initial state', () => {
    it('should have isRecording as false', () => {
      const { result } = renderHook(() => useVoiceRecording());

      expect(result.current.isRecording).toBe(false);
    });

    it('should expose startRecording and stopRecording functions', () => {
      const { result } = renderHook(() => useVoiceRecording());

      expect(typeof result.current.startRecording).toBe('function');
      expect(typeof result.current.stopRecording).toBe('function');
    });
  });

  describe('startRecording', () => {
    it('should request permissions and start recording', async () => {
      (Audio.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });

      const { result } = renderHook(() => useVoiceRecording());

      await act(async () => {
        await result.current.startRecording();
      });

      expect(Audio.requestPermissionsAsync).toHaveBeenCalled();
      expect(Audio.setAudioModeAsync).toHaveBeenCalledWith({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      expect(mockRecordingInstance.prepareToRecordAsync).toHaveBeenCalled();
      expect(mockRecordingInstance.startAsync).toHaveBeenCalled();
      expect(result.current.isRecording).toBe(true);
    });

    it('should not start recording when permission denied', async () => {
      (Audio.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
      });

      const { result } = renderHook(() => useVoiceRecording());

      await act(async () => {
        await result.current.startRecording();
      });

      expect(mockRecordingInstance.prepareToRecordAsync).not.toHaveBeenCalled();
      expect(result.current.isRecording).toBe(false);
    });

    it('should set isRecording to false on error', async () => {
      (Audio.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      mockRecordingInstance.startAsync.mockRejectedValue(new Error('Audio error'));

      const { result } = renderHook(() => useVoiceRecording());

      await act(async () => {
        await result.current.startRecording();
      });

      expect(result.current.isRecording).toBe(false);
    });
  });

  describe('stopRecording', () => {
    it('should stop recording and return the URI', async () => {
      (Audio.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });

      const { result } = renderHook(() => useVoiceRecording());

      // Start recording first
      await act(async () => {
        await result.current.startRecording();
      });

      expect(result.current.isRecording).toBe(true);

      // Stop recording
      let uri: string | null = null;
      await act(async () => {
        uri = await result.current.stopRecording();
      });

      expect(uri).toBe('file:///tmp/recording.wav');
      expect(result.current.isRecording).toBe(false);
      expect(mockRecordingInstance.stopAndUnloadAsync).toHaveBeenCalled();
      expect(Audio.setAudioModeAsync).toHaveBeenCalledWith({
        allowsRecordingIOS: false,
      });
    });

    it('should return null when no recording in progress', async () => {
      const { result } = renderHook(() => useVoiceRecording());

      let uri: string | null = 'not-null';
      await act(async () => {
        uri = await result.current.stopRecording();
      });

      expect(uri).toBeNull();
      expect(mockRecordingInstance.stopAndUnloadAsync).not.toHaveBeenCalled();
    });

    it('should return null and set isRecording false on stop error', async () => {
      (Audio.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      mockRecordingInstance.stopAndUnloadAsync.mockRejectedValue(
        new Error('Stop failed'),
      );

      const { result } = renderHook(() => useVoiceRecording());

      // Start recording
      await act(async () => {
        await result.current.startRecording();
      });

      expect(result.current.isRecording).toBe(true);

      // Stop recording (should fail gracefully)
      let uri: string | null = 'not-null';
      await act(async () => {
        uri = await result.current.stopRecording();
      });

      expect(uri).toBeNull();
      expect(result.current.isRecording).toBe(false);
    });
  });
});
