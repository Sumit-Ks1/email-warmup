/**
 * AES-256-GCM encryption for stored SMTP/IMAP credentials.
 *
 * Passwords are encrypted before they reach Supabase and decrypted only in
 * server memory at the moment a mail connection is opened. The stored format
 * is `iv:authTag:ciphertext` (hex) — identical to the legacy platform, so
 * values are portable if you migrate data.
 */

import crypto from 'node:crypto';
import { requireEnv } from './env';
import { ConfigError, HttpError } from './errors';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const ENCODING = 'hex' as const;

function getKey(): Buffer {
  const secret = requireEnv('ENCRYPTION_KEY');
  if (secret.length < 16) {
    throw new ConfigError('ENCRYPTION_KEY must be at least 16 characters long');
  }
  // SHA-256 normalizes any length secret into a 32-byte AES key
  return crypto.createHash('sha256').update(secret).digest();
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  let encrypted = cipher.update(plaintext, 'utf8', ENCODING);
  encrypted += cipher.final(ENCODING);
  const authTag = cipher.getAuthTag().toString(ENCODING);

  return `${iv.toString(ENCODING)}:${authTag}:${encrypted}`;
}

export function decrypt(encrypted: string): string {
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new HttpError(500, 'Stored credential has an invalid format');
  }

  const [ivHex, authTagHex, ciphertext] = parts;

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, ENCODING));
    decipher.setAuthTag(Buffer.from(authTagHex, ENCODING));

    let decrypted = decipher.update(ciphertext, ENCODING, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    throw new HttpError(
      500,
      'Could not decrypt stored credentials — was ENCRYPTION_KEY changed? Re-save the account passwords.',
    );
  }
}
