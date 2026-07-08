'use client';

/**
 * Shared list + create/edit/delete UI for domain and lead accounts.
 */

import { useCallback, useEffect, useState } from 'react';
import { api, type AccountFormData } from '@/lib/client-api';
import type { PublicDomainAccount, PublicLeadAccount } from '@/lib/types';
import AccountForm from './AccountForm';
import ConfirmModal from './ConfirmModal';
import Modal from './Modal';
import StatusBadge from './StatusBadge';
import { showToast } from './Toast';

type AnyAccount = PublicDomainAccount | PublicLeadAccount;

interface AccountsManagerProps {
  kind: 'domain' | 'lead';
  title: string;
  description: string;
  addLabel: string;
}

function isDomainAccount(account: AnyAccount): account is PublicDomainAccount {
  return 'status' in account;
}

export default function AccountsManager({ kind, title, description, addLabel }: AccountsManagerProps) {
  const client = kind === 'domain' ? api.domainAccounts : api.leadAccounts;

  const [accounts, setAccounts] = useState<AnyAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AnyAccount | null>(null);
  const [deleting, setDeleting] = useState<AnyAccount | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const fetchAccounts = useCallback(() => client.list().then((r) => r.data), [client]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchAccounts();
        if (!cancelled) setAccounts(data);
      } catch (error) {
        if (!cancelled) showToast(`Failed to load accounts: ${(error as Error).message}`, 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [fetchAccounts]);

  async function reload() {
    try {
      setAccounts(await fetchAccounts());
    } catch (error) {
      showToast(`Failed to load accounts: ${(error as Error).message}`, 'error');
    }
  }

  async function handleCreate(data: AccountFormData) {
    await client.create(data);
    showToast('Account created', 'success');
    setShowForm(false);
    await reload();
  }

  async function handleUpdate(data: AccountFormData) {
    if (!editing) return;
    // Blank passwords mean "keep existing" — the API treats absent/empty the same
    await client.update(editing.id, data);
    showToast('Account updated', 'success');
    setEditing(null);
    await reload();
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await client.remove(deleting.id);
      showToast('Account deleted', 'success');
      setDeleting(null);
      await reload();
    } catch (error) {
      showToast(`Failed to delete: ${(error as Error).message}`, 'error');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          + {addLabel}
        </button>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-sm text-gray-500">No accounts yet. Add your first one to get started.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Sender</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">SMTP</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">IMAP</th>
                {kind === 'domain' && (
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                )}
                <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{account.sender_name}</td>
                  <td className="px-4 py-3 text-gray-700">{account.email}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {account.smtp_host}:{account.smtp_port}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {account.imap_host}:{account.imap_port}
                  </td>
                  {isDomainAccount(account) && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={account.status} />
                        {account.auto_warmup && (
                          <span className="inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
                            Auto
                          </span>
                        )}
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditing(account)}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleting(account)}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={showForm} title={addLabel} onClose={() => setShowForm(false)} wide>
        <AccountForm mode={kind} onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
      </Modal>

      <Modal isOpen={editing !== null} title="Edit account" onClose={() => setEditing(null)} wide>
        {editing && (
          <AccountForm
            mode={kind}
            initialData={{
              sender_name: editing.sender_name,
              email: editing.email,
              smtp_host: editing.smtp_host,
              smtp_port: editing.smtp_port,
              smtp_secure: editing.smtp_secure,
              imap_host: editing.imap_host,
              imap_port: editing.imap_port,
              imap_secure: editing.imap_secure,
              ...(isDomainAccount(editing) ? { auto_warmup: editing.auto_warmup } : {}),
            }}
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      <ConfirmModal
        isOpen={deleting !== null}
        title="Delete account"
        message={`Delete ${deleting?.email}? Its warm-up history stays, but the mailbox will no longer participate in sessions.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleteBusy}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
