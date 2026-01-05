'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AuthMeResponse } from '@/types/api';

const isAutomationEnvironment = () =>
  process.env.NEXT_PUBLIC_E2E === 'true' || (typeof navigator !== 'undefined' && navigator.webdriver);
const E2E_SESSION: AuthMeResponse['session'] = {
  mode: 'guest',
  userId: 'e2e-guest',
  sessionId: 'e2e-session',
};

export const useAuthClient = () => {
  const automationEnabled = useMemo(() => isAutomationEnvironment(), []);
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
      console.error('[auth] failed to load session', error);
      setStatus('ready');
    }
  }, [automationEnabled]);

  useEffect(() => {
    if (automationEnabled) return;
    hydrate();
  }, [automationEnabled, hydrate]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.info('[auth] automationEnabled', automationEnabled);
    }
  }, [automationEnabled]);

  const login = useCallback(() => {
    if (automationEnabled) return;
    window.location.href = `/auth/google?returnTo=${encodeURIComponent(window.location.pathname)}`;
  }, [automationEnabled]);

  const logout = useCallback(async () => {
    if (automationEnabled) return;
    await fetch('/auth/logout');
    hydrate();
  }, [automationEnabled, hydrate]);

  return { session, status, login, logout };
};
