import { requireNativeModule } from 'expo-modules-core';

// Android only: MediaRecorder (expo-av) can't write WAV, and the server's STT reads only PCM WAV.
interface JarvisWavRecorderModule {
  start(): Promise<void>;
  /** Stops recording and resolves the file:// URI of a 16 kHz mono 16-bit WAV. */
  stop(): Promise<string>;
}

// Resolved on first use so importing this on iOS (where the module doesn't exist) is safe.
const native = () => requireNativeModule<JarvisWavRecorderModule>('JarvisWavRecorder');

export const startWavRecording = (): Promise<void> => native().start();
export const stopWavRecording = (): Promise<string> => native().stop();
