/**
 * Typed data access over the Supabase admin client.
 *
 * Account list/read queries select an explicit column list that excludes the
 * password columns — secrets can't accidentally serialize into an API
 * response. Only `getSecret` (used by the engine and never returned to the
 * browser) reads full rows.
 */

import type { PostgrestError } from '@supabase/supabase-js';
import { HttpError } from './errors';
import { supabaseAdmin } from './supabase';
import type {
  DomainAccountRow,
  DomainAccountStatus,
  LeadAccountRow,
  MailDirection,
  MailLogRow,
  PublicDomainAccount,
  PublicLeadAccount,
  WarmupSessionRow,
} from './types';

const ACCOUNT_PUBLIC_COLUMNS =
  'id,sender_name,email,smtp_host,smtp_port,smtp_secure,imap_host,imap_port,imap_secure,created_at,updated_at';
const DOMAIN_PUBLIC_COLUMNS = `${ACCOUNT_PUBLIC_COLUMNS},status,auto_warmup`;

function db() {
  return supabaseAdmin();
}

function raise(error: PostgrestError, action: string): never {
  if (error.code === '23505') {
    throw new HttpError(409, 'An account with this email already exists');
  }
  console.error(`[db] ${action} failed:`, error.code, error.message);
  throw new HttpError(500, `Database error while ${action}`);
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Domain accounts
// ---------------------------------------------------------------------------

export const domainAccounts = {
  async list(): Promise<PublicDomainAccount[]> {
    const { data, error } = await db()
      .from('domain_accounts')
      .select(DOMAIN_PUBLIC_COLUMNS)
      .order('created_at', { ascending: true });
    if (error) raise(error, 'listing domain accounts');
    return (data ?? []) as unknown as PublicDomainAccount[];
  },

  async getPublic(id: string): Promise<PublicDomainAccount | null> {
    const { data, error } = await db()
      .from('domain_accounts')
      .select(DOMAIN_PUBLIC_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) raise(error, 'loading the domain account');
    return data as unknown as PublicDomainAccount | null;
  },

  async getSecret(id: string): Promise<DomainAccountRow | null> {
    const { data, error } = await db().from('domain_accounts').select('*').eq('id', id).maybeSingle();
    if (error) raise(error, 'loading the domain account');
    return data as DomainAccountRow | null;
  },

  async create(row: Record<string, unknown>): Promise<PublicDomainAccount> {
    const { data, error } = await db()
      .from('domain_accounts')
      .insert(row)
      .select(DOMAIN_PUBLIC_COLUMNS)
      .single();
    if (error) raise(error, 'creating the domain account');
    return data as unknown as PublicDomainAccount;
  },

  async update(id: string, patch: Record<string, unknown>): Promise<PublicDomainAccount | null> {
    const { data, error } = await db()
      .from('domain_accounts')
      .update(patch)
      .eq('id', id)
      .select(DOMAIN_PUBLIC_COLUMNS)
      .maybeSingle();
    if (error) raise(error, 'updating the domain account');
    return data as unknown as PublicDomainAccount | null;
  },

  async remove(id: string): Promise<boolean> {
    const { data, error } = await db().from('domain_accounts').delete().eq('id', id).select('id');
    if (error) raise(error, 'deleting the domain account');
    return (data ?? []).length > 0;
  },

  async setStatus(id: string, status: DomainAccountStatus): Promise<void> {
    const { error } = await db().from('domain_accounts').update({ status }).eq('id', id);
    if (error) raise(error, 'updating the domain account status');
  },

  async listAutoWarmupIds(): Promise<string[]> {
    const { data, error } = await db()
      .from('domain_accounts')
      .select('id')
      .eq('auto_warmup', true);
    if (error) raise(error, 'listing auto warm-up accounts');
    return ((data ?? []) as { id: string }[]).map((row) => row.id);
  },
};

// ---------------------------------------------------------------------------
// Lead accounts
// ---------------------------------------------------------------------------

export const leadAccounts = {
  async list(): Promise<PublicLeadAccount[]> {
    const { data, error } = await db()
      .from('lead_accounts')
      .select(ACCOUNT_PUBLIC_COLUMNS)
      .order('created_at', { ascending: true });
    if (error) raise(error, 'listing lead accounts');
    return (data ?? []) as unknown as PublicLeadAccount[];
  },

  async getPublic(id: string): Promise<PublicLeadAccount | null> {
    const { data, error } = await db()
      .from('lead_accounts')
      .select(ACCOUNT_PUBLIC_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) raise(error, 'loading the lead account');
    return data as unknown as PublicLeadAccount | null;
  },

  async getSecret(id: string): Promise<LeadAccountRow | null> {
    const { data, error } = await db().from('lead_accounts').select('*').eq('id', id).maybeSingle();
    if (error) raise(error, 'loading the lead account');
    return data as LeadAccountRow | null;
  },

  async listIds(): Promise<string[]> {
    const { data, error } = await db()
      .from('lead_accounts')
      .select('id')
      .order('created_at', { ascending: true });
    if (error) raise(error, 'listing lead accounts');
    return ((data ?? []) as { id: string }[]).map((row) => row.id);
  },

  async create(row: Record<string, unknown>): Promise<PublicLeadAccount> {
    const { data, error } = await db()
      .from('lead_accounts')
      .insert(row)
      .select(ACCOUNT_PUBLIC_COLUMNS)
      .single();
    if (error) raise(error, 'creating the lead account');
    return data as unknown as PublicLeadAccount;
  },

  async update(id: string, patch: Record<string, unknown>): Promise<PublicLeadAccount | null> {
    const { data, error } = await db()
      .from('lead_accounts')
      .update(patch)
      .eq('id', id)
      .select(ACCOUNT_PUBLIC_COLUMNS)
      .maybeSingle();
    if (error) raise(error, 'updating the lead account');
    return data as unknown as PublicLeadAccount | null;
  },

  async remove(id: string): Promise<boolean> {
    const { data, error } = await db().from('lead_accounts').delete().eq('id', id).select('id');
    if (error) raise(error, 'deleting the lead account');
    return (data ?? []).length > 0;
  },
};

// ---------------------------------------------------------------------------
// Warm-up sessions
// ---------------------------------------------------------------------------

export const sessions = {
  async todayFor(domainAccountId: string): Promise<WarmupSessionRow | null> {
    const { data, error } = await db()
      .from('warmup_sessions')
      .select('*')
      .eq('domain_account_id', domainAccountId)
      .eq('session_date', todayUtc())
      .maybeSingle();
    if (error) raise(error, 'loading the warm-up session');
    return data as WarmupSessionRow | null;
  },

  async getById(id: string): Promise<WarmupSessionRow | null> {
    const { data, error } = await db().from('warmup_sessions').select('*').eq('id', id).maybeSingle();
    if (error) raise(error, 'loading the warm-up session');
    return data as WarmupSessionRow | null;
  },

  async listForDomain(domainAccountId: string, limit = 30): Promise<WarmupSessionRow[]> {
    const { data, error } = await db()
      .from('warmup_sessions')
      .select('*')
      .eq('domain_account_id', domainAccountId)
      .order('session_date', { ascending: false })
      .limit(limit);
    if (error) raise(error, 'listing warm-up sessions');
    return (data ?? []) as WarmupSessionRow[];
  },

  async create(row: Record<string, unknown>): Promise<WarmupSessionRow> {
    const { data, error } = await db().from('warmup_sessions').insert(row).select('*').single();
    if (error) raise(error, 'creating the warm-up session');
    return data as WarmupSessionRow;
  },

  async update(id: string, patch: Record<string, unknown>): Promise<WarmupSessionRow> {
    const { data, error } = await db()
      .from('warmup_sessions')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) raise(error, 'updating the warm-up session');
    return data as WarmupSessionRow;
  },
};

// ---------------------------------------------------------------------------
// Mail logs
// ---------------------------------------------------------------------------

export interface NewMailLog {
  session_id: string | null;
  from_email: string;
  to_email: string;
  subject: string;
  body?: string | null;
  message_id?: string | null;
  in_reply_to?: string | null;
  direction: MailDirection;
  lead_index?: number | null;
}

export const mailLogs = {
  async insert(entry: NewMailLog): Promise<void> {
    const { error } = await db().from('mail_logs').insert(entry);
    // Logging must never break the mail flow — record and continue.
    if (error) console.error('[db] mail log insert failed:', error.message);
  },

  async recent(limit = 50): Promise<MailLogRow[]> {
    const { data, error } = await db()
      .from('mail_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) raise(error, 'listing mail logs');
    return (data ?? []) as MailLogRow[];
  },

  async bySession(sessionId: string): Promise<MailLogRow[]> {
    const { data, error } = await db()
      .from('mail_logs')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    if (error) raise(error, 'listing session mail logs');
    return (data ?? []) as MailLogRow[];
  },
};
