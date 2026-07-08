'use client';

import { useState } from 'react';
import { api, type AccountFormData } from '@/lib/client-api';
import { showToast } from './Toast';

interface AccountFormProps {
  mode: 'domain' | 'lead';
  /** Present when editing (passwords are never echoed back). */
  initialData?: Omit<AccountFormData, 'smtp_password' | 'imap_password'>;
  onSubmit: (data: AccountFormData) => Promise<void>;
  onCancel: () => void;
}

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 ' +
  'placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200';

const labelClass = 'mb-1 block text-sm font-medium text-gray-700';

export default function AccountForm({ mode, initialData, onSubmit, onCancel }: AccountFormProps) {
  const isLead = mode === 'lead';
  const isEdit = Boolean(initialData);

  const [form, setForm] = useState<AccountFormData>({
    sender_name: initialData?.sender_name ?? '',
    email: initialData?.email ?? '',
    smtp_host: initialData?.smtp_host ?? (isLead ? 'smtp.gmail.com' : ''),
    smtp_port: initialData?.smtp_port ?? 587,
    smtp_secure: initialData?.smtp_secure ?? true,
    smtp_password: '',
    imap_host: initialData?.imap_host ?? (isLead ? 'imap.gmail.com' : ''),
    imap_port: initialData?.imap_port ?? 993,
    imap_secure: initialData?.imap_secure ?? true,
    imap_password: '',
    ...(mode === 'domain' ? { auto_warmup: initialData?.auto_warmup ?? false } : {}),
  });

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<'smtp' | 'imap' | null>(null);
  const [verified, setVerified] = useState<{ smtp: boolean; imap: boolean }>({ smtp: false, imap: false });

  function setField<K extends keyof AccountFormData>(key: K, value: AccountFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (String(key).startsWith('smtp')) setVerified((v) => ({ ...v, smtp: false }));
    if (String(key).startsWith('imap')) setVerified((v) => ({ ...v, imap: false }));
  }

  async function handleTest(type: 'smtp' | 'imap') {
    const host = type === 'smtp' ? form.smtp_host : form.imap_host;
    const port = type === 'smtp' ? form.smtp_port : form.imap_port;
    const secure = type === 'smtp' ? form.smtp_secure : form.imap_secure;
    const password = type === 'smtp' ? form.smtp_password : form.imap_password;

    if (!form.email || !host || !password) {
      showToast('Fill in email, host and password before testing', 'info');
      return;
    }

    setTesting(type);
    try {
      await api.testConnection({ type, host, port, secure, email: form.email, password });
      setVerified((v) => ({ ...v, [type]: true }));
      showToast(`${type.toUpperCase()} connection successful`, 'success');
    } catch (error) {
      showToast(`${type.toUpperCase()} test failed: ${(error as Error).message}`, 'error');
    } finally {
      setTesting(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit(form);
    } catch (error) {
      showToast(`Failed to save: ${(error as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  function mailSection(type: 'smtp' | 'imap') {
    const upper = type.toUpperCase();
    const host = type === 'smtp' ? form.smtp_host : form.imap_host;
    const port = type === 'smtp' ? form.smtp_port : form.imap_port;
    const secure = type === 'smtp' ? form.smtp_secure : form.imap_secure;
    const password = type === 'smtp' ? form.smtp_password : form.imap_password;

    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            {upper} configuration
            {verified[type] && <span className="ml-2 text-xs font-medium text-emerald-600">✓ Verified</span>}
          </h3>
          <button
            type="button"
            onClick={() => handleTest(type)}
            disabled={testing !== null}
            className="rounded-lg bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100 disabled:opacity-50"
          >
            {testing === type ? 'Testing…' : 'Test connection'}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className={labelClass}>{upper} host</label>
            <input
              type="text"
              value={host}
              onChange={(e) => setField(type === 'smtp' ? 'smtp_host' : 'imap_host', e.target.value)}
              required
              placeholder={type === 'smtp' ? 'smtp.example.com' : 'imap.example.com'}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{upper} port</label>
            <input
              type="number"
              value={port}
              onChange={(e) =>
                setField(type === 'smtp' ? 'smtp_port' : 'imap_port', Number.parseInt(e.target.value, 10) || 0)
              }
              required
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-400">
              {type === 'smtp' ? 'Usually 587 or 465' : 'Usually 993'}
            </p>
          </div>
          <div className="flex items-start pt-7">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={secure}
                onChange={(e) => setField(type === 'smtp' ? 'smtp_secure' : 'imap_secure', e.target.checked)}
                className="rounded border-gray-300 text-primary-600"
              />
              TLS / SSL
            </label>
          </div>
        </div>

        <div className="mt-4">
          <label className={labelClass}>
            {upper} password {isLead && <span className="text-gray-400">(Gmail App Password)</span>}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setField(type === 'smtp' ? 'smtp_password' : 'imap_password', e.target.value)}
            required={!isEdit}
            placeholder={isEdit ? 'Leave blank to keep current password' : '••••••••'}
            autoComplete="new-password"
            className={inputClass}
          />
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Account details</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>Sender name</label>
            <input
              type="text"
              value={form.sender_name}
              onChange={(e) => setField('sender_name', e.target.value)}
              required
              placeholder="John Doe"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Email address</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              required
              placeholder={isLead ? 'user@gmail.com' : 'user@yourdomain.com'}
              className={inputClass}
            />
          </div>
        </div>

        {mode === 'domain' && (
          <label className="mt-4 flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.auto_warmup ?? false}
              onChange={(e) => setField('auto_warmup', e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-primary-600"
            />
            <span>
              <span className="font-medium">Auto warm-up</span>
              <span className="block text-xs text-gray-500">
                Start a session automatically every day — no clicking required.
              </span>
            </span>
          </label>
        )}
      </div>

      {mailSection('smtp')}
      {mailSection('imap')}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-primary-600 px-6 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : isEdit ? 'Update account' : 'Add account'}
        </button>
      </div>
    </form>
  );
}
