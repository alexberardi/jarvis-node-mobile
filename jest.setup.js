import 'react-native-gesture-handler/jestSetup';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Mock jarvis-crypto native module
jest.mock('./modules/jarvis-crypto', () => ({
  argon2id: jest.fn().mockResolvedValue('mock-argon2-hash'),
  chacha20poly1305Encrypt: jest.fn().mockResolvedValue({
    ciphertext: 'mock-ciphertext',
    tag: 'mock-tag',
    nonce: 'mock-nonce',
  }),
  chacha20poly1305Decrypt: jest.fn().mockResolvedValue('mock-plaintext'),
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
