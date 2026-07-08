'use client';

/**
 * Warm-up control center: pick a domain mailbox, start/pause/resume/stop its
 * session, watch live progress, and inspect session history + mail logs.
 */

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client-api';
import type {
  MailLogRow,
  PublicDomainAccount,
  PublicLeadAccount,
  SessionStep,
  WarmupSessionRow,
  WarmupStatusPayload,
} from '@/lib/types';
import ConfirmModal from '@/components/ConfirmModal';
import StatusBadge from '@/components/StatusBadge';
import { showToast } from '@/components/Toast';

const STEP_LABELS: Record<SessionStep, string> = {
  send_intro: 'Sending the intro email',
  await_intro: 'Waiting for delivery to the lead inbox',
  send_reply: 'Lead reply scheduled (human-like delay)',
  await_reply: 'Waiting for the reply to reach the domain inbox',
};

export default function WarmupPage() {
  const [domains, setDomains] = useState<PublicDomainAccount[]>([]);
  const [leads, setLeads] = useState<PublicLeadAccount[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [status, setStatus] = useState<WarmupStatusPayload | null>(null);
  const [sessions, setSessions] = useState<WarmupSessionRow[]>([]);
  const [viewingLogs, setViewingLogs] = useState<{ sessionId: string; logs: MailLogRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [domainsRes, leadsRes] = await Promise.all([
          api.domainAccounts.list(),
          api.leadAccounts.list(),
        ]);
        setDomains(domainsRes.data);
        setLeads(leadsRes.data);
      } catch (error) {
        showToast(`Failed to load accounts: ${(error as Error).message}`, 'error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const fetchState = useCallback(async () => {
    const [statusRes, sessionsRes] = await Promise.all([
      api.warmup.status(selectedId),
      api.warmup.sessions(selectedId),
    ]);
    return { status: statusRes.data, sessions: sessionsRes.data };
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    async function poll() {
      try {
        const next = await fetchState();
        if (cancelled) return;
        setStatus(next.status);
        setSessions(next.sessions);
      } catch {
        // silent during polling
      }
    }
    poll();
    const interval = setInterval(poll, 8_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedId, fetchState]);

  async function refresh() {
    if (!selectedId) return;
    try {
      const next = await fetchState();
      setStatus(next.status);
      setSessions(next.sessions);
    } catch {
      // ignore — polling will catch up
    }
  }

  async function run(action: () => Promise<{ message?: string }>, fallbackMessage: string) {
    setBusy(true);
    try {
      const result = await action();
      showToast(result.message ?? fallbackMessage, 'success');
      await refresh();
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const session = status?.session ?? null;
  const isRunning = session?.status === 'in_progress';
  const isPaused = session?.status === 'paused';
  const isCompleted = Boolean(status?.completedToday);
  const canContinueWithNewLeads = session?.status === 'completed' && status?.newLeadsAvailable;
  const canStart =
    Boolean(selectedId) &&
    leads.length > 0 &&
    (!session || ['stopped', 'failed'].includes(session.status) || canContinueWithNewLeads);
  const totalLeads = session?.lead_ids.length ?? 0;
  const progress = totalLeads > 0 ? Math.min(100, Math.round(((session?.current_lead_index ?? 0) / totalLeads) * 100)) : 0;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div>
      <ConfirmModal
        isOpen={confirmStop}
        title="Stop warm-up session"
        message="Stop this warm-up session? Progress is saved — you can start again to resume from the current lead."
        confirmLabel="Stop session"
        variant="danger"
        loading={busy}
        onConfirm={async () => {
          setConfirmStop(false);
          await run(() => api.warmup.stop(selectedId), 'Session stopped');
        }}
        onCancel={() => setConfirmStop(false)}
      />

      <h1 className="mb-6 text-2xl font-bold text-gray-900">Warm-Up Sessions</h1>

      {/* Selector + controls */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Select a domain mailbox</h2>
        {domains.length === 0 ? (
          <p className="text-sm text-gray-500">
            No domain mailboxes configured yet — add one on the Domain Mailboxes page first.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-64 flex-1">
              <select
                value={selectedId}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                  setStatus(null);
                  setSessions([]);
                  setViewingLogs(null);
                }}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              >
                <option value="">— Select a domain mailbox —</option>
                {domains.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.sender_name} ({account.email}) — {account.status}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              {canStart && (
                <button
                  onClick={() => run(() => api.warmup.start(selectedId), 'Warm-up started')}
                  disabled={busy}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {session && session.status !== 'completed' ? 'Resume warm-up' : 'Start warm-up'}
                </button>
              )}
              {isRunning && (
                <button
                  onClick={() => run(() => api.warmup.pause(selectedId), 'Session paused')}
                  disabled={busy}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  Pause
                </button>
              )}
              {isPaused && (
                <button
                  onClick={() => run(() => api.warmup.resume(selectedId), 'Session resumed')}
                  disabled={busy}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Resume
                </button>
              )}
              {(isRunning || isPaused) && (
                <button
                  onClick={() => setConfirmStop(true)}
                  disabled={busy}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Stop
                </button>
              )}
            </div>
          </div>
        )}

        {selectedId && (
          <p className="mt-3 text-sm text-gray-500">
            {leads.length} lead mailbox{leads.length === 1 ? '' : 'es'} configured
            {leads.length === 0 && (
              <span className="ml-1 text-red-600">— add at least one lead mailbox to start</span>
            )}
          </p>
        )}
      </div>

      {/* Completed banner */}
      {isCompleted && session && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="font-semibold text-emerald-800">
            All warm-up conversations completed for today ({session.session_date})
          </p>
          <p className="mt-1 text-sm text-emerald-700">
            {session.emails_sent} sent · {session.replies_sent} replies · {session.leads_skipped} skipped.
            {session.completed_at && <> Finished at {new Date(session.completed_at).toLocaleTimeString()}.</>}
            {' '}A new session can start tomorrow, or add more lead mailboxes to continue today.
          </p>
        </div>
      )}

      {/* Live progress */}
      {session && (isRunning || isPaused) && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Live progress</h2>
            <StatusBadge status={session.status} />
          </div>

          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-gray-600">
              Lead {Math.min(session.current_lead_index + 1, totalLeads)} of {totalLeads}
            </span>
            <span className="font-medium text-gray-900">{progress}%</span>
          </div>
          <div className="mb-4 h-2.5 w-full rounded-full bg-gray-200">
            <div
              className="h-2.5 rounded-full bg-primary-600 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="mb-4 text-sm text-gray-600">
            <span className="font-medium text-gray-900">Current step:</span>{' '}
            {isPaused ? 'Paused' : STEP_LABELS[session.step]}
            <span className="ml-2 text-xs text-gray-400">(the engine advances about once a minute)</span>
          </p>

          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Counter label="Emails sent" value={session.emails_sent} />
            <Counter label="Replies sent" value={session.replies_sent} />
            <Counter label="Replies received" value={session.replies_received} />
            <Counter label="Leads skipped" value={session.leads_skipped} />
          </div>

          {session.error_message && (
            <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {session.error_message}
            </p>
          )}

          <div className="space-y-2">
            {session.lead_ids.map((leadId, index) => {
              const lead = leads.find((l) => l.id === leadId);
              const state =
                index < session.current_lead_index
                  ? 'done'
                  : index === session.current_lead_index
                    ? 'active'
                    : 'pending';
              return (
                <div key={leadId} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-xs font-medium text-gray-400">#{index + 1}</span>
                    <span className="text-sm text-gray-700">{lead?.email ?? 'deleted lead'}</span>
                  </div>
                  <StatusBadge status={state} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Session history */}
      {selectedId && sessions.length > 0 && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Session history</h2>
          <div className="space-y-2">
            {sessions.map((item) => (
              <button
                key={item.id}
                onClick={async () => {
                  try {
                    const { data } = await api.warmup.sessionLogs(item.id);
                    setViewingLogs({ sessionId: item.id, logs: data });
                  } catch (error) {
                    showToast(`Failed to load logs: ${(error as Error).message}`, 'error');
                  }
                }}
                className="flex w-full items-center justify-between rounded-lg border border-gray-100 px-4 py-3 text-left hover:bg-gray-50"
              >
                <div>
                  <span className="text-sm font-medium text-gray-900">{item.session_date}</span>
                  <span className="ml-2 text-xs text-gray-500">
                    {item.emails_sent} sent · {item.replies_received} replies received
                    {item.leads_skipped > 0 && <> · {item.leads_skipped} skipped</>}
                  </span>
                  {item.error_message && (
                    <p className="mt-1 text-xs text-red-500">{item.error_message}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={item.status} />
                  <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mail logs */}
      {viewingLogs && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              Mail logs
              <span className="ml-2 font-normal text-gray-400">({viewingLogs.logs.length} entries)</span>
            </h2>
            <button
              onClick={() => setViewingLogs(null)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Close
            </button>
          </div>

          {viewingLogs.logs.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500">No mail logged for this session yet.</p>
          ) : (
            <div className="space-y-3">
              {viewingLogs.logs.map((log) => (
                <div
                  key={log.id}
                  className={`rounded-lg border p-4 ${
                    log.direction === 'sent'
                      ? 'border-sky-100 bg-sky-50'
                      : log.direction === 'replied'
                        ? 'border-violet-100 bg-violet-50'
                        : 'border-emerald-100 bg-emerald-50'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={log.direction} />
                      {log.lead_index !== null && (
                        <span className="text-xs text-gray-500">Lead #{log.lead_index + 1}</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">{new Date(log.created_at).toLocaleString()}</span>
                  </div>
                  <p className="mb-1 text-xs text-gray-600">
                    <span className="font-medium">From:</span> {log.from_email} →{' '}
                    <span className="font-medium">To:</span> {log.to_email}
                  </p>
                  <p className="text-sm font-medium text-gray-800">{log.subject}</p>
                  {log.body && (
                    <p className="mt-2 whitespace-pre-wrap border-t border-gray-200 pt-2 text-sm text-gray-600">
                      {log.body.slice(0, 300)}
                      {log.body.length > 300 && '…'}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
    </div>
  );
}
