'use client';

import { useCallback, useEffect, useState } from 'react';

import { AuthMeResponse } from '@/types/api';

export const useAuthClient = () => {
  const [session, setSession] = useState<AuthMeResponse['session'] | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready'>('idle');

  const hydrate = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const login = useCallback(() => {
    window.location.href = `/auth/google?returnTo=${encodeURIComponent(window.location.pathname)}`;
  }, []);

  const logout = useCallback(async () => {
    await fetch('/auth/logout');
    hydrate();
  }, [hydrate]);

  return { session, status, login, logout };
};
