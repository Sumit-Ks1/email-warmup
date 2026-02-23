'use client';

/**
 * Warm-Up Session Dashboard.
 *
 * Core control panel for:
 * - Selecting a domain mailbox to warm up
 * - Starting / Pausing / Resuming / Stopping sessions
 * - Real-time progress tracking with auto-refresh
 * - Viewing mail logs per session
 * - Completed session notifications
 */

import { useEffect, useState, useCallback } from 'react';
import { domainAccountApi, leadAccountApi, warmupApi } from '@/lib/api';
import { DomainAccount, LeadAccount, WarmupSession, WarmupStatus, MailLog } from '@/types';
import StatusBadge from '@/components/StatusBadge';
import ConfirmModal from '@/components/ConfirmModal';
import ToastContainer, { showToast } from '@/components/Toast';

export default function WarmupPage() {
  const [domainAccounts, setDomainAccounts] = useState<DomainAccount[]>([]);
  const [leadAccounts, setLeadAccounts] = useState<LeadAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [status, setStatus] = useState<WarmupStatus | null>(null);
  const [sessions, setSessions] = useState<WarmupSession[]>([]);
  const [selectedSessionLogs, setSelectedSessionLogs] = useState<MailLog[]>([]);
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);

  // Load accounts on mount
  useEffect(() => {
    async function load() {
      try {
        const [domainsRes, leadsRes] = await Promise.all([
          domainAccountApi.list(),
          leadAccountApi.list(),
        ]);
        setDomainAccounts(domainsRes.data || []);
        setLeadAccounts(leadsRes.data || []);
      } catch (error: any) {
        showToast(`Failed to load data: ${error.message}`, 'error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Real-time status polling for selected account
  const refreshStatus = useCallback(async () => {
    if (!selectedAccountId) return;

    try {
      const [statusRes, sessionsRes] = await Promise.all([
        warmupApi.getStatus(selectedAccountId),
        warmupApi.getSessions(selectedAccountId),
      ]);
      setStatus(statusRes.data as WarmupStatus || null);
      setSessions(sessionsRes.data || []);
    } catch {
      // Silent fail for polling
    }
  }, [selectedAccountId]);

  useEffect(() => {
    if (selectedAccountId) {
      refreshStatus();
      const interval = setInterval(refreshStatus, 5000); // Poll every 5 seconds
      return () => clearInterval(interval);
    }
  }, [selectedAccountId, refreshStatus]);

  // Load session logs
  async function loadSessionLogs(sessionId: string) {
    try {
      const res = await warmupApi.getSessionLogs(sessionId);
      setSelectedSessionLogs(res.data || []);
      setViewingSessionId(sessionId);
    } catch (error: any) {
      showToast(`Failed to load logs: ${error.message}`, 'error');
    }
  }

  // Action handlers
  async function handleStart() {
    if (!selectedAccountId) return;
    setActionLoading(true);
    try {
      await warmupApi.start(selectedAccountId);
      showToast('Warm-up session started!', 'success');
      await refreshStatus();
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePause() {
    if (!selectedAccountId) return;
    setActionLoading(true);
    try {
      await warmupApi.pause(selectedAccountId);
      showToast('Session paused', 'info');
      await refreshStatus();
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleResume() {
    if (!selectedAccountId) return;
    setActionLoading(true);
    try {
      await warmupApi.resume(selectedAccountId);
      showToast('Session resumed', 'success');
      await refreshStatus();
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleStop() {
    if (!selectedAccountId) return;
    setActionLoading(true);
    try {
      await warmupApi.stop(selectedAccountId);
      showToast('Session stopped', 'info');
      setShowStopConfirm(false);
      await refreshStatus();
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setActionLoading(false);
    }
  }

  // Derived state
  const selectedAccount = domainAccounts.find((a) => a.id === selectedAccountId);
  const isRunning = status?.active?.isActive && !status?.active?.isPaused;
  const isPaused = status?.session?.status === 'paused' || status?.active?.isPaused;
  const isCompleted = status?.completedToday;
  const canStart = selectedAccountId && !isRunning && !isPaused && !isCompleted && leadAccounts.length > 0;
  const canPause = isRunning;
  const canResume = isPaused;
  const canStop = isRunning || isPaused;

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
        isOpen={showStopConfirm}
        title="Stop Warm-Up Session"
        message="Are you sure you want to stop this warm-up session? Progress will be saved and you can restart tomorrow."
        confirmLabel="Stop Session"
        onConfirm={handleStop}
        onCancel={() => setShowStopConfirm(false)}
        variant="danger"
      />

      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Warm-Up Sessions</h1>

        {/* Account Selector */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Select Domain Mailbox</h2>

          {domainAccounts.length === 0 ? (
            <p className="text-sm text-gray-500">
              No domain accounts configured. Add one in the Domain Emails page first.
            </p>
          ) : (
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <select
                  value={selectedAccountId}
                  onChange={(e) => {
                    setSelectedAccountId(e.target.value);
                    setStatus(null);
                    setSessions([]);
                    setViewingSessionId(null);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">-- Select a domain email --</option>
                  {domainAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.sender_name} ({account.email}) — {account.status}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                {canStart && (
                  <button
                    onClick={handleStart}
                    disabled={actionLoading}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {actionLoading ? 'Starting...' : 'Start Warm-Up'}
                  </button>
                )}
                {canPause && (
                  <button
                    onClick={handlePause}
                    disabled={actionLoading}
                    className="px-4 py-2 text-sm font-medium text-white bg-yellow-600 rounded-lg hover:bg-yellow-700 disabled:opacity-50 transition-colors"
                  >
                    Pause
                  </button>
                )}
                {canResume && (
                  <button
                    onClick={handleResume}
                    disabled={actionLoading}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    Resume
                  </button>
                )}
                {canStop && (
                  <button
                    onClick={() => setShowStopConfirm(true)}
                    disabled={actionLoading}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    Stop
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Lead count info */}
        {selectedAccountId && (
          <div className="mb-6 text-sm text-gray-600">
            <span className="font-medium">{leadAccounts.length}</span> lead accounts configured
            {leadAccounts.length === 0 && (
              <span className="text-red-600 ml-2">
                — Add at least one lead Gmail to start warm-up
              </span>
            )}
          </div>
        )}

        {/* Completed Today Banner */}
        {isCompleted && status?.session && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-semibold text-green-800">
                  All warm-up completed for today ({status.session.session_date})
                </p>
                <p className="text-sm text-green-600">
                  {selectedAccount?.email} has sent and received all emails to {leadAccounts.length} lead accounts.
                  Completed at {status.session.completed_at ? new Date(status.session.completed_at).toLocaleTimeString() : 'N/A'}.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Live Progress */}
        {status?.active && selectedAccountId && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Live Progress</h2>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">
                  Lead {status.active.currentLeadIndex + 1} of {status.active.totalLeads}
                </span>
                <span className="text-sm font-medium text-gray-900">
                  {Math.round(((status.active.currentLeadIndex) / status.active.totalLeads) * 100)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-primary-600 h-2.5 rounded-full transition-all duration-500"
                  style={{
                    width: `${(status.active.currentLeadIndex / status.active.totalLeads) * 100}%`,
                  }}
                />
              </div>
            </div>

            {/* Lead status list */}
            <div className="space-y-2">
              {leadAccounts.map((lead, index) => {
                let leadStatus: string;
                if (index < status!.active!.currentLeadIndex) {
                  leadStatus = 'completed';
                } else if (index === status!.active!.currentLeadIndex) {
                  leadStatus = status!.session?.status === 'waiting_reply' ? 'waiting_reply' : 'sending';
                } else {
                  leadStatus = 'pending';
                }

                return (
                  <div
                    key={lead.id}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-gray-400 w-6">#{index + 1}</span>
                      <span className="text-sm text-gray-700">{lead.email}</span>
                    </div>
                    <StatusBadge status={leadStatus} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Session History */}
        {selectedAccountId && sessions.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Session History</h2>

            <div className="space-y-2">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between py-3 px-4 rounded-lg hover:bg-gray-50 cursor-pointer border border-gray-100"
                  onClick={() => loadSessionLogs(session.id)}
                >
                  <div>
                    <span className="text-sm font-medium text-gray-900">
                      {session.session_date}
                    </span>
                    <span className="text-xs text-gray-500 ml-2">
                      Lead {session.current_lead_index + 1} / {leadAccounts.length}
                    </span>
                    {session.error_message && (
                      <p className="text-xs text-red-500 mt-1">{session.error_message}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={session.status} />
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Session Logs */}
        {viewingSessionId && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">
                Mail Logs
                <span className="text-gray-400 font-normal ml-2">
                  ({selectedSessionLogs.length} entries)
                </span>
              </h2>
              <button
                onClick={() => {
                  setViewingSessionId(null);
                  setSelectedSessionLogs([]);
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </div>

            {selectedSessionLogs.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No mail logs for this session yet.
              </p>
            ) : (
              <div className="space-y-3">
                {selectedSessionLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-4 rounded-lg border ${
                      log.direction === 'sent'
                        ? 'bg-blue-50 border-blue-100'
                        : log.direction === 'replied'
                        ? 'bg-purple-50 border-purple-100'
                        : 'bg-green-50 border-green-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={log.direction} />
                        {log.lead_index !== null && (
                          <span className="text-xs text-gray-500">Lead #{log.lead_index + 1}</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 mb-1">
                      <span className="font-medium">From:</span> {log.from_email} &rarr;{' '}
                      <span className="font-medium">To:</span> {log.to_email}
                    </div>
                    <div className="text-sm font-medium text-gray-800">{log.subject}</div>
                    {log.body && (
                      <div className="text-sm text-gray-600 mt-2 whitespace-pre-wrap border-t border-gray-200 pt-2">
                        {log.body.substring(0, 300)}
                        {log.body.length > 300 && '...'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
