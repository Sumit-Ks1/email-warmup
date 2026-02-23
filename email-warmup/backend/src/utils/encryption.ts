/**
 * AES-256-GCM encryption utilities for credential storage.
 * 
 * All SMTP/IMAP passwords are encrypted before database storage
 * and decrypted only when needed for mail operations.
 */

import crypto from 'crypto';
import { config } from '../config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const ENCODING = 'hex';

/**
 * Derive a 32-byte key from the configured encryption key.
 * Uses SHA-256 to normalize key length.
 */
function getKey(): Buffer {
  return crypto.createHash('sha256').update(config.encryptionKey).digest();
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns format: iv:authTag:ciphertext (all hex-encoded)
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', ENCODING);
  encrypted += cipher.final(ENCODING);

  const authTag = cipher.getAuthTag().toString(ENCODING);

  // Format: iv:authTag:ciphertext
  return `${iv.toString(ENCODING)}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 * Expects format: iv:authTag:ciphertext
 */
export function decrypt(encrypted: string): string {
  const key = getKey();
  const parts = encrypted.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const [ivHex, authTagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex, ENCODING);
  const authTag = Buffer.from(authTagHex, ENCODING);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, ENCODING, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
