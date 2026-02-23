'use client';

/**
 * Lead Gmail Account Manager page.
 * CRUD interface for lead Gmail accounts with App Password support.
 */

import { useEffect, useState } from 'react';
import { leadAccountApi } from '@/lib/api';
import { LeadAccount } from '@/types';
import EmailAccountForm from '@/components/EmailAccountForm';
import ConfirmModal from '@/components/ConfirmModal';
import ToastContainer, { showToast } from '@/components/Toast';

export default function LeadAccountsPage() {
  const [accounts, setAccounts] = useState<LeadAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function loadAccounts() {
    try {
      const res = await leadAccountApi.list();
      setAccounts(res.data || []);
    } catch (error: any) {
      showToast(`Failed to load accounts: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  async function handleCreate(data: any) {
    await leadAccountApi.create(data);
    setShowForm(false);
    await loadAccounts();
  }

  async function handleUpdate(data: any) {
    if (!editingId) return;
    await leadAccountApi.update(editingId, data);
    setEditingId(null);
    setShowForm(false);
    await loadAccounts();
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await leadAccountApi.delete(deleteId);
      showToast('Account deleted', 'success');
      setDeleteId(null);
      await loadAccounts();
    } catch (error: any) {
      showToast(`Delete failed: ${error.message}`, 'error');
    }
  }

  async function testConnection(data: any) {
    return leadAccountApi.testConnection(data);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <>
      <ToastContainer />
      <ConfirmModal
        isOpen={!!deleteId}
        title="Delete Lead Account"
        message="Are you sure you want to delete this lead Gmail account?"
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        variant="danger"
      />

      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Lead Gmail Accounts</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage Gmail accounts that act as responders during warm-up
            </p>
          </div>
          {!showForm && (
            <button
              onClick={() => {
                setEditingId(null);
                setShowForm(true);
              }}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
            >
              + Add Lead Gmail
            </button>
          )}
        </div>

        {/* Info Banner */}
        {!showForm && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Using Gmail App Passwords</p>
                <p>
                  Lead accounts require Gmail App Passwords (not your regular password).
                  Enable 2FA on each Gmail account, then generate an App Password at{' '}
                  <span className="font-medium">Google Account &gt; Security &gt; 2-Step Verification &gt; App passwords</span>.
                </p>
              </div>
            </div>
          </div>
        )}

        {showForm ? (
          <EmailAccountForm
            mode="lead"
            initialData={editingId ? (accounts.find((a) => a.id === editingId) as any) : undefined}
            onSubmit={editingId ? handleUpdate : handleCreate}
            onCancel={() => {
              setShowForm(false);
              setEditingId(null);
            }}
            testConnection={testConnection}
          />
        ) : accounts.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <svg
              className="w-12 h-12 mx-auto text-gray-300 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No lead accounts yet</h3>
            <p className="text-sm text-gray-500 mb-4">
              Add Gmail accounts to act as warm-up responders.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
            >
              + Add Lead Gmail
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Sender</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">SMTP</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">IMAP</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Added</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr
                    key={account.id}
                    className="border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {account.sender_name}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{account.email}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {account.smtp_host}:{account.smtp_port}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {account.imap_host}:{account.imap_port}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(account.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          setEditingId(account.id);
                          setShowForm(true);
                        }}
                        className="text-primary-600 hover:text-primary-800 font-medium mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteId(account.id)}
                        className="text-red-600 hover:text-red-800 font-medium"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
