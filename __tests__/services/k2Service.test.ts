import * as SecureStore from 'expo-secure-store';

import {
  generateK2,
  storeK2,
  getK2,
  hasK2,
  deleteK2,
  importK2FromPlainQR,
  K2KeyPair,
} from '../../src/services/k2Service';

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

describe('k2Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateK2', () => {
    it('should generate a K2 key pair with correct structure', async () => {
      const result = await generateK2('test-node-1');

      expect(result).toHaveProperty('k2');
      expect(result).toHaveProperty('kid');
      expect(result).toHaveProperty('nodeId', 'test-node-1');
      expect(result).toHaveProperty('createdAt');
    });

    it('should generate kid with k2- prefix', async () => {
      const result = await generateK2('test-node-2');

      expect(result.kid).toMatch(/^k2-/);
    });

    it('should include a timestamp in the kid', async () => {
      const result = await generateK2('test-node-3');

      // kid format: k2-YYYYMM-xxxxxx
      expect(result.kid).toMatch(/^k2-\d{6}-/);
    });

    it('should set createdAt to an ISO string', async () => {
      const result = await generateK2('test-node-4');

      expect(() => new Date(result.createdAt)).not.toThrow();
      expect(new Date(result.createdAt).toISOString()).toBe(result.createdAt);
    });
  });

  describe('storeK2', () => {
    it('should store k2 and kid data in secure store', async () => {
      const keyPair: K2KeyPair = {
        k2: 'test-k2-base64',
        kid: 'k2-202602-abc123',
        nodeId: 'test-node-1',
        createdAt: '2026-02-18T00:00:00.000Z',
      };

      await storeK2(keyPair);

      expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(2);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'jarvis_k2_test-node-1',
        'test-k2-base64'
      );
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'jarvis_kid_test-node-1',
        JSON.stringify({
          kid: 'k2-202602-abc123',
          createdAt: '2026-02-18T00:00:00.000Z',
        })
      );
    });
  });

  describe('getK2', () => {
    it('should return null when no key is stored', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

      const result = await getK2('nonexistent-node');

      expect(result).toBeNull();
    });

    it('should return key pair when both k2 and kid are stored', async () => {
      (SecureStore.getItemAsync as jest.Mock)
        .mockResolvedValueOnce('stored-k2-value') // k2
        .mockResolvedValueOnce(
          JSON.stringify({
            kid: 'k2-202602-xyz789',
            createdAt: '2026-02-18T00:00:00.000Z',
          })
        ); // kid data

      const result = await getK2('test-node-1');

      expect(result).toEqual({
        k2: 'stored-k2-value',
        kid: 'k2-202602-xyz789',
        nodeId: 'test-node-1',
        createdAt: '2026-02-18T00:00:00.000Z',
      });
    });

    it('should return null when k2 is missing but kid exists', async () => {
      (SecureStore.getItemAsync as jest.Mock)
        .mockResolvedValueOnce(null) // k2 missing
        .mockResolvedValueOnce(JSON.stringify({ kid: 'some-kid' }));

      const result = await getK2('test-node-1');

      expect(result).toBeNull();
    });

    it('should return null when kid is missing but k2 exists', async () => {
      (SecureStore.getItemAsync as jest.Mock)
        .mockResolvedValueOnce('stored-k2') // k2
        .mockResolvedValueOnce(null); // kid missing

      const result = await getK2('test-node-1');

      expect(result).toBeNull();
    });
  });

  describe('hasK2', () => {
    it('should return true when k2 exists', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('some-k2-value');

      const result = await hasK2('test-node-1');

      expect(result).toBe(true);
    });

    it('should return false when k2 does not exist', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

      const result = await hasK2('test-node-1');

      expect(result).toBe(false);
    });
  });

  describe('deleteK2', () => {
    it('should delete both k2 and kid entries', async () => {
      await deleteK2('test-node-1');

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(2);
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('jarvis_k2_test-node-1');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('jarvis_kid_test-node-1');
    });
  });

  describe('importK2FromPlainQR', () => {
    it('should store and return the key pair from QR payload', async () => {
      const payload = {
        node_id: 'qr-node-1',
        kid: 'k2-202602-qr1234',
        k2: 'qr-k2-base64-value',
        created_at: '2026-01-15T12:00:00.000Z',
      };

      const result = await importK2FromPlainQR(payload);

      expect(result).toEqual({
        k2: 'qr-k2-base64-value',
        kid: 'k2-202602-qr1234',
        nodeId: 'qr-node-1',
        createdAt: '2026-01-15T12:00:00.000Z',
      });

      expect(SecureStore.setItemAsync).toHaveBeenCalled();
    });

    it('should use current date when created_at is not provided', async () => {
      const payload = {
        node_id: 'qr-node-2',
        kid: 'k2-202602-qr5678',
        k2: 'qr-k2-base64-value-2',
      };

      const before = new Date().toISOString();
      const result = await importK2FromPlainQR(payload);
      const after = new Date().toISOString();

      expect(result.createdAt >= before).toBe(true);
      expect(result.createdAt <= after).toBe(true);
    });
  });
});
