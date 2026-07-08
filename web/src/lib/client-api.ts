/**
 * Browser-side API client. Talks exclusively to this app's own /api routes —
 * the browser never knows the database exists.
 */

import type {
  ApiResponse,
  MailLogRow,
  PublicDomainAccount,
  PublicLeadAccount,
  WarmupSessionRow,
  WarmupStatusPayload,
} from './types';

export interface HealthPayload {
  status: 'healthy' | 'degraded';
  database: string;
  missingEnv: string[];
  timestamp: string;
}

export interface AccountFormData {
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
  auto_warmup?: boolean;
}

export interface TestConnectionData {
  type: 'smtp' | 'imap';
  host: string;
  port: number;
  secure: boolean;
  email: string;
  password: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<{ data: T; message?: string }> {
  const response = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    ...init,
  });

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    // fall through — handled below
  }

  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || `Request failed with status ${response.status}`);
  }
  return { data: payload.data as T, message: payload.message };
}

export const api = {
  health: () => request<HealthPayload>('/health'),

  domainAccounts: {
    list: () => request<PublicDomainAccount[]>('/domain-accounts'),
    create: (data: AccountFormData) =>
      request<PublicDomainAccount>('/domain-accounts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<AccountFormData>) =>
      request<PublicDomainAccount>(`/domain-accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string) => request<null>(`/domain-accounts/${id}`, { method: 'DELETE' }),
  },

  leadAccounts: {
    list: () => request<PublicLeadAccount[]>('/lead-accounts'),
    create: (data: AccountFormData) =>
      request<PublicLeadAccount>('/lead-accounts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<AccountFormData>) =>
      request<PublicLeadAccount>(`/lead-accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string) => request<null>(`/lead-accounts/${id}`, { method: 'DELETE' }),
  },

  testConnection: (data: TestConnectionData) =>
    request<null>('/test-connection', { method: 'POST', body: JSON.stringify(data) }),

  warmup: {
    start: (domainAccountId: string) =>
      request<WarmupSessionRow>('/warmup/start', { method: 'POST', body: JSON.stringify({ domain_account_id: domainAccountId }) }),
    pause: (domainAccountId: string) =>
      request<WarmupSessionRow>('/warmup/pause', { method: 'POST', body: JSON.stringify({ domain_account_id: domainAccountId }) }),
    resume: (domainAccountId: string) =>
      request<WarmupSessionRow>('/warmup/resume', { method: 'POST', body: JSON.stringify({ domain_account_id: domainAccountId }) }),
    stop: (domainAccountId: string) =>
      request<WarmupSessionRow>('/warmup/stop', { method: 'POST', body: JSON.stringify({ domain_account_id: domainAccountId }) }),
    status: (domainAccountId: string) => request<WarmupStatusPayload>(`/warmup/status/${domainAccountId}`),
    sessions: (domainAccountId: string) =>
      request<WarmupSessionRow[]>(`/warmup/sessions?domain_account_id=${domainAccountId}`),
    sessionLogs: (sessionId: string) => request<MailLogRow[]>(`/warmup/sessions/${sessionId}/logs`),
    recentLogs: (limit = 20) => request<MailLogRow[]>(`/warmup/logs?limit=${limit}`),
  },
};
