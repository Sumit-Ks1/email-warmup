'use client';

/**
 * Dashboard — system health, mailbox counts, active sessions, recent activity.
 */

import { useEffect, useState } from 'react';
import { api, type HealthPayload } from '@/lib/client-api';
import type { MailLogRow, PublicDomainAccount, PublicLeadAccount } from '@/lib/types';
import StatusBadge from '@/components/StatusBadge';

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [domains, setDomains] = useState<PublicDomainAccount[]>([]);
  const [leads, setLeads] = useState<PublicLeadAccount[]>([]);
  const [logs, setLogs] = useState<MailLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [healthRes, domainsRes, leadsRes, logsRes] = await Promise.all([
        api.health().catch(() => null),
        api.domainAccounts.list().catch(() => null),
        api.leadAccounts.list().catch(() => null),
        api.warmup.recentLogs(20).catch(() => null),
      ]);
      if (cancelled) return;
      setHealth(healthRes?.data ?? null);
      setDomains(domainsRes?.data ?? []);
      setLeads(leadsRes?.data ?? []);
      setLogs(logsRes?.data ?? []);
      setLoading(false);
    }

    load();
    const interval = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    );
  }

  const running = domains.filter((d) => d.status === 'running');
  const healthy = health?.status === 'healthy';

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Dashboard</h1>

      {health && !healthy && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">Setup incomplete</p>
          <p className="mt-1">
            Database: {health.database}
            {health.missingEnv.length > 0 && (
              <> · missing environment variables: {health.missingEnv.join(', ')}</>
            )}
            . See the README for the deployment checklist.
          </p>
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="System health"
          value={health ? (healthy ? 'Healthy' : 'Degraded') : 'Offline'}
          tone={healthy ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}
          icon={
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="Domain mailboxes"
          value={String(domains.length)}
          tone="text-blue-600 bg-blue-50"
          icon={
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
        />
        <StatCard
          title="Lead mailboxes"
          value={String(leads.length)}
          tone="text-violet-600 bg-violet-50"
          icon={
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
        <StatCard
          title="Active warm-ups"
          value={String(running.length)}
          tone="text-primary-600 bg-primary-50"
          icon={
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
      </div>

      {running.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Active warm-ups</h2>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            {running.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between border-b border-gray-100 p-4 last:border-0"
              >
                <div>
                  <p className="font-medium text-gray-900">{account.email}</p>
                  <p className="text-sm text-gray-500">{account.sender_name}</p>
                </div>
                <StatusBadge status={account.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Recent activity</h2>
        {logs.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            No email activity yet. Add mailboxes and start a warm-up session to begin.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">From</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">To</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Subject</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <StatusBadge status={log.direction} />
                    </td>
                    <td className="px-4 py-3 text-gray-700">{log.from_email}</td>
                    <td className="px-4 py-3 text-gray-700">{log.to_email}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-gray-700">{log.subject}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  tone,
  icon,
}: {
  title: string;
  value: string;
  tone: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500">{title}</span>
        <span className={`rounded-lg p-2 ${tone}`}>{icon}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
