'use client';

/**
 * Domain Email Account Manager page.
 * CRUD interface for sender mailboxes.
 */

import { useEffect, useState } from 'react';
import { domainAccountApi } from '@/lib/api';
import { DomainAccount } from '@/types';
import EmailAccountForm from '@/components/EmailAccountForm';
import StatusBadge from '@/components/StatusBadge';
import ConfirmModal from '@/components/ConfirmModal';
import ToastContainer, { showToast } from '@/components/Toast';

export default function DomainAccountsPage() {
  const [accounts, setAccounts] = useState<DomainAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function loadAccounts() {
    try {
      const res = await domainAccountApi.list();
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
    await domainAccountApi.create(data);
    setShowForm(false);
    await loadAccounts();
  }

  async function handleUpdate(data: any) {
    if (!editingId) return;
    await domainAccountApi.update(editingId, data);
    setEditingId(null);
    setShowForm(false);
    await loadAccounts();
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await domainAccountApi.delete(deleteId);
      showToast('Account deleted', 'success');
      setDeleteId(null);
      await loadAccounts();
    } catch (error: any) {
      showToast(`Delete failed: ${error.message}`, 'error');
    }
  }

  async function testConnection(data: any) {
    return domainAccountApi.testConnection(data);
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
        title="Delete Domain Account"
        message="Are you sure you want to delete this domain email account? All associated warm-up sessions will also be removed."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        variant="danger"
      />

      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Domain Email Accounts</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage sender mailboxes for warm-up campaigns
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
              + Add Domain Email
            </button>
          )}
        </div>

        {showForm ? (
          <EmailAccountForm
            mode="domain"
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
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No domain accounts yet</h3>
            <p className="text-sm text-gray-500 mb-4">
              Add your first domain email account to get started with warm-up.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
            >
              + Add Domain Email
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
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
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
                    <td className="px-4 py-3">
                      <StatusBadge status={account.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          setEditingId(account.id);
                          setShowForm(true);
                        }}
                        disabled={account.status === 'running'}
                        className="text-primary-600 hover:text-primary-800 font-medium mr-3 disabled:opacity-40"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteId(account.id)}
                        disabled={account.status === 'running'}
                        className="text-red-600 hover:text-red-800 font-medium disabled:opacity-40"
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
