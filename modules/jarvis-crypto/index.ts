import { requireNativeModule } from 'expo-modules-core';

import type { Argon2Params, EncryptResult, JarvisCryptoModule } from './src/JarvisCrypto.types';

const NativeModule = requireNativeModule<JarvisCryptoModule>('JarvisCrypto');

export async function argon2id(
  password: string,
  salt: string,
  params: Argon2Params
): Promise<string> {
  return NativeModule.argon2id(password, salt, params);
}

export async function aesGcmEncrypt(
  key: string,
  iv: string,
  plaintext: string,
  aad: string
): Promise<EncryptResult> {
  return NativeModule.aesGcmEncrypt(key, iv, plaintext, aad);
}

export async function aesGcmDecrypt(
  key: string,
  iv: string,
  ciphertext: string,
  tag: string,
  aad: string
): Promise<string> {
  return NativeModule.aesGcmDecrypt(key, iv, ciphertext, tag, aad);
}

export async function randomBytes(length: number): Promise<string> {
  return NativeModule.randomBytes(length);
}

export type { Argon2Params, EncryptResult };
