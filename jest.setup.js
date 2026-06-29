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
