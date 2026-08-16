import 'react-native-gesture-handler/jestSetup';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Mock expo-secure-store (OS keychain) — used for JWT auth tokens and K2 keys.
// canUseBiometricAuthentication defaults to false so token writes/reads are
// ungated unless a test opts in (mockReturnValue(true)). The keychainAccessible
// constants are referenced by tokenStorage's option objects.
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  canUseBiometricAuthentication: jest.fn(() => false),
  WHEN_UNLOCKED: 'whenUnlocked',
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
}));

// Mock expo-task-manager. The background geofence task registers via
// TaskManager.defineTask at import time; unmocked it touches the native module
// and throws under jest-expo. Tests that need the registered executor import it
// directly (backgroundPresenceTask exports it) or re-mock inline.
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  unregisterTaskAsync: jest.fn().mockResolvedValue(undefined),
  isTaskRegisteredAsync: jest.fn().mockResolvedValue(false),
}));

// Mock expo-notifications. presenceService now transitively imports it (local
// arrive/leave notifications), so any test touching presence would otherwise
// load the native module and throw under jest-expo. Tests that assert on
// notification calls can re-mock inline.
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('local-notif-id'),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[mock]' }),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  removeNotificationSubscription: jest.fn(),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3, LOW: 2, MIN: 1 },
}));

// Mock jarvis-crypto native module.
// IMPORTANT: keep these method names in sync with modules/jarvis-crypto/index.ts.
// The real module exports AES-256-GCM (aesGcmEncrypt/aesGcmDecrypt) + argon2id +
// randomBytes — NOT chacha20poly1305. A prior version of this mock named chacha*
// methods the module never exports, so any test exercising the AEAD path
// (config-push / QR import / settings-decrypt) got `undefined` and silently
// passed. EncryptResult is { ciphertext, tag } (the IV is an input, not returned).
jest.mock('./modules/jarvis-crypto', () => ({
  argon2id: jest.fn().mockResolvedValue('mock-argon2-hash'),
  aesGcmEncrypt: jest.fn().mockResolvedValue({
    ciphertext: 'mock-ciphertext',
    tag: 'mock-tag',
  }),
  aesGcmDecrypt: jest.fn().mockResolvedValue('mock-plaintext'),
  randomBytes: jest.fn().mockResolvedValue('mock-random-bytes-base64'),
}));

// Mock SafeAreaContext
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };

  const mockSafeAreaContext = React.createContext({
    insets: inset,
    frame: frame,
  });

  return {
    SafeAreaProvider: ({ children }) => children,
    SafeAreaConsumer: mockSafeAreaContext.Consumer,
    SafeAreaContext: mockSafeAreaContext,
    SafeAreaView: ({ children }) => children,
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => frame,
    SafeAreaInsetsContext: mockSafeAreaContext,
    SafeAreaFrameContext: mockSafeAreaContext,
    initialWindowMetrics: {
      insets: inset,
      frame: frame,
    },
  };
});

// Silence console warnings in tests
const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string') {
    if (args[0].includes('Animated')) return;
    if (args[0].includes('useNativeDriver')) return;
    if (args[0].includes('setNativeProps')) return;
  }
  originalWarn.apply(console, args);
};
