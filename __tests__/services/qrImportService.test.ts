import { parseQRCode, importPlainQR, importEncryptedQR, importFromQR } from '../../src/services/qrImportService';
import { encodeQRPayload, PlainQRPayload, EncryptedQRPayload } from '../../src/services/qrPayloadService';

// Mock expo-secure-store (used by k2Service)
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

describe('qrImportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validPlainPayload: PlainQRPayload = {
    v: 1,
    mode: 'plain',
    node_id: 'test-node-1',
    kid: 'k2-202602-abc123',
    k2: 'test-k2-base64-value',
    created_at: '2026-02-18T00:00:00.000Z',
  };

  const validEncryptedPayload: EncryptedQRPayload = {
    v: 1,
    mode: 'enc',
    node_id: 'test-node-2',
    kid: 'k2-202602-def456',
    kdf: 'argon2id',
    salt: 'test-salt-base64',
    params: { m: 19456, t: 2, p: 1 },
    nonce: 'test-nonce-base64',
    ciphertext: 'test-ciphertext',
    tag: 'test-tag',
    created_at: '2026-02-18T00:00:00.000Z',
  };

  describe('parseQRCode', () => {
    it('should parse a valid plain QR code', () => {
      const encoded = encodeQRPayload(validPlainPayload);
      const result = parseQRCode(encoded);

      expect(result.success).toBe(true);
      expect(result.requiresPassword).toBe(false);
      expect(result.nodeId).toBe('test-node-1');
      expect(result.payload).toEqual(validPlainPayload);
    });

    it('should parse a valid encrypted QR code', () => {
      const encoded = encodeQRPayload(validEncryptedPayload);
      const result = parseQRCode(encoded);

      expect(result.success).toBe(true);
      expect(result.requiresPassword).toBe(true);
      expect(result.nodeId).toBe('test-node-2');
    });

    it('should fail for invalid base64 data', () => {
      const result = parseQRCode('not-valid-base64!!!');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should fail for missing required fields', () => {
      const incomplete = { v: 1, mode: 'plain' };
      const json = JSON.stringify(incomplete);
      const encoded = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      const result = parseQRCode(encoded);

      expect(result.success).toBe(false);
      expect(result.error).toContain('missing required fields');
    });

    it('should fail for unsupported version', () => {
      const futurePayload = { ...validPlainPayload, v: 99 };
      const encoded = encodeQRPayload(futurePayload as PlainQRPayload);

      const result = parseQRCode(encoded);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported QR code version');
    });

    it('should fail for plain payload missing k2', () => {
      const noKey = { v: 1, mode: 'plain', node_id: 'node-1', kid: 'kid-1' };
      const json = JSON.stringify(noKey);
      const encoded = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      const result = parseQRCode(encoded);

      expect(result.success).toBe(false);
      expect(result.error).toContain('missing key data');
    });
  });

  describe('importPlainQR', () => {
    it('should import a plain QR payload successfully', async () => {
      const result = await importPlainQR(validPlainPayload);

      expect(result.success).toBe(true);
      expect(result.keyPair).toBeDefined();
      expect(result.keyPair!.k2).toBe('test-k2-base64-value');
      expect(result.keyPair!.kid).toBe('k2-202602-abc123');
      expect(result.keyPair!.nodeId).toBe('test-node-1');
      expect(result.nodeId).toBe('test-node-1');
    });

    it('should reject encrypted payloads', async () => {
      const result = await importPlainQR(validEncryptedPayload as any);

      expect(result.success).toBe(false);
      expect(result.requiresPassword).toBe(true);
      expect(result.error).toContain('encrypted');
    });
  });

  describe('importEncryptedQR', () => {
    it('should reject unsupported KDF', async () => {
      const badKdf = { ...validEncryptedPayload, kdf: 'bcrypt' as any };
      const result = await importEncryptedQR(badKdf, 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported KDF');
    });
  });

  describe('importFromQR', () => {
    it('should import a plain QR code without password', async () => {
      const encoded = encodeQRPayload(validPlainPayload);
      const result = await importFromQR(encoded);

      expect(result.success).toBe(true);
      expect(result.keyPair).toBeDefined();
      expect(result.nodeId).toBe('test-node-1');
    });

    it('should return requiresPassword for encrypted QR without password', async () => {
      const encoded = encodeQRPayload(validEncryptedPayload);
      const result = await importFromQR(encoded);

      expect(result.success).toBe(false);
      expect(result.requiresPassword).toBe(true);
      expect(result.error).toBe('Password required');
    });

    it('should fail for invalid QR data', async () => {
      const result = await importFromQR('garbage-data!!!');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
