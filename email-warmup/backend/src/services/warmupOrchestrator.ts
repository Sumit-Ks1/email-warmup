/**
 * Warm-Up Orchestration Engine.
 *
 * This is the core state machine that drives the warm-up flow:
 *
 * 1. Select domain mailbox → create session
 * 2. Send email to Lead #N → mark as waiting_reply
 * 3. IMAP IDLE listens on Lead #N's inbox for domain's reply
 * 4. When reply from domain is detected → Lead auto-replies via Groq
 * 5. IMAP IDLE listens on domain's inbox for Lead's reply
 * 6. When Lead reply received → wait random 3-5 min → move to Lead #(N+1)
 * 7. Repeat until all leads exhausted → mark session completed
 *
 * Key constraints:
 * - NEVER send to next lead without receiving reply from current
 * - Random 3-5 minute delay between lead transitions
 * - Pausable and resumable at any point
 * - Single email per recipient (no CC/BCC)
 */

import { config } from '../config';
import { logger } from '../config/logger';
import { domainAccountRepo, leadAccountRepo, sessionRepo, mailLogRepo } from '../db';
import { sendEmail } from './smtpService';
import { ImapListener } from './imapService';
import { generateOutboundEmail, generateReplyEmail } from './groqService';
import { DomainAccount, LeadAccount, WarmupSession, IncomingEmail } from '../types';

/** Active warm-up session tracker */
interface ActiveSession {
  session: WarmupSession;
  domainAccount: DomainAccount;
  leads: LeadAccount[];
  domainImapListener: ImapListener | null;
  leadImapListener: ImapListener | null;
  isPaused: boolean;
  timers: NodeJS.Timeout[];
}

/** In-memory registry of running sessions */
const activeSessions = new Map<string, ActiveSession>();

/**
 * Generate a random delay between min and max warm-up intervals.
 */
function randomDelay(): number {
  const { minDelayMs, maxDelayMs } = config.warmup;
  return Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;
}

/**
 * Start a warm-up session for a domain account.
 * Validates preconditions, creates session record, and begins the flow.
 */
export async function startWarmup(domainAccountId: string): Promise<WarmupSession> {
  // 1. Check if already running
  if (activeSessions.has(domainAccountId)) {
    throw new Error('Warm-up session already active for this domain account');
  }

  // 2. Load domain account
  const domainAccount = await domainAccountRepo.findById(domainAccountId);
  if (!domainAccount) {
    throw new Error('Domain account not found');
  }

  // 3. Load all lead accounts (ordered by created_at ASC for stable indexing)
  const leads = await leadAccountRepo.findAll();
  if (leads.length === 0) {
    throw new Error('No lead accounts configured. Add at least one lead Gmail account.');
  }

  // 4. Check if completed today
  const completedToday = await sessionRepo.findCompletedToday(domainAccountId);
  if (completedToday) {
    // If new leads were added since completion, allow restarting from where we left off
    const completedLeadCount = completedToday.current_lead_index;
    if (completedLeadCount < leads.length) {
      logger.info(
        `Session was completed with ${completedLeadCount} leads, but ${leads.length} leads exist now. ` +
        `Resuming from lead index ${completedLeadCount}.`
      );
      // Reset the completed session to continue with remaining leads
      const session = (await sessionRepo.updateStatus(completedToday.id, 'sending', {
        current_lead_index: completedLeadCount,
        completed_at: null,
        error_message: null,
      }))!;

      await domainAccountRepo.updateStatus(domainAccountId, 'running');

      const activeSession: ActiveSession = {
        session,
        domainAccount,
        leads,
        domainImapListener: null,
        leadImapListener: null,
        isPaused: false,
        timers: [],
      };
      activeSessions.set(domainAccountId, activeSession);

      processNextLead(domainAccountId).catch((error) => {
        logger.error('Warm-up flow error', { domainAccountId, error: error.message });
        failSession(domainAccountId, error.message);
      });

      return session;
    }

    throw new Error(
      `All ${leads.length} warm-up emails completed for today (${new Date().toISOString().split('T')[0]}). ` +
      `Session was completed at ${completedToday.completed_at}. Add more lead accounts or try again tomorrow.`
    );
  }

  // 5. Check for resumable session or create new one
  let session = await sessionRepo.findActiveToday(domainAccountId);
  if (session && session.status === 'paused') {
    // Resume existing paused session
    session = (await sessionRepo.updateStatus(session.id, 'sending'))!;
    logger.info(`Resuming paused session ${session.id} at lead index ${session.current_lead_index}`);
  } else if (!session) {
    // Create new session
    session = await sessionRepo.create(domainAccountId);
    logger.info(`New warm-up session created: ${session.id}`);
  } else {
    throw new Error(`Session already exists with status: ${session.status}`);
  }

  // 6. Update domain account status
  await domainAccountRepo.updateStatus(domainAccountId, 'running');

  // 7. Register active session
  const activeSession: ActiveSession = {
    session,
    domainAccount,
    leads,
    domainImapListener: null,
    leadImapListener: null,
    isPaused: false,
    timers: [],
  };
  activeSessions.set(domainAccountId, activeSession);

  // 8. Begin the warm-up flow
  processNextLead(domainAccountId).catch((error) => {
    logger.error('Warm-up flow error', { domainAccountId, error: error.message });
    failSession(domainAccountId, error.message);
  });

  return session;
}

/**
 * Process the next lead in the warm-up sequence.
 * This is the main loop that sends an email and sets up reply listeners.
 */
async function processNextLead(domainAccountId: string): Promise<void> {
  const active = activeSessions.get(domainAccountId);
  if (!active || active.isPaused) return;

  const { session, domainAccount, leads } = active;
  const leadIndex = session.current_lead_index;

  // Check if all leads have been processed
  if (leadIndex >= leads.length) {
    await completeSession(domainAccountId);
    return;
  }

  const currentLead = leads[leadIndex];
  logger.info(`Processing lead ${leadIndex + 1}/${leads.length}: ${currentLead.email}`, {
    sessionId: session.id,
    domainEmail: domainAccount.email,
  });

  try {
    // Step 1: Generate outbound email via Groq
    const emailContent = await generateOutboundEmail(
      domainAccount.sender_name,
      currentLead.sender_name,
      domainAccount.email
    );

    // Step 2: Send email from domain account to lead
    const sendResult = await sendEmail(
      {
        host: domainAccount.smtp_host,
        port: domainAccount.smtp_port,
        secure: domainAccount.smtp_secure,
        password: domainAccount.smtp_password,
        email: domainAccount.email,
        senderName: domainAccount.sender_name,
      },
      {
        to: currentLead.email,
        subject: emailContent.subject,
        body: emailContent.body,
      }
    );

    // Step 3: Log the sent email
    await mailLogRepo.create({
      session_id: session.id,
      from_email: domainAccount.email,
      to_email: currentLead.email,
      subject: emailContent.subject,
      body: emailContent.body,
      message_id: sendResult.messageId,
      direction: 'sent',
      lead_index: leadIndex,
    });

    // Step 4: Update session status to waiting_reply
    active.session = (await sessionRepo.updateStatus(session.id, 'waiting_reply', {
      last_message_id: sendResult.messageId,
      current_lead_index: leadIndex,
    }))!;

    logger.info(`Email sent to ${currentLead.email}, waiting for reply`, {
      messageId: sendResult.messageId,
    });

    // Step 5: Start IMAP IDLE on lead's inbox to detect the incoming email
    // The lead Gmail needs to detect the domain's email and auto-reply
    await setupLeadAutoReply(domainAccountId, currentLead, sendResult.messageId, emailContent);

  } catch (error: any) {
    logger.error(`Failed to process lead ${currentLead.email}`, { error: error.message });
    throw error;
  }
}

/**
 * Set up IMAP listener on lead's Gmail to detect incoming email
 * from domain and auto-reply using Groq.
 */
async function setupLeadAutoReply(
  domainAccountId: string,
  lead: LeadAccount,
  originalMessageId: string,
  originalEmail: { subject: string; body: string }
): Promise<void> {
  const active = activeSessions.get(domainAccountId);
  if (!active) return;

  // Clean up any existing lead listener
  if (active.leadImapListener) {
    active.leadImapListener.disconnect();
    active.leadImapListener = null;
  }

  const leadListener = new ImapListener(
    {
      host: lead.imap_host,
      port: lead.imap_port,
      secure: lead.imap_secure,
      password: lead.imap_password,
      email: lead.email,
      filterFromEmail: active.domainAccount.email, // Only fetch emails from domain sender
    },
    async (incomingEmail: IncomingEmail) => {
      try {
        // Normalize email addresses for comparison (strip any angle brackets / whitespace)
        const fromAddr = (incomingEmail.from || '').toLowerCase().replace(/[<>\s]/g, '');
        const domainAddr = active.domainAccount.email.toLowerCase().replace(/[<>\s]/g, '');

        logger.info(`Lead IMAP received email`, {
          from: fromAddr,
          expectedFrom: domainAddr,
          subject: incomingEmail.subject,
          messageId: incomingEmail.messageId,
        });

        // Check if this email is from the domain account
        if (fromAddr !== domainAddr) {
          logger.debug(`Ignoring email from ${fromAddr} (expected ${domainAddr})`);
          return;
        }

        logger.info(`Lead ${lead.email} received email from domain`, {
          messageId: incomingEmail.messageId,
          subject: incomingEmail.subject,
        });

        // Log the received email
        await mailLogRepo.create({
          session_id: active.session.id,
          from_email: incomingEmail.from,
          to_email: lead.email,
          subject: incomingEmail.subject,
          body: incomingEmail.body,
          message_id: incomingEmail.messageId,
          direction: 'received',
          lead_index: active.session.current_lead_index,
        });

        // Disconnect lead listener — we got what we needed
        if (active.leadImapListener) {
          active.leadImapListener.disconnect();
          active.leadImapListener = null;
        }

        // Wait random 3-5 minutes before lead replies (makes it look human)
        const replyDelay = Math.floor(Math.random() * (300000 - 180000 + 1)) + 180000; // 3-5 min in ms
        logger.info(`Lead ${lead.email} will reply in ${Math.round(replyDelay / 60000)} minutes`, {
          delayMs: replyDelay,
          sessionId: active.session.id,
        });

        const replyTimer = setTimeout(async () => {
          const currentActive = activeSessions.get(domainAccountId);
          if (!currentActive || currentActive.isPaused) {
            logger.info(`Session no longer active/paused, skipping lead reply`);
            return;
          }
          // Generate and send reply from lead
          await sendLeadReply(domainAccountId, lead, incomingEmail, originalEmail);
        }, replyDelay);

        active.timers.push(replyTimer);
      } catch (error: any) {
        logger.error(`Error in lead IMAP callback for ${lead.email}`, { error: error.message, stack: error.stack });
      }
    },
    // Timeout callback: email from domain never arrived at lead's inbox
    async () => {
      logger.warn(`Lead ${lead.email} did not receive email from ${active.domainAccount.email} within timeout. Skipping to next lead.`, {
        sessionId: active.session.id,
        leadIndex: active.session.current_lead_index,
      });
      await skipToNextLead(domainAccountId, `Email not delivered to ${lead.email} within 10 minutes`);
    }
  );

  active.leadImapListener = leadListener;
  leadListener.connect();
}

/**
 * Send an auto-reply from the lead's Gmail back to the domain account.
 * After sending, set up IMAP listener on domain to detect the reply.
 */
async function sendLeadReply(
  domainAccountId: string,
  lead: LeadAccount,
  incomingEmail: IncomingEmail,
  originalEmail: { subject: string; body: string }
): Promise<void> {
  const active = activeSessions.get(domainAccountId);
  if (!active || active.isPaused) return;

  try {
    // Generate reply content via Groq
    const replyContent = await generateReplyEmail(
      lead.sender_name,
      active.domainAccount.sender_name,
      originalEmail.subject,
      originalEmail.body
    );

    // Send reply from lead back to domain
    const sendResult = await sendEmail(
      {
        host: lead.smtp_host,
        port: lead.smtp_port,
        secure: lead.smtp_secure,
        password: lead.smtp_password,
        email: lead.email,
        senderName: lead.sender_name,
      },
      {
        to: active.domainAccount.email,
        subject: replyContent.subject,
        body: replyContent.body,
        inReplyTo: incomingEmail.messageId,
        references: incomingEmail.messageId,
      }
    );

    // Log the reply
    await mailLogRepo.create({
      session_id: active.session.id,
      from_email: lead.email,
      to_email: active.domainAccount.email,
      subject: replyContent.subject,
      body: replyContent.body,
      message_id: sendResult.messageId,
      in_reply_to: incomingEmail.messageId,
      direction: 'replied',
      lead_index: active.session.current_lead_index,
    });

    logger.info(`Lead ${lead.email} replied to domain`, {
      messageId: sendResult.messageId,
    });

    // Now listen on domain's IMAP for the reply to arrive
    await setupDomainReplyListener(domainAccountId, lead.email, sendResult.messageId);

  } catch (error: any) {
    logger.error(`Failed to send lead reply from ${lead.email}`, { error: error.message });
    throw error;
  }
}

/**
 * Set up IMAP listener on domain account to detect reply from lead.
 * Once reply is confirmed received, advance to the next lead after delay.
 */
async function setupDomainReplyListener(
  domainAccountId: string,
  expectedFromEmail: string,
  expectedInReplyTo: string
): Promise<void> {
  const active = activeSessions.get(domainAccountId);
  if (!active) return;

  // Clean up any existing domain listener
  if (active.domainImapListener) {
    active.domainImapListener.disconnect();
    active.domainImapListener = null;
  }

  const domainListener = new ImapListener(
    {
      host: active.domainAccount.imap_host,
      port: active.domainAccount.imap_port,
      secure: active.domainAccount.imap_secure,
      password: active.domainAccount.imap_password,
      email: active.domainAccount.email,
      filterFromEmail: expectedFromEmail, // Only fetch emails from this specific lead
    },
    async (incomingEmail: IncomingEmail) => {
      try {
        // Normalize email addresses for comparison
        const fromAddr = (incomingEmail.from || '').toLowerCase().replace(/[<>\s]/g, '');
        const expectedAddr = expectedFromEmail.toLowerCase().replace(/[<>\s]/g, '');

        logger.info(`Domain IMAP received email`, {
          from: fromAddr,
          expectedFrom: expectedAddr,
          subject: incomingEmail.subject,
          messageId: incomingEmail.messageId,
        });

        // Verify this is the expected reply from the lead
        if (fromAddr !== expectedAddr) {
          logger.debug(`Ignoring email from ${fromAddr} (expected ${expectedAddr})`);
          return;
        }

        logger.info(`Domain received reply from lead ${expectedFromEmail}`, {
          messageId: incomingEmail.messageId,
        });

      // Log the received reply on domain side
      await mailLogRepo.create({
        session_id: active.session.id,
        from_email: incomingEmail.from,
        to_email: active.domainAccount.email,
        subject: incomingEmail.subject,
        body: incomingEmail.body,
        message_id: incomingEmail.messageId,
        in_reply_to: incomingEmail.inReplyTo || undefined,
        direction: 'received',
        lead_index: active.session.current_lead_index,
      });

      // Disconnect domain listener
      if (active.domainImapListener) {
        active.domainImapListener.disconnect();
        active.domainImapListener = null;
      }

      // Advance to next lead after random delay
      const nextIndex = active.session.current_lead_index + 1;
      active.session = (await sessionRepo.updateStatus(active.session.id, 'sending', {
        current_lead_index: nextIndex,
      }))!;

      if (nextIndex >= active.leads.length) {
        // All leads processed
        await completeSession(domainAccountId);
      } else {
        // Wait random 3-5 minutes before next lead
        const delay = randomDelay();
        logger.info(`Waiting ${Math.round(delay / 1000)}s before next lead (#${nextIndex + 1})`);

        const timer = setTimeout(async () => {
          try {
            await processNextLead(domainAccountId);
          } catch (error: any) {
            logger.error('Error advancing to next lead', { error: error.message });
            await failSession(domainAccountId, error.message);
          }
        }, delay);

        active.timers.push(timer);
      }
      } catch (error: any) {
        logger.error(`Error in domain IMAP callback`, { error: error.message, stack: error.stack });
      }
    },
    // Timeout callback: lead's reply never arrived at domain inbox
    async () => {
      logger.warn(`Domain ${active.domainAccount.email} did not receive reply from ${expectedFromEmail} within timeout. Skipping to next lead.`, {
        sessionId: active.session.id,
        leadIndex: active.session.current_lead_index,
      });
      await skipToNextLead(domainAccountId, `Reply from ${expectedFromEmail} not received within 10 minutes`);
    }
  );

  active.domainImapListener = domainListener;
  domainListener.connect();
}

/**
 * Skip the current lead and advance to the next one.
 * Called when IMAP timeout fires (email not delivered or reply not received).
 */
async function skipToNextLead(domainAccountId: string, reason: string): Promise<void> {
  const active = activeSessions.get(domainAccountId);
  if (!active || active.isPaused) return;

  // Clean up listeners
  if (active.leadImapListener) {
    active.leadImapListener.disconnect();
    active.leadImapListener = null;
  }
  if (active.domainImapListener) {
    active.domainImapListener.disconnect();
    active.domainImapListener = null;
  }

  const skippedLead = active.leads[active.session.current_lead_index];
  logger.warn(`Skipping lead ${skippedLead?.email || 'unknown'}: ${reason}`, {
    sessionId: active.session.id,
    leadIndex: active.session.current_lead_index,
  });

  // Advance to next lead
  const nextIndex = active.session.current_lead_index + 1;
  active.session = (await sessionRepo.updateStatus(active.session.id, 'sending', {
    current_lead_index: nextIndex,
  }))!;

  if (nextIndex >= active.leads.length) {
    await completeSession(domainAccountId);
  } else {
    // Short delay before trying next lead
    const delay = 10000; // 10 seconds
    logger.info(`Advancing to lead #${nextIndex + 1} in ${delay / 1000}s after timeout skip`);

    const timer = setTimeout(async () => {
      try {
        await processNextLead(domainAccountId);
      } catch (error: any) {
        logger.error('Error advancing to next lead after skip', { error: error.message });
        await failSession(domainAccountId, error.message);
      }
    }, delay);

    active.timers.push(timer);
  }
}

/**
 * Complete a warm-up session (all leads processed).
 */
async function completeSession(domainAccountId: string): Promise<void> {
  const active = activeSessions.get(domainAccountId);
  if (!active) return;

  const today = new Date().toISOString().split('T')[0];

  await sessionRepo.updateStatus(active.session.id, 'completed', {
    completed_at: new Date().toISOString(),
  });

  await domainAccountRepo.updateStatus(domainAccountId, 'idle');

  cleanupSession(domainAccountId);

  logger.info(
    `✓ Warm-up COMPLETED for ${active.domainAccount.email} on ${today}. ` +
    `All ${active.leads.length} leads processed.`
  );
}

/**
 * Fail a session due to an error.
 */
async function failSession(domainAccountId: string, errorMessage: string): Promise<void> {
  const active = activeSessions.get(domainAccountId);
  if (!active) return;

  await sessionRepo.updateStatus(active.session.id, 'failed', {
    error_message: errorMessage,
  });

  await domainAccountRepo.updateStatus(domainAccountId, 'idle');

  cleanupSession(domainAccountId);

  logger.error(`Warm-up session FAILED for ${active.domainAccount.email}: ${errorMessage}`);
}

/**
 * Pause a running warm-up session.
 */
export async function pauseWarmup(domainAccountId: string): Promise<WarmupSession | null> {
  const active = activeSessions.get(domainAccountId);
  if (!active) {
    throw new Error('No active warm-up session found for this domain account');
  }

  active.isPaused = true;

  // Disconnect IMAP listeners
  if (active.leadImapListener) {
    active.leadImapListener.disconnect();
    active.leadImapListener = null;
  }
  if (active.domainImapListener) {
    active.domainImapListener.disconnect();
    active.domainImapListener = null;
  }

  // Clear pending timers
  for (const timer of active.timers) {
    clearTimeout(timer);
  }
  active.timers = [];

  const session = await sessionRepo.updateStatus(active.session.id, 'paused');
  await domainAccountRepo.updateStatus(domainAccountId, 'paused');

  // Remove from active sessions (will be re-registered on resume)
  activeSessions.delete(domainAccountId);

  logger.info(`Warm-up session PAUSED for ${active.domainAccount.email} at lead index ${active.session.current_lead_index}`);

  return session;
}

/**
 * Resume a paused warm-up session. Delegates to startWarmup which handles resume logic.
 */
export async function resumeWarmup(domainAccountId: string): Promise<WarmupSession> {
  return startWarmup(domainAccountId);
}

/**
 * Stop a warm-up session entirely.
 */
export async function stopWarmup(domainAccountId: string): Promise<void> {
  const active = activeSessions.get(domainAccountId);
  if (!active) {
    // Check if there's a DB session to stop
    const session = await sessionRepo.findActiveToday(domainAccountId);
    if (session) {
      await sessionRepo.updateStatus(session.id, 'failed', {
        error_message: 'Manually stopped by user',
      });
      await domainAccountRepo.updateStatus(domainAccountId, 'idle');
    }
    return;
  }

  await failSession(domainAccountId, 'Manually stopped by user');
}

/**
 * Clean up an active session's resources.
 */
function cleanupSession(domainAccountId: string): void {
  const active = activeSessions.get(domainAccountId);
  if (!active) return;

  if (active.leadImapListener) {
    active.leadImapListener.disconnect();
  }
  if (active.domainImapListener) {
    active.domainImapListener.disconnect();
  }
  for (const timer of active.timers) {
    clearTimeout(timer);
  }

  activeSessions.delete(domainAccountId);
}

/**
 * Get current status of an active session.
 */
export function getActiveSessionStatus(domainAccountId: string): {
  isActive: boolean;
  currentLeadIndex: number;
  totalLeads: number;
  isPaused: boolean;
} | null {
  const active = activeSessions.get(domainAccountId);
  if (!active) return null;

  return {
    isActive: true,
    currentLeadIndex: active.session.current_lead_index,
    totalLeads: active.leads.length,
    isPaused: active.isPaused,
  };
}

/**
 * Graceful shutdown: stop all active sessions.
 */
export async function shutdownAll(): Promise<void> {
  logger.info(`Shutting down ${activeSessions.size} active sessions`);

  for (const [domainAccountId] of activeSessions) {
    try {
      await pauseWarmup(domainAccountId);
    } catch (error: any) {
      logger.error(`Error pausing session during shutdown`, {
        domainAccountId,
        error: error.message,
      });
    }
  }

  activeSessions.clear();
}
