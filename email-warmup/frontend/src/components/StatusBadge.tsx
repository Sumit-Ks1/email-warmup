'use client';

/**
 * Status badge component for consistent status display.
 */

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusColors: Record<string, string> = {
  idle: 'bg-gray-100 text-gray-700',
  running: 'bg-green-100 text-green-700 animate-pulse',
  paused: 'bg-yellow-100 text-yellow-700',
  pending: 'bg-blue-100 text-blue-700',
  sending: 'bg-indigo-100 text-indigo-700 animate-pulse',
  waiting_reply: 'bg-purple-100 text-purple-700 animate-pulse',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  sent: 'bg-blue-100 text-blue-700',
  received: 'bg-green-100 text-green-700',
  replied: 'bg-purple-100 text-purple-700',
};

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const colors = statusColors[status] || 'bg-gray-100 text-gray-700';

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors} ${className}`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}
