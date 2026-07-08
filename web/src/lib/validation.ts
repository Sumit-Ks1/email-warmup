/**
 * Zod schemas for every API input. Nothing reaches the database or the mail
 * services without passing through these.
 */

import { z } from 'zod';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOST_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(EMAIL_RE, 'Invalid email address');

export const uuidSchema = z.string().trim().regex(UUID_RE, 'Invalid id');

const hostSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Host is required')
  .max(253)
  .regex(HOST_RE, 'Invalid host name');

const portSchema = z.coerce.number().int().min(1).max(65535);

const passwordSchema = z.string().min(1, 'Password is required').max(256);

const nameSchema = z.string().trim().min(1, 'Sender name is required').max(100);

export const accountCreateSchema = z.object({
  sender_name: nameSchema,
  email: emailSchema,
  smtp_host: hostSchema,
  smtp_port: portSchema,
  smtp_secure: z.boolean().default(true),
  smtp_password: passwordSchema,
  imap_host: hostSchema,
  imap_port: portSchema,
  imap_secure: z.boolean().default(true),
  imap_password: passwordSchema,
});

export const domainAccountCreateSchema = accountCreateSchema.extend({
  auto_warmup: z.boolean().optional(),
});

/**
 * Updates are partial; empty-string passwords are stripped by the route
 * before parsing (meaning "keep the existing password").
 */
export const accountUpdateSchema = accountCreateSchema.partial();

export const domainAccountUpdateSchema = domainAccountCreateSchema.partial();

export const testConnectionSchema = z.object({
  type: z.enum(['smtp', 'imap']),
  host: hostSchema,
  port: portSchema,
  secure: z.boolean().default(true),
  email: emailSchema,
  password: passwordSchema,
});

export const warmupControlSchema = z.object({
  domain_account_id: uuidSchema,
});

export function clampLimit(raw: string | null, fallback: number, max: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (Number.isNaN(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}
