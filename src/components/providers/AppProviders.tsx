
'use client';

import { ReactNode, useEffect } from 'react';

import AppErrorBoundary from '@/components/providers/AppErrorBoundary';
import ToastProvider from '@/components/providers/ToastProvider';

const ThemeWatcher = () => {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      document.documentElement.dataset.theme = media.matches ? 'dark' : 'light';
    };
    applyTheme();
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, []);
  return null;
};

const AppProviders = ({ children }: { children: ReactNode }) => (
  <ToastProvider>
    <AppErrorBoundary>
      <ThemeWatcher />
      {children}
    </AppErrorBoundary>
  </ToastProvider>
);

export default AppProviders;
