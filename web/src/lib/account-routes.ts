/**
 * Shared route-handler factory for the two account collections
 * (domain accounts and lead accounts) — identical logic, different repo.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { encrypt } from './crypto';
import { HttpError } from './errors';
import { apiHandler, jsonOk, readJson } from './http';
import { assertMailPort, assertPublicMailHost } from './net-guard';
import { enforceRateLimit, LIMITS } from './rate-limit';
import { domainAccounts, leadAccounts } from './repos';
import {
  accountCreateSchema,
  accountUpdateSchema,
  domainAccountCreateSchema,
  domainAccountUpdateSchema,
  uuidSchema,
} from './validation';

type Kind = 'domain' | 'lead';

interface AccountRepo {
  list(): Promise<unknown[]>;
  getPublic(id: string): Promise<unknown | null>;
  create(row: Record<string, unknown>): Promise<unknown>;
  update(id: string, patch: Record<string, unknown>): Promise<unknown | null>;
  remove(id: string): Promise<boolean>;
}

function repoFor(kind: Kind): AccountRepo {
  return kind === 'domain' ? domainAccounts : leadAccounts;
}

const looseBodySchema = z.record(z.string(), z.unknown());

interface HostFields {
  smtp_host?: string;
  smtp_port?: number;
  imap_host?: string;
  imap_port?: number;
}

/** SSRF guard: hosts are checked both when testing AND when stored. */
async function guardHosts(fields: HostFields): Promise<void> {
  if (fields.smtp_port !== undefined) assertMailPort(fields.smtp_port);
  if (fields.imap_port !== undefined) assertMailPort(fields.imap_port);
  if (fields.smtp_host) await assertPublicMailHost(fields.smtp_host);
  if (fields.imap_host) await assertPublicMailHost(fields.imap_host);
}

export function accountCollectionHandlers(kind: Kind) {
  const repo = repoFor(kind);
  const createSchema = kind === 'domain' ? domainAccountCreateSchema : accountCreateSchema;

  const GET = apiHandler(async (req) => {
    await enforceRateLimit(req, LIMITS.read);
    return jsonOk(await repo.list());
  });

  const POST = apiHandler(async (req) => {
    await enforceRateLimit(req, LIMITS.mutate);
    const input = await readJson(req, createSchema);
    await guardHosts(input);

    const account = await repo.create({
      ...input,
      smtp_password: encrypt(input.smtp_password),
      imap_password: encrypt(input.imap_password),
    });
    return jsonOk(account, 'Account created', 201);
  });

  return { GET, POST };
}

export function accountItemHandlers(kind: Kind) {
  const repo = repoFor(kind);
  const updateSchema = kind === 'domain' ? domainAccountUpdateSchema : accountUpdateSchema;

  async function readId(ctx: { params: Promise<Record<string, string>> }): Promise<string> {
    const { id } = await ctx.params;
    return uuidSchema.parse(id);
  }

  const GET = apiHandler(async (req, ctx) => {
    await enforceRateLimit(req, LIMITS.read);
    const id = await readId(ctx);
    const account = await repo.getPublic(id);
    if (!account) throw new HttpError(404, 'Account not found');
    return jsonOk(account);
  });

  const PUT = apiHandler(async (req, ctx): Promise<NextResponse> => {
    await enforceRateLimit(req, LIMITS.mutate);
    const id = await readId(ctx);

    // Empty password fields mean "keep the stored password"
    const raw = await readJson(req, looseBodySchema);
    for (const key of ['smtp_password', 'imap_password']) {
      if (typeof raw[key] !== 'string' || raw[key] === '') delete raw[key];
    }
    const input = updateSchema.parse(raw);
    await guardHosts(input);

    const patch: Record<string, unknown> = { ...input };
    if (typeof input.smtp_password === 'string') patch.smtp_password = encrypt(input.smtp_password);
    if (typeof input.imap_password === 'string') patch.imap_password = encrypt(input.imap_password);
    if (Object.keys(patch).length === 0) throw new HttpError(400, 'Nothing to update');

    const account = await repo.update(id, patch);
    if (!account) throw new HttpError(404, 'Account not found');
    return jsonOk(account, 'Account updated');
  });

  const DELETE = apiHandler(async (req, ctx) => {
    await enforceRateLimit(req, LIMITS.mutate);
    const id = await readId(ctx);
    const removed = await repo.remove(id);
    if (!removed) throw new HttpError(404, 'Account not found');
    return jsonOk(null, 'Account deleted');
  });

  return { GET, PUT, DELETE };
}
