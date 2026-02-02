import * as SecureStore from 'expo-secure-store';

import { randomBytes } from 'jarvis-crypto';

const K2_STORAGE_PREFIX = 'jarvis_k2_';
const KID_STORAGE_PREFIX = 'jarvis_kid_';

export interface K2KeyPair {
  k2: string; // base64url encoded 32 bytes
  kid: string; // key identifier
  nodeId: string;
  createdAt: string;
}

/**
 * Generate a new K2 key (32 bytes) and key identifier
 */
export async function generateK2(nodeId: string): Promise<K2KeyPair> {
  const k2 = await randomBytes(32);
  const kidSuffix = await randomBytes(4); // 4 bytes for uniqueness
  const timestamp = new Date().toISOString().slice(0, 7).replace('-', ''); // YYYYMM
  const kid = `k2-${timestamp}-${kidSuffix.slice(0, 6)}`; // e.g., k2-202602-abc123

  return {
    k2,
    kid,
    nodeId,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Store K2 securely on the device
 */
export async function storeK2(keyPair: K2KeyPair): Promise<void> {
  const storageKey = `${K2_STORAGE_PREFIX}${keyPair.nodeId}`;
  const kidKey = `${KID_STORAGE_PREFIX}${keyPair.nodeId}`;

  await SecureStore.setItemAsync(storageKey, keyPair.k2);
  await SecureStore.setItemAsync(
    kidKey,
    JSON.stringify({
      kid: keyPair.kid,
      createdAt: keyPair.createdAt,
    })
  );
}

/**
 * Retrieve K2 for a specific node
 */
export async function getK2(nodeId: string): Promise<K2KeyPair | null> {
  const storageKey = `${K2_STORAGE_PREFIX}${nodeId}`;
  const kidKey = `${KID_STORAGE_PREFIX}${nodeId}`;

  const k2 = await SecureStore.getItemAsync(storageKey);
  const kidData = await SecureStore.getItemAsync(kidKey);

  if (!k2 || !kidData) {
    return null;
  }

  const { kid, createdAt } = JSON.parse(kidData);
  return { k2, kid, nodeId, createdAt };
}

/**
 * Check if we have K2 stored for a node
 */
export async function hasK2(nodeId: string): Promise<boolean> {
  const storageKey = `${K2_STORAGE_PREFIX}${nodeId}`;
  const k2 = await SecureStore.getItemAsync(storageKey);
  return k2 !== null;
}

/**
 * Delete K2 for a node (used when rotating keys)
 */
export async function deleteK2(nodeId: string): Promise<void> {
  const storageKey = `${K2_STORAGE_PREFIX}${nodeId}`;
  const kidKey = `${KID_STORAGE_PREFIX}${nodeId}`;

  await SecureStore.deleteItemAsync(storageKey);
  await SecureStore.deleteItemAsync(kidKey);
}

/**
 * Import K2 from a QR code payload (plain mode)
 */
export async function importK2FromPlainQR(payload: {
  node_id: string;
  kid: string;
  k2: string;
  created_at?: string;
}): Promise<K2KeyPair> {
  const keyPair: K2KeyPair = {
    k2: payload.k2,
    kid: payload.kid,
    nodeId: payload.node_id,
    createdAt: payload.created_at || new Date().toISOString(),
  };

  await storeK2(keyPair);
  return keyPair;
}

/**
 * List all stored node IDs with K2 keys
 */
export async function listStoredNodes(): Promise<string[]> {
  // SecureStore doesn't support listing keys, so we'd need to maintain
  // a separate index. For MVP, we rely on the provisioning flow.
  // This is a placeholder for future enhancement.
  return [];
}
