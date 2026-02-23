'use client';

/**
 * Reusable confirmation modal component.
 */

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'primary';
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'primary',
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const buttonColor =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
      : 'bg-primary-600 hover:bg-primary-700 focus:ring-primary-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black bg-opacity-30"
        onClick={onCancel}
      />
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${buttonColor}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
