'use client';

/**
 * Dashboard home page — overview of system health and recent activity.
 */

import { useEffect, useState } from 'react';
import { healthApi, domainAccountApi, leadAccountApi, warmupApi } from '@/lib/api';
import { DomainAccount, LeadAccount, MailLog } from '@/types';
import StatusBadge from '@/components/StatusBadge';
import ToastContainer from '@/components/Toast';

export default function DashboardPage() {
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [domainAccounts, setDomainAccounts] = useState<DomainAccount[]>([]);
  const [leadAccounts, setLeadAccounts] = useState<LeadAccount[]>([]);
  const [recentLogs, setRecentLogs] = useState<MailLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [healthRes, domainsRes, leadsRes, logsRes] = await Promise.all([
          healthApi.check().catch(() => null),
          domainAccountApi.list().catch(() => ({ data: [] })),
          leadAccountApi.list().catch(() => ({ data: [] })),
          warmupApi.getRecentLogs(20).catch(() => ({ data: [] })),
        ]);

        setHealthy(healthRes?.data?.status === 'healthy');
        setDomainAccounts(domainsRes?.data || []);
        setLeadAccounts(leadsRes?.data || []);
        setRecentLogs(logsRes?.data || []);
      } catch {
        setHealthy(false);
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
    const interval = setInterval(loadDashboard, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const runningAccounts = domainAccounts.filter((a) => a.status === 'running');

  return (
    <>
      <ToastContainer />
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="System Health"
            value={healthy ? 'Healthy' : 'Unhealthy'}
            color={healthy ? 'green' : 'red'}
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            title="Domain Emails"
            value={domainAccounts.length.toString()}
            color="blue"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            }
          />
          <StatCard
            title="Lead Gmails"
            value={leadAccounts.length.toString()}
            color="purple"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
          />
          <StatCard
            title="Active Sessions"
            value={runningAccounts.length.toString()}
            color="indigo"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
          />
        </div>

        {/* Running Sessions */}
        {runningAccounts.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Active Warm-Ups</h2>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {runningAccounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-4 border-b border-gray-100 last:border-0"
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

        {/* Recent Activity */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Recent Activity</h2>
          {recentLogs.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
              No email activity yet. Start a warm-up session to begin.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Direction</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">From</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">To</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Subject</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLogs.map((log) => (
                    <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <StatusBadge status={log.direction} />
                      </td>
                      <td className="px-4 py-3 text-gray-700">{log.from_email}</td>
                      <td className="px-4 py-3 text-gray-700">{log.to_email}</td>
                      <td className="px-4 py-3 text-gray-700 max-w-xs truncate">
                        {log.subject}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
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
    </>
  );
}

function StatCard({
  title,
  value,
  color,
  icon,
}: {
  title: string;
  value: string;
  color: string;
  icon: React.ReactNode;
}) {
  const colorClasses: Record<string, string> = {
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    indigo: 'bg-indigo-50 text-indigo-600',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-500">{title}</span>
        <span className={`p-2 rounded-lg ${colorClasses[color]}`}>{icon}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
