'use client';

import { useEffect } from 'react';

import type { Toast } from '@/components/providers/ToastProvider';

type Props = {
  toasts: Toast[];
  onDismiss: (id: string) => void;
};

const ToastStack = ({ toasts, onDismiss }: Props) => {
  useEffect(() => {
    const timers = toasts.map((toast) => {
      const ttl = toast.duration ?? 4000;
      return setTimeout(() => onDismiss(toast.id), ttl);
    });
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, [toasts, onDismiss]);

  if (!toasts.length) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.tone}`}>
          <span>{toast.message}</span>
          <button type="button" aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastStack;
