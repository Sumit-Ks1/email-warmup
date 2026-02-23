/**
 * Shared TypeScript type definitions for the entire backend.
 */

// ====================================
// Database entity types
// ====================================

export interface DomainAccount {
  id: string;
  sender_name: string;
  email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_password: string; // stored encrypted
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  imap_password: string; // stored encrypted
  status: 'idle' | 'running' | 'paused';
  created_at: string;
  updated_at: string;
}

export interface LeadAccount {
  id: string;
  sender_name: string;
  email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_password: string; // stored encrypted
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  imap_password: string; // stored encrypted
  created_at: string;
  updated_at: string;
}

export interface WarmupSession {
  id: string;
  domain_account_id: string;
  current_lead_index: number;
  status: 'pending' | 'sending' | 'waiting_reply' | 'paused' | 'completed' | 'failed';
  last_message_id: string | null;
  session_date: string;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface MailLog {
  id: string;
  session_id: string | null;
  from_email: string;
  to_email: string;
  subject: string;
  body: string | null;
  message_id: string | null;
  in_reply_to: string | null;
  direction: 'sent' | 'received' | 'replied';
  lead_index: number | null;
  created_at: string;
}

// ====================================
// API request/response types
// ====================================

export interface CreateDomainAccountRequest {
  sender_name: string;
  email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_password: string;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  imap_password: string;
}

export interface CreateLeadAccountRequest {
  sender_name: string;
  email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_password: string;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  imap_password: string;
}

export interface ConnectionTestRequest {
  host: string;
  port: number;
  secure: boolean;
  password: string;
  email: string;
  type: 'smtp' | 'imap';
}

export interface StartWarmupRequest {
  domain_account_id: string;
}

// ====================================
// Groq response types
// ====================================

export interface GroqEmailResponse {
  subject: string;
  body: string;
}

// ====================================
// IMAP listener event types
// ====================================

export interface IncomingEmail {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo: string | null;
  date: Date;
}

// ====================================
// Session state machine
// ====================================

export type SessionAction = 'start' | 'pause' | 'resume' | 'complete' | 'fail';

export interface WarmupContext {
  session: WarmupSession;
  domainAccount: DomainAccount;
  leads: LeadAccount[];
}

// ====================================
// API response wrapper
// ====================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
