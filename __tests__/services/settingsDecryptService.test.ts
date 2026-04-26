import { aesGcmDecrypt } from 'jarvis-crypto';

import { decryptSettingsSnapshot } from '../../src/services/settingsDecryptService';
import { getK2 } from '../../src/services/k2Service';

// Mock jarvis-crypto with aesGcmDecrypt (overrides jest.setup.js mock)
jest.mock('jarvis-crypto', () => ({
  argon2id: jest.fn(),
  chacha20poly1305Encrypt: jest.fn(),
  chacha20poly1305Decrypt: jest.fn(),
  aesGcmEncrypt: jest.fn(),
  aesGcmDecrypt: jest.fn(),
  randomBytes: jest.fn(),
}));

// Mock k2Service
jest.mock('../../src/services/k2Service', () => ({
  getK2: jest.fn(),
}));

/**
 * Encode a string as base64url (the format the node uses before encryption).
 * Uses `-` and `_` instead of `+` and `/`, no padding.
 */
function toBase64url(str: string): string {
  const base64 = btoa(str);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('settingsDecryptService', () => {
  const mockNodeId = 'test-node-abc';
  const mockK2 = {
    k2: 'mock-k2-key-base64url',
    kid: 'k2-202603-xyz',
    nodeId: mockNodeId,
    createdAt: '2026-03-01T00:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('decryptSettingsSnapshot', () => {
    it('should throw when no K2 key found for node', async () => {
      (getK2 as jest.Mock).mockResolvedValue(null);

      await expect(
        decryptSettingsSnapshot(mockNodeId, 'cipher', 'nonce', 'tag'),
      ).rejects.toThrow(`No K2 key on this device for node ${mockNodeId}`);

      expect(getK2).toHaveBeenCalledWith(mockNodeId);
    });

    it('should decrypt and parse a settings snapshot successfully', async () => {
      const snapshot = {
        schema_version: 1,
        commands_schema_version: 2,
        commands: [
          {
            command_name: 'get_weather',
            description: 'Get weather info',
            secrets: [],
          },
        ],
      };

      // The node encodes JSON as base64url before encrypting.
      // After decryption, aesGcmDecrypt returns the base64url-encoded JSON.
      const base64urlPayload = toBase64url(JSON.stringify(snapshot));

      (getK2 as jest.Mock).mockResolvedValue(mockK2);
      (aesGcmDecrypt as jest.Mock).mockResolvedValue(base64urlPayload);

      const result = await decryptSettingsSnapshot(
        mockNodeId,
        'mock-ciphertext',
        'mock-nonce',
        'mock-tag',
      );

      expect(getK2).toHaveBeenCalledWith(mockNodeId);
      expect(aesGcmDecrypt).toHaveBeenCalledWith(
        mockK2.k2,
        'mock-nonce',
        'mock-ciphertext',
        'mock-tag',
        `${mockNodeId}:settings:snapshot`,
      );

      expect(result).toEqual(snapshot);
      expect(result.schema_version).toBe(1);
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].command_name).toBe('get_weather');
    });

    it('should pass correct AAD format to aesGcmDecrypt', async () => {
      const snapshot = { schema_version: 1, commands_schema_version: 1, commands: [] };
      const base64urlPayload = toBase64url(JSON.stringify(snapshot));

      (getK2 as jest.Mock).mockResolvedValue(mockK2);
      (aesGcmDecrypt as jest.Mock).mockResolvedValue(base64urlPayload);

      await decryptSettingsSnapshot('node-xyz-123', 'ct', 'iv', 'tag');

      const aadArg = (aesGcmDecrypt as jest.Mock).mock.calls[0][4];
      expect(aadArg).toBe('node-xyz-123:settings:snapshot');
    });

    it('should handle snapshot with device_families and device_managers', async () => {
      const snapshot = {
        schema_version: 1,
        commands_schema_version: 1,
        commands: [],
        device_families: [
          {
            family_name: 'govee',
            friendly_name: 'Govee',
            description: 'Govee smart devices',
            connection_type: 'cloud',
            supported_domains: ['light'],
            secrets: [],
            is_configured: false,
          },
        ],
        device_managers: [
          {
            manager_name: 'home_assistant',
            friendly_name: 'Home Assistant',
            description: 'HA integration',
            can_edit_devices: true,
            is_available: true,
            secrets: [],
          },
        ],
      };

      const base64urlPayload = toBase64url(JSON.stringify(snapshot));

      (getK2 as jest.Mock).mockResolvedValue(mockK2);
      (aesGcmDecrypt as jest.Mock).mockResolvedValue(base64urlPayload);

      const result = await decryptSettingsSnapshot(mockNodeId, 'ct', 'iv', 'tag');

      expect(result.device_families).toHaveLength(1);
      expect(result.device_families![0].family_name).toBe('govee');
      expect(result.device_managers).toHaveLength(1);
      expect(result.device_managers![0].manager_name).toBe('home_assistant');
    });

    it('should throw when decrypted data is not valid JSON', async () => {
      // base64url of "not json at all"
      const base64urlPayload = toBase64url('not json at all');

      (getK2 as jest.Mock).mockResolvedValue(mockK2);
      (aesGcmDecrypt as jest.Mock).mockResolvedValue(base64urlPayload);

      await expect(
        decryptSettingsSnapshot(mockNodeId, 'ct', 'iv', 'tag'),
      ).rejects.toThrow();
    });
  });
});
