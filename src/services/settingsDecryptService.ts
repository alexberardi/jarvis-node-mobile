import { aesGcmDecrypt } from 'jarvis-crypto';

import { getK2 } from './k2Service';
import type { AuthenticationConfig } from '../types/SmartHome';

export interface CommandSecretEntry {
  key: string;
  scope: string;
  description: string;
  value_type: string;
  required: boolean;
  is_sensitive: boolean;
  is_set: boolean;
  value?: string;
  friendly_name?: string;
}

export interface CommandParameterEntry {
  name: string;
  type: string;        // 'str', 'int', 'float', 'bool', 'array', 'datetime', etc.
  description: string | null;
  required: boolean;
  default_value: string | null;
  enum_values: string[] | null;
}

export interface CommandSettingsEntry {
  command_name: string;
  description: string;
  secrets: CommandSecretEntry[];
  associated_service?: string;
  setup_guide?: string;
  authentication?: AuthenticationConfig;
  enabled?: boolean;
  parameters?: CommandParameterEntry[];
}

export interface DeviceFamilyEntry {
  family_name: string;
  friendly_name: string;
  description: string;
  connection_type: 'lan' | 'cloud' | 'hybrid';
  supported_domains: string[];
  secrets: CommandSecretEntry[];
  authentication?: AuthenticationConfig;
  is_configured: boolean;
}

export interface DeviceManagerEntry {
  manager_name: string;
  friendly_name: string;
  description: string;
  can_edit_devices: boolean;
  is_available: boolean;
  secrets: CommandSecretEntry[];
  authentication?: AuthenticationConfig;
}

export interface SettingsSnapshot {
  schema_version: number;
  commands_schema_version: number;
  commands: CommandSettingsEntry[];
  device_families?: DeviceFamilyEntry[];
  device_managers?: DeviceManagerEntry[];
}

/**
 * Base64url-decode a string to raw bytes, then re-encode as UTF-8 string.
 * Used to reverse the node's base64url(JSON) encoding.
 */
function base64UrlDecode(str: string): string {
  let padded = str;
  const padding = (4 - (str.length % 4)) % 4;
  padded += '='.repeat(padding);
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  return binary;
}

/**
 * Decrypt a settings snapshot using K2.
 *
 * The node encrypts: base64url(JSON) -> AES-256-GCM -> ciphertext + tag
 * AAD format: "{nodeId}:settings:snapshot"
 *
 * After GCM decrypt we get the base64url-encoded JSON,
 * which we decode then parse.
 */
export async function decryptSettingsSnapshot(
  nodeId: string,
  ciphertext: string,
  nonce: string,
  tag: string,
): Promise<SettingsSnapshot> {
  const k2 = await getK2(nodeId);
  if (!k2) {
    throw new Error(`No K2 key found for node ${nodeId}`);
  }

  const aad = `${nodeId}:settings:snapshot`;

  // aesGcmDecrypt returns base64url-encoded plaintext (native bridge encoding)
  const plaintextB64url = await aesGcmDecrypt(k2.k2, nonce, ciphertext, tag, aad);

  // Decode base64url to get raw JSON string
  const jsonStr = base64UrlDecode(plaintextB64url);

  return JSON.parse(jsonStr);
}
