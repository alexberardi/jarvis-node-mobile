import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import {
  setTokens,
  getTokens,
  clearTokens,
  isBiometricLoginEnabled,
  setBiometricLoginEnabled,
  biometricCapable,
} from '../../src/services/tokenStorage';

const FLAG = '@jarvis/biometric_login_enabled';
const ACCESS = 'jarvis_access_token';
const REFRESH = 'jarvis_refresh_token';

const setFlag = (enabled: boolean) =>
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    Promise.resolve(key === FLAG ? (enabled ? 'true' : 'false') : null),
  );

describe('tokenStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStore.canUseBiometricAuthentication as jest.Mock).mockReturnValue(false);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  });

  describe('setTokens', () => {
    it('writes both tokens ungated (but device-only) when biometric login is off', async () => {
      setFlag(false);
      (SecureStore.canUseBiometricAuthentication as jest.Mock).mockReturnValue(true);

      await setTokens('a1', 'r1');

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        ACCESS,
        'a1',
        expect.not.objectContaining({ requireAuthentication: true }),
      );
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        REFRESH,
        'r1',
        expect.not.objectContaining({ requireAuthentication: true }),
      );
      // Device-only accessibility on both.
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        ACCESS,
        'a1',
        expect.objectContaining({ keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
      );
    });

    it('gates ONLY the refresh token (delete-then-create) when opted in + capable', async () => {
      setFlag(true);
      (SecureStore.canUseBiometricAuthentication as jest.Mock).mockReturnValue(true);

      await setTokens('a1', 'r1');

      // Access token stays ungated.
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        ACCESS,
        'a1',
        expect.not.objectContaining({ requireAuthentication: true }),
      );
      // Refresh token written with requireAuthentication...
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        REFRESH,
        'r1',
        expect.objectContaining({ requireAuthentication: true }),
      );
      // ...after deleting the prior item so it's a CREATE (no iOS write prompt).
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(REFRESH);
    });

    it('keeps the refresh token gated even when capability reports false (no silent downgrade on a lockout blip)', async () => {
      setFlag(true);
      // Transient biometric lockout: capability reports false, but a keychain
      // CREATE still succeeds (a CREATE does not evaluate biometrics). The write
      // policy follows the opt-in flag, not the momentary capability probe.
      (SecureStore.canUseBiometricAuthentication as jest.Mock).mockReturnValue(false);

      await setTokens('a1', 'r1');

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        REFRESH,
        'r1',
        expect.objectContaining({ requireAuthentication: true }),
      );
    });

    it('degrades to ungated ONLY when the gated keychain write actually throws', async () => {
      setFlag(true);
      (SecureStore.setItemAsync as jest.Mock).mockImplementation(
        (key: string, _val: string, opts?: { requireAuthentication?: boolean }) => {
          if (key === REFRESH && opts?.requireAuthentication) {
            return Promise.reject(new Error('biometry not available'));
          }
          return Promise.resolve(undefined);
        },
      );

      await setTokens('a1', 'r1');

      // It TRIED the gated write first...
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        REFRESH,
        'r1',
        expect.objectContaining({ requireAuthentication: true }),
      );
      // ...then fell back to an ungated write of the same token.
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        REFRESH,
        'r1',
        expect.not.objectContaining({ requireAuthentication: true }),
      );
    });
  });

  describe('getTokens', () => {
    it('returns both tokens and no cancellation on a normal read', async () => {
      setFlag(false);
      (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) =>
        Promise.resolve(key === ACCESS ? 'a1' : key === REFRESH ? 'r1' : null),
      );

      const res = await getTokens();

      expect(res).toEqual({ accessToken: 'a1', refreshToken: 'r1', biometricCancelled: false });
    });

    it('reads the refresh token with the biometric prompt when gated', async () => {
      setFlag(true);
      (SecureStore.canUseBiometricAuthentication as jest.Mock).mockReturnValue(true);
      (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) =>
        Promise.resolve(key === ACCESS ? 'a1' : key === REFRESH ? 'r1' : null),
      );

      await getTokens();

      expect(SecureStore.getItemAsync).toHaveBeenCalledWith(
        REFRESH,
        expect.objectContaining({ requireAuthentication: true, authenticationPrompt: expect.any(String) }),
      );
    });

    it('returns biometricCancelled and leaves the token intact when the gated read fails', async () => {
      setFlag(true);
      (SecureStore.canUseBiometricAuthentication as jest.Mock).mockReturnValue(true);
      (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) => {
        if (key === ACCESS) return Promise.resolve('a1');
        if (key === REFRESH) return Promise.reject(new Error('UserCancel'));
        return Promise.resolve(null);
      });

      const res = await getTokens();

      expect(res.refreshToken).toBeNull();
      expect(res.biometricCancelled).toBe(true);
      // Never auto-delete on a cancel — the token must survive for a retry.
      expect(SecureStore.deleteItemAsync).not.toHaveBeenCalledWith(REFRESH);
    });

    it('migrates legacy AsyncStorage tokens into the keychain on first read', async () => {
      setFlag(false);
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
        if (key === '@jarvis/access_token') return Promise.resolve('legacy-a');
        if (key === '@jarvis/refresh_token') return Promise.resolve('legacy-r');
        return Promise.resolve(null); // flag etc.
      });

      const res = await getTokens();

      expect(res.accessToken).toBe('legacy-a');
      expect(res.refreshToken).toBe('legacy-r');
      expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
        '@jarvis/access_token',
        '@jarvis/refresh_token',
      ]);
    });
  });

  describe('clearTokens', () => {
    it('deletes both keychain tokens (no auth required)', async () => {
      await clearTokens();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(ACCESS);
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(REFRESH);
    });
  });

  describe('preference helpers', () => {
    it('persists and reads the opt-in boolean', async () => {
      await setBiometricLoginEnabled(true);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(FLAG, 'true');

      setFlag(true);
      expect(await isBiometricLoginEnabled()).toBe(true);

      setFlag(false);
      expect(await isBiometricLoginEnabled()).toBe(false);
    });

    it('biometricCapable reflects SecureStore capability and is safe if it throws', async () => {
      (SecureStore.canUseBiometricAuthentication as jest.Mock).mockReturnValue(true);
      expect(biometricCapable()).toBe(true);

      (SecureStore.canUseBiometricAuthentication as jest.Mock).mockImplementation(() => {
        throw new Error('unavailable');
      });
      expect(biometricCapable()).toBe(false);
    });
  });
});
