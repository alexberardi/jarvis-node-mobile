import { aesGcmEncrypt, randomBytes } from 'jarvis-crypto';

import { getK2 } from './k2Service';
import { pushConfigToNode } from '../api/smartHomeApi';

/**
 * Base64url-encode a UTF-8 string (no padding).
 */
const utf8ToBase64url = (str: string): string => {
  // TextEncoder is available in React Native hermes
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

/**
 * Encrypt config data with K2 and push to a node via CC.
 *
 * @param nodeId - Target node
 * @param configType - e.g. "home_assistant"
 * @param configData - Plain object to encrypt (will be JSON-stringified)
 */
export const encryptAndPushConfig = async (
  nodeId: string,
  configType: string,
  configData: Record<string, string>,
): Promise<void> => {
  const k2 = await getK2(nodeId);
  if (!k2) {
    throw new Error(`No K2 key found for node ${nodeId}`);
  }

  // Generate 12-byte nonce
  const nonce = await randomBytes(12);

  // Encode plaintext as base64url
  const plaintext = utf8ToBase64url(JSON.stringify(configData));

  // AAD binds the ciphertext to the node and config type
  const aad = `${nodeId}:${configType}`;

  // Encrypt with AES-256-GCM
  const { ciphertext, tag } = await aesGcmEncrypt(k2.k2, nonce, plaintext, aad);

  // Push to CC (which relays via MQTT to node)
  await pushConfigToNode(
    nodeId,
    { config_type: configType, ciphertext, nonce, tag },
  );
};
