/**
 * Shared TypeScript types for the frontend.
 * Mirrors backend types used in API responses.
 */

export interface DomainAccount {
  id: string;
  sender_name: string;
  email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
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
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
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

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface WarmupStatus {
  active: {
    isActive: boolean;
    currentLeadIndex: number;
    totalLeads: number;
    isPaused: boolean;
  } | null;
  session: WarmupSession | null;
  completedToday: boolean;
}

// Form data types with passwords included
export interface DomainAccountFormData {
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

export interface LeadAccountFormData {
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
