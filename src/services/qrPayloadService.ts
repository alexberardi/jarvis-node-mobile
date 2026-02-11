import { randomBytes, argon2id, aesGcmEncrypt } from 'jarvis-crypto';

import { K2KeyPair } from './k2Service';

// QR payload version
const PAYLOAD_VERSION = 1;

// Argon2id parameters for password-protected QR
// Using lower memory for mobile compatibility (19456 KiB = ~19 MiB)
// OWASP recommends minimum 19456 KiB for Argon2id
const ARGON2_PARAMS = {
  m: 19456, // ~19 MiB (mobile-friendly, OWASP minimum)
  t: 2,     // 2 iterations
  p: 1,     // 1 lane (single-threaded)
};

export interface PlainQRPayload {
  v: number;
  mode: 'plain';
  node_id: string;
  kid: string;
  k2: string;
  created_at?: string;
  cc_url?: string;
}

export interface EncryptedQRPayload {
  v: number;
  mode: 'enc';
  node_id: string;
  kid: string;
  kdf: 'argon2id';
  salt: string;
  params: { m: number; t: number; p: number };
  nonce: string;
  ciphertext: string;
  tag: string;
  created_at?: string;
  cc_url?: string;
}

export type QRPayload = PlainQRPayload | EncryptedQRPayload;

/**
 * Build the canonical AAD string for QR encryption
 * Format: {"v":1,"node_id":"...","kid":"..."}
 */
function buildCanonicalAAD(v: number, nodeId: string, kid: string): string {
  return `{"v":${v},"node_id":"${nodeId}","kid":"${kid}"}`;
}

/**
 * Generate a plain (unencrypted) QR payload
 */
export function generatePlainQRPayload(
  keyPair: K2KeyPair,
  commandCenterUrl?: string
): PlainQRPayload {
  return {
    v: PAYLOAD_VERSION,
    mode: 'plain',
    node_id: keyPair.nodeId,
    kid: keyPair.kid,
    k2: keyPair.k2,
    created_at: keyPair.createdAt,
    cc_url: commandCenterUrl,
  };
}

/**
 * Generate a password-protected (encrypted) QR payload
 */
export async function generateEncryptedQRPayload(
  keyPair: K2KeyPair,
  password: string,
  commandCenterUrl?: string
): Promise<EncryptedQRPayload> {
  // Generate random salt (16 bytes) and nonce (12 bytes for AES-GCM)
  const salt = await randomBytes(16);
  const nonce = await randomBytes(12);

  // Derive encryption key from password using Argon2id
  const derivedKey = await argon2id(password, salt, ARGON2_PARAMS);

  // Build AAD
  const aad = buildCanonicalAAD(PAYLOAD_VERSION, keyPair.nodeId, keyPair.kid);

  // Encrypt K2 with AES-256-GCM
  const { ciphertext, tag } = await aesGcmEncrypt(
    derivedKey,
    nonce,
    keyPair.k2,
    aad
  );

  return {
    v: PAYLOAD_VERSION,
    mode: 'enc',
    node_id: keyPair.nodeId,
    kid: keyPair.kid,
    kdf: 'argon2id',
    salt,
    params: ARGON2_PARAMS,
    nonce,
    ciphertext,
    tag,
    created_at: keyPair.createdAt,
    cc_url: commandCenterUrl,
  };
}

/**
 * Encode QR payload to base64url string for QR code
 */
export function encodeQRPayload(payload: QRPayload): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  return base64UrlEncode(bytes);
}

/**
 * Decode base64url QR content to payload
 */
export function decodeQRPayload(encoded: string): QRPayload {
  const bytes = base64UrlDecode(encoded);
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as QRPayload;
}

/**
 * Check if payload is encrypted
 */
export function isEncryptedPayload(
  payload: QRPayload
): payload is EncryptedQRPayload {
  return payload.mode === 'enc';
}

// Base64URL encoding/decoding helpers
function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  // Add padding
  let padded = str;
  const padding = (4 - (str.length % 4)) % 4;
  padded += '='.repeat(padding);

  // Convert base64url to base64
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');

  // Decode
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
