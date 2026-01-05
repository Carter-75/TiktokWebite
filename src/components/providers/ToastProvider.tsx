'use client';

import { ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react';

import ToastStack from '@/components/ui/ToastStack';

type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export type Toast = {
  id: string;
  tone: ToastTone;
  message: string;
  duration?: number;
};

type ToastContextValue = {
  pushToast: (toast: Omit<Toast, 'id'>) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const randomId = () => (crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((toast: Omit<Toast, 'id'>) => {
    setToasts((prev) => [...prev, { ...toast, id: randomId() }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};

export const useToastContext = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside ToastProvider');
  }
  return ctx;
};

export default ToastProvider;
