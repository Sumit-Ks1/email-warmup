/**
 * Application configuration module.
 * Loads environment variables with validation and type safety.
 */

import dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] || fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // PostgreSQL
  db: {
    host: requireEnv('POSTGRES_HOST', 'localhost'),
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: requireEnv('POSTGRES_DB', 'warmup'),
    user: requireEnv('POSTGRES_USER', 'postgres'),
    password: requireEnv('POSTGRES_PASSWORD'),
  },

  // Encryption key for credentials (must be 32 bytes for AES-256)
  encryptionKey: requireEnv('ENCRYPTION_KEY'),

  // Groq AI
  groq: {
    apiKey: requireEnv('GROQ_API_KEY'),
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  },

  // Warm-up timing configuration
  warmup: {
    minDelayMs: 3 * 60 * 1000, // 3 minutes minimum between emails
    maxDelayMs: 5 * 60 * 1000, // 5 minutes maximum between emails
    imapIdleTimeoutMs: 10 * 60 * 1000, // 10 minutes IMAP IDLE timeout
    replyCheckIntervalMs: 15 * 1000, // 15 seconds between reply checks
    maxReplyWaitMs: 30 * 60 * 1000, // 30 minutes max wait for reply
  },
} as const;

export type Config = typeof config;
