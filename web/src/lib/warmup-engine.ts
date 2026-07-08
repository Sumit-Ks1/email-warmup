/**
 * Warm-up engine — a fully stateless, database-driven state machine.
 *
 * The legacy platform kept sessions alive inside a long-running Express
 * process (IMAP IDLE listeners + setTimeout chains). Serverless functions
 * can't do that, so every bit of state lives in the `warmup_sessions` row and
 * progress happens in small steps whenever /api/cron/tick fires (once per
 * minute via Supabase pg_cron).
 *
 * Per-lead conversation flow (identical behavior to the legacy engine):
 *
 *   send_intro  — generate an email (Groq or fallback templates) and send it
 *                 from the domain mailbox to the current lead        [SMTP]
 *   await_intro — poll the lead's inbox until the intro arrives; give up
 *                 after 10 minutes and skip the lead                 [IMAP]
 *   send_reply  — after a random 3–5 minute "human" delay, send the lead's
 *                 AI-generated reply back, threaded via In-Reply-To  [SMTP]
 *   await_reply — poll the domain's inbox until the reply arrives, then
 *                 advance to the next lead after another 3–5 minutes [IMAP]
 *
 * Overlapping ticks are safe: sessions are claimed atomically through the
 * `claim_due_sessions` RPC (FOR UPDATE SKIP LOCKED + a lease column).
 */

import { generateIntroEmail, generateReplyEmail } from './ai';
import { decrypt } from './crypto';
import { HttpError } from './errors';
import { fetchUnseenFrom, type ImapTarget } from './imap';
import { sendMail, type SmtpTarget } from './mailer';
import { domainAccounts, leadAccounts, mailLogs, sessions } from './repos';
import { supabaseAdmin } from './supabase';
import type {
  DomainAccountRow,
  LeadAccountRow,
  WarmupSessionRow,
  WarmupStatusPayload,
} from './types';

// Timing (mirrors the legacy configuration)
const MIN_STEP_DELAY_MS = 3 * 60_000; // human-like pause: 3 minutes…
const MAX_STEP_DELAY_MS = 5 * 60_000; // …to 5 minutes
const DELIVERY_TIMEOUT_MS = 10 * 60_000; // give up waiting after 10 minutes
const POLL_RETRY_MS = 45_000; // re-poll roughly every tick
const SKIP_ADVANCE_MS = 10_000; // short pause after skipping a lead
const ERROR_RETRY_MS = 90_000; // wait before retrying a failed step
const MAX_STEP_ATTEMPTS = 3;

// Tick execution limits (must fit inside the serverless maxDuration)
const TICK_BUDGET_MS = 40_000;
const CLAIM_BATCH = 6;
const CLAIM_LEASE_SECONDS = 180;
const AUTO_START_EARLIEST_UTC_HOUR = 7;

function nowIso(): string {
  return new Date().toISOString();
}

function inMs(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

function randomDelayMs(): number {
  return Math.floor(Math.random() * (MAX_STEP_DELAY_MS - MIN_STEP_DELAY_MS + 1)) + MIN_STEP_DELAY_MS;
}

function normalizeEmail(value: string): string {
  return value.toLowerCase().replace(/[<>\s]/g, '');
}

function smtpTarget(account: DomainAccountRow | LeadAccountRow): SmtpTarget {
  return {
    host: account.smtp_host,
    port: account.smtp_port,
    secure: account.smtp_secure,
    email: account.email,
    password: decrypt(account.smtp_password),
    senderName: account.sender_name,
  };
}

function imapTarget(account: DomainAccountRow | LeadAccountRow): ImapTarget {
  return {
    host: account.imap_host,
    port: account.imap_port,
    secure: account.imap_secure,
    email: account.email,
    password: decrypt(account.imap_password),
  };
}

// ---------------------------------------------------------------------------
// User-facing session controls
// ---------------------------------------------------------------------------

function mergeLeadIds(existing: string[], current: string[]): string[] {
  const seen = new Set(existing);
  return existing.concat(current.filter((id) => !seen.has(id)));
}

export async function startWarmup(domainAccountId: string): Promise<WarmupSessionRow> {
  const account = await domainAccounts.getPublic(domainAccountId);
  if (!account) throw new HttpError(404, 'Domain account not found');

  const leadIds = await leadAccounts.listIds();
  if (leadIds.length === 0) {
    throw new HttpError(400, 'No lead accounts configured. Add at least one lead mailbox first.');
  }

  const existing = await sessions.todayFor(domainAccountId);

  if (!existing) {
    const created = await sessions.create({
      domain_account_id: domainAccountId,
      lead_ids: leadIds,
      status: 'in_progress',
      step: 'send_intro',
      next_action_at: nowIso(),
    });
    await domainAccounts.setStatus(domainAccountId, 'running');
    return created;
  }

  if (existing.status === 'in_progress') {
    throw new HttpError(409, 'A warm-up session is already running for this mailbox today');
  }

  const mergedLeads = mergeLeadIds(existing.lead_ids, leadIds);

  if (existing.status === 'completed') {
    if (mergedLeads.length <= existing.lead_ids.length) {
      throw new HttpError(
        409,
        `All ${existing.lead_ids.length} warm-up conversations are already completed for today. ` +
          'Add more lead mailboxes or start again tomorrow.',
      );
    }
    // New leads appeared after completion → continue with just the new ones
    const resumed = await sessions.update(existing.id, {
      status: 'in_progress',
      step: 'send_intro',
      lead_ids: mergedLeads,
      completed_at: null,
      error_message: null,
      step_attempts: 0,
      step_deadline_at: null,
      claimed_until: null,
      next_action_at: nowIso(),
    });
    await domainAccounts.setStatus(domainAccountId, 'running');
    return resumed;
  }

  // paused / stopped / failed → resume where we left off
  if (existing.current_lead_index >= mergedLeads.length) {
    throw new HttpError(
      409,
      'All warm-up conversations are already completed for today. Add more lead mailboxes or start again tomorrow.',
    );
  }

  const patch: Record<string, unknown> = {
    status: 'in_progress',
    lead_ids: mergedLeads,
    error_message: null,
    step_attempts: 0,
    claimed_until: null,
    next_action_at: nowIso(),
  };
  // Awaiting steps get a fresh delivery deadline measured from the resume
  if (existing.step === 'await_intro' || existing.step === 'await_reply') {
    patch.step_deadline_at = inMs(DELIVERY_TIMEOUT_MS);
  }

  const resumed = await sessions.update(existing.id, patch);
  await domainAccounts.setStatus(domainAccountId, 'running');
  return resumed;
}

export async function pauseWarmup(domainAccountId: string): Promise<WarmupSessionRow> {
  const existing = await sessions.todayFor(domainAccountId);
  if (!existing || existing.status !== 'in_progress') {
    throw new HttpError(409, 'No running warm-up session found for this mailbox');
  }
  const paused = await sessions.update(existing.id, { status: 'paused', claimed_until: null });
  await domainAccounts.setStatus(domainAccountId, 'paused');
  return paused;
}

export async function resumeWarmup(domainAccountId: string): Promise<WarmupSessionRow> {
  return startWarmup(domainAccountId);
}

export async function stopWarmup(domainAccountId: string): Promise<WarmupSessionRow> {
  const existing = await sessions.todayFor(domainAccountId);
  if (!existing || (existing.status !== 'in_progress' && existing.status !== 'paused')) {
    throw new HttpError(409, 'No active warm-up session to stop');
  }
  const stopped = await sessions.update(existing.id, {
    status: 'stopped',
    error_message: 'Manually stopped by user',
    claimed_until: null,
  });
  await domainAccounts.setStatus(domainAccountId, 'idle');
  return stopped;
}

export async function getWarmupStatus(domainAccountId: string): Promise<WarmupStatusPayload> {
  const account = await domainAccounts.getPublic(domainAccountId);
  if (!account) throw new HttpError(404, 'Domain account not found');

  const [session, leadIds] = await Promise.all([
    sessions.todayFor(domainAccountId),
    leadAccounts.listIds(),
  ]);

  if (!session) {
    return {
      session: null,
      completedToday: false,
      newLeadsAvailable: false,
      totalLeadsConfigured: leadIds.length,
    };
  }

  const newLeadsAvailable = leadIds.some((id) => !session.lead_ids.includes(id));
  return {
    session,
    completedToday: session.status === 'completed' && !newLeadsAvailable,
    newLeadsAvailable,
    totalLeadsConfigured: leadIds.length,
  };
}

// ---------------------------------------------------------------------------
// Tick — called once per minute by pg_cron via /api/cron/tick
// ---------------------------------------------------------------------------

export interface TickSummary {
  autoStarted: number;
  claimed: number;
  processed: { session: string; step: string; result: string }[];
}

export async function runTick(): Promise<TickSummary> {
  const startedAt = Date.now();
  const summary: TickSummary = { autoStarted: 0, claimed: 0, processed: [] };

  try {
    summary.autoStarted = await autoStartSessions();
  } catch (error) {
    console.error('[tick] auto-start failed:', error);
  }

  const { data, error } = await supabaseAdmin().rpc('claim_due_sessions', {
    p_limit: CLAIM_BATCH,
    p_lease_seconds: CLAIM_LEASE_SECONDS,
  });
  if (error) throw new HttpError(500, `Could not claim due sessions: ${error.message}`);

  const claimed = (data ?? []) as WarmupSessionRow[];
  summary.claimed = claimed.length;

  for (const session of claimed) {
    if (Date.now() - startedAt > TICK_BUDGET_MS) {
      // Out of budget — release so the next tick picks it up immediately.
      await sessions.update(session.id, { claimed_until: null }).catch(() => undefined);
      summary.processed.push({ session: session.id, step: session.step, result: 'deferred' });
      continue;
    }

    let result: string;
    try {
      result = await processSession(session);
    } catch (err) {
      result = await handleStepError(session, err as Error);
    }
    summary.processed.push({ session: session.id, step: session.step, result });
  }

  console.log('[tick]', JSON.stringify(summary));
  return summary;
}

/** Create today's session automatically for accounts with auto_warmup on. */
async function autoStartSessions(): Promise<number> {
  if (new Date().getUTCHours() < AUTO_START_EARLIEST_UTC_HOUR) return 0;

  const autoIds = await domainAccounts.listAutoWarmupIds();
  if (autoIds.length === 0) return 0;

  const leadIds = await leadAccounts.listIds();
  if (leadIds.length === 0) return 0;

  let started = 0;
  for (const domainId of autoIds) {
    try {
      const existing = await sessions.todayFor(domainId);
      if (existing) continue; // any status → today is already handled

      await sessions.create({
        domain_account_id: domainId,
        lead_ids: leadIds,
        status: 'in_progress',
        step: 'send_intro',
        // Jitter the start so multiple mailboxes don't fire simultaneously
        next_action_at: inMs(Math.floor(Math.random() * 20 * 60_000)),
      });
      await domainAccounts.setStatus(domainId, 'running');
      started += 1;
    } catch (error) {
      // Unique-constraint races with a concurrent tick are harmless
      console.warn(`[tick] auto-start skipped for ${domainId}:`, (error as Error).message);
    }
  }
  return started;
}

// ---------------------------------------------------------------------------
// Step processing
// ---------------------------------------------------------------------------

async function processSession(session: WarmupSessionRow): Promise<string> {
  const domain = await domainAccounts.getSecret(session.domain_account_id);
  if (!domain) {
    await sessions.update(session.id, {
      status: 'failed',
      error_message: 'Domain account was deleted',
      claimed_until: null,
    });
    return 'failed: domain account missing';
  }

  if (session.current_lead_index >= session.lead_ids.length) {
    await completeSession(session, domain.id);
    return 'completed';
  }

  const leadId = session.lead_ids[session.current_lead_index];
  const lead = await leadAccounts.getSecret(leadId);
  if (!lead) {
    return skipLead(session, domain, 'lead account was deleted');
  }

  switch (session.step) {
    case 'send_intro':
      return sendIntro(session, domain, lead);
    case 'await_intro':
      return awaitIntro(session, domain, lead);
    case 'send_reply':
      return sendReply(session, domain, lead);
    case 'await_reply':
      return awaitReply(session, domain, lead);
    default:
      throw new Error(`Unknown session step: ${session.step}`);
  }
}

/** Generate + send the intro email from the domain mailbox to the lead. */
async function sendIntro(
  session: WarmupSessionRow,
  domain: DomainAccountRow,
  lead: LeadAccountRow,
): Promise<string> {
  const content = await generateIntroEmail(domain.sender_name, lead.sender_name, domain.email);
  const { messageId } = await sendMail(smtpTarget(domain), {
    to: lead.email,
    subject: content.subject,
    text: content.body,
  });

  await mailLogs.insert({
    session_id: session.id,
    from_email: domain.email,
    to_email: lead.email,
    subject: content.subject,
    body: content.body,
    message_id: messageId,
    direction: 'sent',
    lead_index: session.current_lead_index,
  });

  await sessions.update(session.id, {
    step: 'await_intro',
    intro_message_id: messageId,
    intro_subject: content.subject,
    intro_body: content.body,
    reply_message_id: null,
    emails_sent: session.emails_sent + 1,
    step_deadline_at: inMs(DELIVERY_TIMEOUT_MS),
    next_action_at: inMs(POLL_RETRY_MS),
    step_attempts: 0,
    claimed_until: null,
  });

  return `intro sent to ${lead.email}`;
}

/** Poll the lead's inbox for the intro; on arrival schedule the reply. */
async function awaitIntro(
  session: WarmupSessionRow,
  domain: DomainAccountRow,
  lead: LeadAccountRow,
): Promise<string> {
  const inbox = await fetchUnseenFrom(imapTarget(lead), domain.email);
  const match = inbox.find((mail) => normalizeEmail(mail.from) === normalizeEmail(domain.email));

  if (match) {
    await mailLogs.insert({
      session_id: session.id,
      from_email: domain.email,
      to_email: lead.email,
      subject: match.subject,
      body: match.body,
      message_id: match.messageId,
      direction: 'received',
      lead_index: session.current_lead_index,
    });

    const delay = randomDelayMs();
    await sessions.update(session.id, {
      step: 'send_reply',
      step_deadline_at: null,
      next_action_at: inMs(delay),
      step_attempts: 0,
      claimed_until: null,
    });
    return `intro delivered to ${lead.email}; reply in ~${Math.round(delay / 60_000)} min`;
  }

  if (session.step_deadline_at && new Date(session.step_deadline_at).getTime() < Date.now()) {
    return skipLead(session, domain, `intro not delivered to ${lead.email} within 10 minutes`);
  }

  await sessions.update(session.id, { next_action_at: inMs(POLL_RETRY_MS), claimed_until: null });
  return `waiting for intro delivery to ${lead.email}`;
}

/** Send the lead's AI-generated reply back to the domain mailbox (threaded). */
async function sendReply(
  session: WarmupSessionRow,
  domain: DomainAccountRow,
  lead: LeadAccountRow,
): Promise<string> {
  const content = await generateReplyEmail(
    lead.sender_name,
    domain.sender_name,
    session.intro_subject ?? 'your email',
    session.intro_body ?? '',
  );

  const { messageId } = await sendMail(smtpTarget(lead), {
    to: domain.email,
    subject: content.subject,
    text: content.body,
    inReplyTo: session.intro_message_id ?? undefined,
    references: session.intro_message_id ?? undefined,
  });

  await mailLogs.insert({
    session_id: session.id,
    from_email: lead.email,
    to_email: domain.email,
    subject: content.subject,
    body: content.body,
    message_id: messageId,
    in_reply_to: session.intro_message_id,
    direction: 'replied',
    lead_index: session.current_lead_index,
  });

  await sessions.update(session.id, {
    step: 'await_reply',
    reply_message_id: messageId,
    replies_sent: session.replies_sent + 1,
    step_deadline_at: inMs(DELIVERY_TIMEOUT_MS),
    next_action_at: inMs(POLL_RETRY_MS),
    step_attempts: 0,
    claimed_until: null,
  });

  return `reply sent from ${lead.email}`;
}

/** Poll the domain's inbox for the lead's reply; on arrival advance. */
async function awaitReply(
  session: WarmupSessionRow,
  domain: DomainAccountRow,
  lead: LeadAccountRow,
): Promise<string> {
  const inbox = await fetchUnseenFrom(imapTarget(domain), lead.email);
  const match = inbox.find((mail) => normalizeEmail(mail.from) === normalizeEmail(lead.email));

  if (match) {
    await mailLogs.insert({
      session_id: session.id,
      from_email: lead.email,
      to_email: domain.email,
      subject: match.subject,
      body: match.body,
      message_id: match.messageId,
      in_reply_to: match.inReplyTo,
      direction: 'received',
      lead_index: session.current_lead_index,
    });
    return advanceLead(session, domain, {
      replies_received: session.replies_received + 1,
    });
  }

  if (session.step_deadline_at && new Date(session.step_deadline_at).getTime() < Date.now()) {
    return skipLead(session, domain, `reply from ${lead.email} not received within 10 minutes`);
  }

  await sessions.update(session.id, { next_action_at: inMs(POLL_RETRY_MS), claimed_until: null });
  return `waiting for reply from ${lead.email}`;
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

async function advanceLead(
  session: WarmupSessionRow,
  domain: DomainAccountRow,
  extraPatch: Record<string, unknown> = {},
  delayMs = randomDelayMs(),
): Promise<string> {
  const nextIndex = session.current_lead_index + 1;

  if (nextIndex >= session.lead_ids.length) {
    await sessions.update(session.id, {
      ...extraPatch,
      current_lead_index: nextIndex,
      status: 'completed',
      completed_at: nowIso(),
      step_deadline_at: null,
      claimed_until: null,
    });
    await domainAccounts.setStatus(domain.id, 'idle');
    return `completed all ${session.lead_ids.length} leads`;
  }

  await sessions.update(session.id, {
    ...extraPatch,
    current_lead_index: nextIndex,
    step: 'send_intro',
    step_attempts: 0,
    step_deadline_at: null,
    next_action_at: inMs(delayMs),
    claimed_until: null,
  });
  return `advanced to lead ${nextIndex + 1}/${session.lead_ids.length}`;
}

async function skipLead(
  session: WarmupSessionRow,
  domain: DomainAccountRow,
  reason: string,
): Promise<string> {
  console.warn(`[tick] skipping lead ${session.current_lead_index + 1} of session ${session.id}: ${reason}`);
  const result = await advanceLead(
    session,
    domain,
    {
      leads_skipped: session.leads_skipped + 1,
      error_message: `Skipped lead ${session.current_lead_index + 1}: ${reason}`,
    },
    SKIP_ADVANCE_MS,
  );
  return `skipped (${reason}); ${result}`;
}

async function completeSession(session: WarmupSessionRow, domainId: string): Promise<void> {
  await sessions.update(session.id, {
    status: 'completed',
    completed_at: nowIso(),
    step_deadline_at: null,
    claimed_until: null,
  });
  await domainAccounts.setStatus(domainId, 'idle');
}

/** Retry transient step failures a few times, then fail the session. */
async function handleStepError(session: WarmupSessionRow, error: Error): Promise<string> {
  const attempts = session.step_attempts + 1;
  console.error(`[tick] step ${session.step} failed for session ${session.id} (attempt ${attempts}):`, error.message);

  try {
    if (attempts >= MAX_STEP_ATTEMPTS) {
      await sessions.update(session.id, {
        status: 'failed',
        error_message: `${session.step} failed after ${attempts} attempts: ${error.message}`.slice(0, 500),
        claimed_until: null,
      });
      await domainAccounts.setStatus(session.domain_account_id, 'idle');
      return `failed permanently: ${error.message}`;
    }

    await sessions.update(session.id, {
      step_attempts: attempts,
      error_message: `${session.step} attempt ${attempts} failed: ${error.message}`.slice(0, 500),
      next_action_at: inMs(ERROR_RETRY_MS),
      claimed_until: null,
    });
    return `error (will retry): ${error.message}`;
  } catch (updateError) {
    console.error('[tick] could not persist step error:', updateError);
    return `error: ${error.message}`;
  }
}
