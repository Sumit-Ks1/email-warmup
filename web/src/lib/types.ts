/**
 * Shared types for the warm-up platform (server + client).
 */

export type DomainAccountStatus = 'idle' | 'running' | 'paused';

export type SessionStatus =
  | 'in_progress'
  | 'paused'
  | 'stopped'
  | 'completed'
  | 'failed';

/** Sub-state of a session while working through the current lead. */
export type SessionStep = 'send_intro' | 'await_intro' | 'send_reply' | 'await_reply';

export type MailDirection = 'sent' | 'received' | 'replied';

export interface MailCredentials {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_password: string; // stored encrypted (AES-256-GCM)
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  imap_password: string; // stored encrypted (AES-256-GCM)
}

export interface DomainAccountRow extends MailCredentials {
  id: string;
  sender_name: string;
  email: string;
  status: DomainAccountStatus;
  auto_warmup: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeadAccountRow extends MailCredentials {
  id: string;
  sender_name: string;
  email: string;
  created_at: string;
  updated_at: string;
}

/** Account shapes safe to return to the browser — passwords never leave the server. */
export type PublicDomainAccount = Omit<DomainAccountRow, 'smtp_password' | 'imap_password'>;
export type PublicLeadAccount = Omit<LeadAccountRow, 'smtp_password' | 'imap_password'>;

export interface WarmupSessionRow {
  id: string;
  domain_account_id: string;
  session_date: string;
  status: SessionStatus;
  step: SessionStep;
  current_lead_index: number;
  lead_ids: string[];
  intro_message_id: string | null;
  intro_subject: string | null;
  intro_body: string | null;
  reply_message_id: string | null;
  next_action_at: string;
  step_deadline_at: string | null;
  step_attempts: number;
  claimed_until: string | null;
  emails_sent: number;
  replies_sent: number;
  replies_received: number;
  leads_skipped: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MailLogRow {
  id: string;
  session_id: string | null;
  from_email: string;
  to_email: string;
  subject: string;
  body: string | null;
  message_id: string | null;
  in_reply_to: string | null;
  direction: MailDirection;
  lead_index: number | null;
  created_at: string;
}

export interface IncomingEmail {
  messageId: string;
  from: string;
  subject: string;
  body: string;
  inReplyTo: string | null;
}

export interface EmailContent {
  subject: string;
  body: string;
}

/** Payload returned by GET /api/warmup/status/[id] */
export interface WarmupStatusPayload {
  session: WarmupSessionRow | null;
  completedToday: boolean;
  newLeadsAvailable: boolean;
  totalLeadsConfigured: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
