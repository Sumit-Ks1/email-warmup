/**
 * API Client for communicating with the backend.
 * Centralized fetch wrapper with error handling.
 */

import {
  ApiResponse,
  DomainAccount,
  LeadAccount,
  WarmupSession,
  WarmupStatus,
  MailLog,
  DomainAccountFormData,
  LeadAccountFormData,
} from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

/**
 * Generic fetch wrapper with error handling.
 */
async function apiFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  const url = `${API_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
      ...options,
    });

    const data: ApiResponse<T> = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
  } catch (error: any) {
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error('Unable to connect to backend server');
    }
    throw error;
  }
}

// ====================================
// Domain Account API
// ====================================

export const domainAccountApi = {
  list: () => apiFetch<DomainAccount[]>('/domain-accounts'),

  get: (id: string) => apiFetch<DomainAccount>(`/domain-accounts/${id}`),

  create: (data: DomainAccountFormData) =>
    apiFetch<DomainAccount>('/domain-accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<DomainAccountFormData>) =>
    apiFetch<DomainAccount>(`/domain-accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiFetch<void>(`/domain-accounts/${id}`, {
      method: 'DELETE',
    }),

  testConnection: (data: {
    host: string;
    port: number;
    secure: boolean;
    password: string;
    email: string;
    type: 'smtp' | 'imap';
  }) =>
    apiFetch<void>('/domain-accounts/test-connection', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ====================================
// Lead Account API
// ====================================

export const leadAccountApi = {
  list: () => apiFetch<LeadAccount[]>('/lead-accounts'),

  get: (id: string) => apiFetch<LeadAccount>(`/lead-accounts/${id}`),

  create: (data: LeadAccountFormData) =>
    apiFetch<LeadAccount>('/lead-accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<LeadAccountFormData>) =>
    apiFetch<LeadAccount>(`/lead-accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiFetch<void>(`/lead-accounts/${id}`, {
      method: 'DELETE',
    }),

  testConnection: (data: {
    host: string;
    port: number;
    secure: boolean;
    password: string;
    email: string;
    type: 'smtp' | 'imap';
  }) =>
    apiFetch<void>('/lead-accounts/test-connection', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ====================================
// Warm-up API
// ====================================

export const warmupApi = {
  getSessions: (domainAccountId?: string) => {
    const query = domainAccountId
      ? `?domain_account_id=${domainAccountId}`
      : '';
    return apiFetch<WarmupSession[]>(`/warmup/sessions${query}`);
  },

  getSession: (id: string) =>
    apiFetch<WarmupSession>(`/warmup/sessions/${id}`),

  getSessionLogs: (sessionId: string) =>
    apiFetch<MailLog[]>(`/warmup/sessions/${sessionId}/logs`),

  getStatus: (domainAccountId: string) =>
    apiFetch<WarmupStatus>(`/warmup/status/${domainAccountId}`),

  start: (domainAccountId: string) =>
    apiFetch<WarmupSession>('/warmup/start', {
      method: 'POST',
      body: JSON.stringify({ domain_account_id: domainAccountId }),
    }),

  pause: (domainAccountId: string) =>
    apiFetch<WarmupSession>('/warmup/pause', {
      method: 'POST',
      body: JSON.stringify({ domain_account_id: domainAccountId }),
    }),

  resume: (domainAccountId: string) =>
    apiFetch<WarmupSession>('/warmup/resume', {
      method: 'POST',
      body: JSON.stringify({ domain_account_id: domainAccountId }),
    }),

  stop: (domainAccountId: string) =>
    apiFetch<void>('/warmup/stop', {
      method: 'POST',
      body: JSON.stringify({ domain_account_id: domainAccountId }),
    }),

  getRecentLogs: (limit?: number) =>
    apiFetch<MailLog[]>(`/warmup/logs${limit ? `?limit=${limit}` : ''}`),
};

// ====================================
// Health Check
// ====================================

export const healthApi = {
  check: () => apiFetch<{ status: string; services: Record<string, string> }>('/health'),
};
