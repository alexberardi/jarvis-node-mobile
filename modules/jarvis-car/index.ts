import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

type JarvisCarNative = { postReply(text: string): Promise<void> };

// Android only: Android Auto has no iOS equivalent, so elsewhere this is a no-op.
const NativeModule: JarvisCarNative | null =
  Platform.OS === 'android' ? requireNativeModule<JarvisCarNative>('JarvisCar') : null;

/** Post Jarvis's text as an Android Auto messaging notification (read aloud in the car). */
export async function postReply(text: string): Promise<void> {
  await NativeModule?.postReply(text);
}
