export interface Argon2Params {
  m: number; // memory in KiB
  t: number; // iterations
  p: number; // parallelism
}

export interface EncryptResult {
  ciphertext: string; // base64url
  tag: string; // base64url
}

export interface JarvisCryptoModule {
  /**
   * Derive a key from password using Argon2id
   * @param password - User password (UTF-8 string)
   * @param salt - Salt bytes (base64url encoded)
   * @param params - Argon2id parameters
   * @returns 32-byte key as base64url
   */
  argon2id(password: string, salt: string, params: Argon2Params): Promise<string>;

  /**
   * Encrypt plaintext using AES-256-GCM
   * @param key - 32-byte key (base64url)
   * @param iv - 12-byte IV/nonce (base64url)
   * @param plaintext - Data to encrypt (base64url)
   * @param aad - Associated authenticated data (UTF-8 string)
   * @returns Ciphertext and authentication tag
   */
  aesGcmEncrypt(
    key: string,
    iv: string,
    plaintext: string,
    aad: string
  ): Promise<EncryptResult>;

  /**
   * Decrypt ciphertext using AES-256-GCM
   * @param key - 32-byte key (base64url)
   * @param iv - 12-byte IV/nonce (base64url)
   * @param ciphertext - Encrypted data (base64url)
   * @param tag - Authentication tag (base64url)
   * @param aad - Associated authenticated data (UTF-8 string)
   * @returns Decrypted plaintext as base64url
   * @throws Error on authentication failure
   */
  aesGcmDecrypt(
    key: string,
    iv: string,
    ciphertext: string,
    tag: string,
    aad: string
  ): Promise<string>;

  /**
   * Generate cryptographically secure random bytes
   * @param length - Number of bytes to generate
   * @returns Random bytes as base64url
   */
  randomBytes(length: number): Promise<string>;
}
