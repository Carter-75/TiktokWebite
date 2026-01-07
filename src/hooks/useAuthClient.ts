'use client';

import { useCallback, useEffect, useState } from 'react';

import { AuthMeResponse } from '@/types/api';
import { authLogger } from '@/lib/logger';

const detectAutomationMode = () =>
  process.env.NEXT_PUBLIC_E2E === 'true' ||
  (typeof navigator !== 'undefined' && navigator.webdriver) ||
  (typeof document !== 'undefined' && document.cookie?.includes('pp-e2e=1'));
const E2E_SESSION: AuthMeResponse['session'] = {
  mode: 'guest',
  userId: 'e2e-guest',
  sessionId: 'e2e-session',
};

export const useAuthClient = () => {
  const automationEnabled = detectAutomationMode();
  const [session, setSession] = useState<AuthMeResponse['session'] | null>(() =>
    automationEnabled ? E2E_SESSION : null
  );
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready'>(automationEnabled ? 'ready' : 'idle');

  const hydrate = useCallback(async () => {
    if (automationEnabled) return;
    setStatus('loading');
    try {
      const res = await fetch('/auth/me', { cache: 'no-store' });
      const json = (await res.json()) as AuthMeResponse;
      setSession(json.session);
      setStatus('ready');
    } catch (error) {
      authLogger.error('failed to load session', {
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      });
      setStatus('ready');
    }
  }, [automationEnabled]);

  useEffect(() => {
    if (automationEnabled) return;
    hydrate();
  }, [automationEnabled, hydrate]);

  const login = useCallback(() => {
    if (automationEnabled) return;
    window.location.href = `/auth/google?returnTo=${encodeURIComponent(window.location.pathname)}`;
  }, [automationEnabled]);

  const logout = useCallback(async () => {
    if (automationEnabled) return;
    await fetch('/auth/logout', {
      method: 'POST',
      headers: { 'cache-control': 'no-store' },
    });
    hydrate();
  }, [automationEnabled, hydrate]);

  return { session, status, login, logout };
};
