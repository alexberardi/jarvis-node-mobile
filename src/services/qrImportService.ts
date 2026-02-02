import { argon2id, aesGcmDecrypt } from 'jarvis-crypto';

import { storeK2, K2KeyPair } from './k2Service';
import {
  decodeQRPayload,
  isEncryptedPayload,
  QRPayload,
  EncryptedQRPayload,
} from './qrPayloadService';

export interface ImportResult {
  success: boolean;
  keyPair?: K2KeyPair;
  nodeId?: string;
  error?: string;
  requiresPassword?: boolean;
  payload?: QRPayload;
}

/**
 * Build the canonical AAD string for QR decryption
 */
function buildCanonicalAAD(v: number, nodeId: string, kid: string): string {
  return `{"v":${v},"node_id":"${nodeId}","kid":"${kid}"}`;
}

/**
 * Parse and validate a scanned QR code
 * Returns the payload and whether it requires a password
 */
export function parseQRCode(qrData: string): ImportResult {
  try {
    const payload = decodeQRPayload(qrData);

    // Validate required fields
    if (!payload.v || !payload.mode || !payload.node_id || !payload.kid) {
      return {
        success: false,
        error: 'Invalid QR code: missing required fields',
      };
    }

    // Check version
    if (payload.v !== 1) {
      return {
        success: false,
        error: `Unsupported QR code version: ${payload.v}`,
      };
    }

    if (isEncryptedPayload(payload)) {
      return {
        success: true,
        requiresPassword: true,
        nodeId: payload.node_id,
        payload,
      };
    }

    // Plain QR - k2 should be present
    if (!('k2' in payload) || !payload.k2) {
      return {
        success: false,
        error: 'Invalid QR code: missing key data',
      };
    }

    return {
      success: true,
      requiresPassword: false,
      nodeId: payload.node_id,
      payload,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to parse QR code',
    };
  }
}

/**
 * Import K2 from a plain (unencrypted) QR payload
 */
export async function importPlainQR(payload: QRPayload): Promise<ImportResult> {
  if (isEncryptedPayload(payload)) {
    return {
      success: false,
      error: 'This QR code is encrypted and requires a password',
      requiresPassword: true,
      payload,
    };
  }

  try {
    const keyPair: K2KeyPair = {
      k2: payload.k2,
      kid: payload.kid,
      nodeId: payload.node_id,
      createdAt: payload.created_at || new Date().toISOString(),
    };

    await storeK2(keyPair);

    return {
      success: true,
      keyPair,
      nodeId: payload.node_id,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to import key',
    };
  }
}

/**
 * Import K2 from an encrypted QR payload using a password
 */
export async function importEncryptedQR(
  payload: EncryptedQRPayload,
  password: string
): Promise<ImportResult> {
  try {
    // Validate KDF
    if (payload.kdf !== 'argon2id') {
      return {
        success: false,
        error: `Unsupported KDF: ${payload.kdf}`,
      };
    }

    // Derive key from password
    const derivedKey = await argon2id(password, payload.salt, payload.params);

    // Build AAD
    const aad = buildCanonicalAAD(payload.v, payload.node_id, payload.kid);

    // Decrypt K2
    let k2: string;
    try {
      k2 = await aesGcmDecrypt(
        derivedKey,
        payload.nonce,
        payload.ciphertext,
        payload.tag,
        aad
      );
    } catch {
      return {
        success: false,
        error: 'Incorrect password or corrupted QR code',
      };
    }

    const keyPair: K2KeyPair = {
      k2,
      kid: payload.kid,
      nodeId: payload.node_id,
      createdAt: payload.created_at || new Date().toISOString(),
    };

    await storeK2(keyPair);

    return {
      success: true,
      keyPair,
      nodeId: payload.node_id,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to decrypt key',
    };
  }
}

/**
 * Unified import function - handles both plain and encrypted QR codes
 */
export async function importFromQR(
  qrData: string,
  password?: string
): Promise<ImportResult> {
  const parseResult = parseQRCode(qrData);

  if (!parseResult.success) {
    return parseResult;
  }

  if (!parseResult.payload) {
    return {
      success: false,
      error: 'No payload found',
    };
  }

  if (parseResult.requiresPassword) {
    if (!password) {
      return {
        success: false,
        requiresPassword: true,
        nodeId: parseResult.nodeId,
        payload: parseResult.payload,
        error: 'Password required',
      };
    }

    return importEncryptedQR(
      parseResult.payload as EncryptedQRPayload,
      password
    );
  }

  return importPlainQR(parseResult.payload);
}
