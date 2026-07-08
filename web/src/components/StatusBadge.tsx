const STYLES: Record<string, string> = {
  // domain account status
  idle: 'bg-gray-100 text-gray-600',
  running: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-amber-100 text-amber-700',
  // session status
  in_progress: 'bg-emerald-100 text-emerald-700',
  stopped: 'bg-gray-100 text-gray-600',
  completed: 'bg-blue-100 text-blue-700',
  failed: 'bg-red-100 text-red-700',
  // mail direction
  sent: 'bg-sky-100 text-sky-700',
  received: 'bg-emerald-100 text-emerald-700',
  replied: 'bg-violet-100 text-violet-700',
  // per-lead progress
  pending: 'bg-gray-100 text-gray-500',
  active: 'bg-primary-100 text-primary-700',
  done: 'bg-emerald-100 text-emerald-700',
};

const LABELS: Record<string, string> = {
  in_progress: 'Running',
  done: 'Done',
};

export default function StatusBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? 'bg-gray-100 text-gray-600';
  const label =
    LABELS[status] ??
    status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}
