'use client';

/**
 * Toast notification component.
 */

import { useEffect, useState } from 'react';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

let toastCallback: ((toast: Toast) => void) | null = null;

export function showToast(message: string, type: Toast['type'] = 'info') {
  const id = Math.random().toString(36).substr(2, 9);
  if (toastCallback) {
    toastCallback({ id, message, type });
  }
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    toastCallback = (toast: Toast) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 5000);
    };
    return () => {
      toastCallback = null;
    };
  }, []);

  if (toasts.length === 0) return null;

  const bgColors = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  };

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`px-4 py-3 rounded-lg border shadow-lg text-sm font-medium animate-slide-in ${bgColors[toast.type]}`}
        >
          {toast.message}
          <button
            onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
            className="ml-3 font-bold opacity-50 hover:opacity-100"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
