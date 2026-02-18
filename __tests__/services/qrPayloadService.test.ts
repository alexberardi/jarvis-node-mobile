import {
  generatePlainQRPayload,
  encodeQRPayload,
  decodeQRPayload,
  isEncryptedPayload,
  PlainQRPayload,
  EncryptedQRPayload,
} from '../../src/services/qrPayloadService';
import { K2KeyPair } from '../../src/services/k2Service';

describe('qrPayloadService', () => {
  const mockKeyPair: K2KeyPair = {
    k2: 'dGVzdC1rMi12YWx1ZQ', // base64url "test-k2-value"
    kid: 'k2-202602-abc123',
    nodeId: 'test-node-1',
    createdAt: '2026-02-18T00:00:00.000Z',
  };

  describe('generatePlainQRPayload', () => {
    it('should generate a plain payload with correct fields', () => {
      const payload = generatePlainQRPayload(mockKeyPair);

      expect(payload).toEqual({
        v: 1,
        mode: 'plain',
        node_id: 'test-node-1',
        kid: 'k2-202602-abc123',
        k2: 'dGVzdC1rMi12YWx1ZQ',
        created_at: '2026-02-18T00:00:00.000Z',
        cc_url: undefined,
      });
    });

    it('should include command center URL when provided', () => {
      const payload = generatePlainQRPayload(mockKeyPair, 'http://192.168.1.10:8002');

      expect(payload.cc_url).toBe('http://192.168.1.10:8002');
    });
  });

  describe('encodeQRPayload / decodeQRPayload', () => {
    it('should round-trip a plain payload through encode/decode', () => {
      const payload = generatePlainQRPayload(mockKeyPair);
      const encoded = encodeQRPayload(payload);
      const decoded = decodeQRPayload(encoded);

      expect(decoded).toEqual(payload);
    });

    it('should produce a base64url string without padding', () => {
      const payload = generatePlainQRPayload(mockKeyPair);
      const encoded = encodeQRPayload(payload);

      // base64url: no +, no /, no trailing =
      expect(encoded).not.toMatch(/[+/=]/);
    });

    it('should decode a manually constructed base64url payload', () => {
      const original: PlainQRPayload = {
        v: 1,
        mode: 'plain',
        node_id: 'node-abc',
        kid: 'k2-202602-test',
        k2: 'some-key-data',
      };

      const json = JSON.stringify(original);
      // Manual base64url encode
      const base64 = btoa(json);
      const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      const decoded = decodeQRPayload(base64url);
      expect(decoded).toEqual(original);
    });
  });

  describe('isEncryptedPayload', () => {
    it('should return false for a plain payload', () => {
      const plain: PlainQRPayload = {
        v: 1,
        mode: 'plain',
        node_id: 'test-node',
        kid: 'k2-test',
        k2: 'key-data',
      };

      expect(isEncryptedPayload(plain)).toBe(false);
    });

    it('should return true for an encrypted payload', () => {
      const encrypted: EncryptedQRPayload = {
        v: 1,
        mode: 'enc',
        node_id: 'test-node',
        kid: 'k2-test',
        kdf: 'argon2id',
        salt: 'random-salt',
        params: { m: 19456, t: 2, p: 1 },
        nonce: 'random-nonce',
        ciphertext: 'encrypted-data',
        tag: 'auth-tag',
      };

      expect(isEncryptedPayload(encrypted)).toBe(true);
    });
  });
});
