/**
 * Environment variable access with clear failure messages.
 *
 * Every secret lives ONLY on the server (no NEXT_PUBLIC_* values are used
 * anywhere in this project) — the browser bundle contains zero knowledge of
 * Supabase, keys, or credentials.
 */

import { ConfigError } from './errors';

export const REQUIRED_ENV_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ENCRYPTION_KEY',
  'CRON_SECRET',
] as const;

export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new ConfigError(
      `Server is not configured: missing the ${key} environment variable`,
    );
  }
  return value;
}

export function optionalEnv(key: string, fallback = ''): string {
  const value = process.env[key];
  return value && value.trim() !== '' ? value : fallback;
}

/** List of required env vars that are currently missing (for health checks). */
export function missingEnv(): string[] {
  return REQUIRED_ENV_KEYS.filter((key) => {
    const value = process.env[key];
    return !value || value.trim() === '';
  });
}
