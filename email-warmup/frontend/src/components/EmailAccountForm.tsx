'use client';

/**
 * Email account form component shared between domain and lead account pages.
 * Handles SMTP + IMAP configuration with connection testing.
 */

import { useState } from 'react';
import { showToast } from '@/components/Toast';

interface EmailAccountFormProps {
  mode: 'domain' | 'lead';
  initialData?: {
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
  };
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
  testConnection: (data: any) => Promise<any>;
}

export default function EmailAccountForm({
  mode,
  initialData,
  onSubmit,
  onCancel,
  testConnection,
}: EmailAccountFormProps) {
  const isGmail = mode === 'lead';

  const [formData, setFormData] = useState({
    sender_name: initialData?.sender_name || '',
    email: initialData?.email || '',
    smtp_host: initialData?.smtp_host || (isGmail ? 'smtp.gmail.com' : ''),
    smtp_port: initialData?.smtp_port || 587,
    smtp_secure: initialData?.smtp_secure ?? true,
    smtp_password: initialData?.smtp_password || '',
    imap_host: initialData?.imap_host || (isGmail ? 'imap.gmail.com' : ''),
    imap_port: initialData?.imap_port || 993,
    imap_secure: initialData?.imap_secure ?? true,
    imap_password: initialData?.imap_password || '',
  });

  const [loading, setLoading] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [testingImap, setTestingImap] = useState(false);
  const [smtpVerified, setSmtpVerified] = useState(false);
  const [imapVerified, setImapVerified] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : type === 'number' ? parseInt(value, 10) || 0 : value,
    }));
    // Reset verification when config changes
    if (name.startsWith('smtp')) setSmtpVerified(false);
    if (name.startsWith('imap')) setImapVerified(false);
  }

  async function handleTestSmtp() {
    setTestingSmtp(true);
    try {
      await testConnection({
        host: formData.smtp_host,
        port: formData.smtp_port,
        secure: formData.smtp_secure,
        password: formData.smtp_password,
        email: formData.email,
        type: 'smtp',
      });
      setSmtpVerified(true);
      showToast('SMTP connection successful', 'success');
    } catch (error: any) {
      showToast(`SMTP test failed: ${error.message}`, 'error');
    } finally {
      setTestingSmtp(false);
    }
  }

  async function handleTestImap() {
    setTestingImap(true);
    try {
      await testConnection({
        host: formData.imap_host,
        port: formData.imap_port,
        secure: formData.imap_secure,
        password: formData.imap_password,
        email: formData.email,
        type: 'imap',
      });
      setImapVerified(true);
      showToast('IMAP connection successful', 'success');
    } catch (error: any) {
      showToast(`IMAP test failed: ${error.message}`, 'error');
    } finally {
      setTestingImap(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(formData);
      showToast('Account saved successfully', 'success');
    } catch (error: any) {
      showToast(`Failed to save: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Account Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sender Name</label>
            <input
              type="text"
              name="sender_name"
              value={formData.sender_name}
              onChange={handleChange}
              required
              placeholder="John Doe"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder={isGmail ? 'user@gmail.com' : 'user@yourdomain.com'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        </div>
      </div>

      {/* SMTP Configuration */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">
            SMTP Configuration
            {smtpVerified && (
              <span className="ml-2 text-green-600 text-xs">&#10003; Verified</span>
            )}
          </h3>
          <button
            type="button"
            onClick={handleTestSmtp}
            disabled={testingSmtp || !formData.email || !formData.smtp_password}
            className="px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 rounded-lg hover:bg-primary-100 disabled:opacity-50"
          >
            {testingSmtp ? 'Testing...' : 'Test Connection'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
            <input
              type="text"
              name="smtp_host"
              value={formData.smtp_host}
              onChange={handleChange}
              required
              placeholder="smtp.example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Port</label>
            <input
              type="number"
              name="smtp_port"
              value={formData.smtp_port}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                name="smtp_secure"
                checked={formData.smtp_secure}
                onChange={handleChange}
                className="rounded border-gray-300 text-primary-600"
              />
              TLS/SSL Secure
            </label>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            SMTP Password {isGmail && <span className="text-gray-400">(App Password)</span>}
          </label>
          <input
            type="password"
            name="smtp_password"
            value={formData.smtp_password}
            onChange={handleChange}
            required
            placeholder="••••••••"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>

      {/* IMAP Configuration */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">
            IMAP Configuration
            {imapVerified && (
              <span className="ml-2 text-green-600 text-xs">&#10003; Verified</span>
            )}
          </h3>
          <button
            type="button"
            onClick={handleTestImap}
            disabled={testingImap || !formData.email || !formData.imap_password}
            className="px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 rounded-lg hover:bg-primary-100 disabled:opacity-50"
          >
            {testingImap ? 'Testing...' : 'Test Connection'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">IMAP Host</label>
            <input
              type="text"
              name="imap_host"
              value={formData.imap_host}
              onChange={handleChange}
              required
              placeholder="imap.example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">IMAP Port</label>
            <input
              type="number"
              name="imap_port"
              value={formData.imap_port}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                name="imap_secure"
                checked={formData.imap_secure}
                onChange={handleChange}
                className="rounded border-gray-300 text-primary-600"
              />
              TLS/SSL Secure
            </label>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            IMAP Password {isGmail && <span className="text-gray-400">(App Password)</span>}
          </label>
          <input
            type="password"
            name="imap_password"
            value={formData.imap_password}
            onChange={handleChange}
            required
            placeholder="••••••••"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Saving...' : initialData ? 'Update Account' : 'Add Account'}
        </button>
      </div>
    </form>
  );
}
