'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useToast } from '@/hooks/useToast';
import { staticProducts } from '@/lib/data/staticProducts';
import { loadPreloadQueue, persistPreloadQueue } from '@/lib/preferences/storage';
import { GenerateApiRequest, GenerateApiResponse } from '@/types/api';
import { ProductContent } from '@/types/product';

const detectAutomationMode = () =>
  process.env.NEXT_PUBLIC_E2E === 'true' ||
  (typeof navigator !== 'undefined' && navigator.webdriver) ||
  (typeof document !== 'undefined' && document.cookie?.includes('pp-e2e=1'));

const DESIRED_QUEUE_LENGTH = 3;
const INITIAL_RETRY_DELAY = 1200;
const MAX_RETRY_DELAY = 15000;

const makeFallbackProduct = (): ProductContent => {
  const base = staticProducts[Math.floor(Math.random() * staticProducts.length)];
  return {
    ...base,
    id: `${base.id}-${Math.random().toString(36).slice(2, 8)}`,
    generatedAt: new Date().toISOString(),
    source: 'hybrid',
  };
};

const hasWindow = () => typeof window !== 'undefined';

export const usePreloadQueue = (payload: GenerateApiRequest) => {
  const initialQueue = useMemo(() => (hasWindow() ? loadPreloadQueue() : []), []);
  const automationEnabled = detectAutomationMode();
  const [queue, setQueue] = useState<ProductContent[]>(() =>
    initialQueue.length ? initialQueue : automationEnabled ? [makeFallbackProduct()] : []
  );
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'retrying'>('idle');
  useEffect(() => {
    if (!hasWindow()) return;
    (window as typeof window & { __preloadQueueSnapshot?: unknown }).__preloadQueueSnapshot = {
      automationEnabled,
      queueLength: queue.length,
      status,
    };
  }, [automationEnabled, queue.length, status]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(() => (hasWindow() ? !navigator.onLine : false));
  const abortRef = useRef<AbortController | null>(null);
  const queueRef = useRef<ProductContent[]>(queue);
  const retryDelayRef = useRef(INITIAL_RETRY_DELAY);
  const retryTimerRef = useRef<number | null>(null);
  const toastCooldownRef = useRef<Record<string, number>>({});
  const offlineToastShown = useRef(false);
  const rateLimitResetRef = useRef(0);
  const rateLimitedRef = useRef(false);
  const { pushToast } = useToast();

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const notify = useCallback(
    (key: string, tone: 'info' | 'success' | 'warning' | 'danger', message: string) => {
      const now = Date.now();
      const last = toastCooldownRef.current[key] ?? 0;
      if (now - last < 5000) return;
      toastCooldownRef.current[key] = now;
      pushToast({ tone, message });
    },
    [pushToast]
  );

  const payloadKey = useMemo(() => JSON.stringify(payload), [payload]);

  const fetchNext = useCallback(async (): Promise<ProductContent | null> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (automationEnabled) {
      return makeFallbackProduct();
    }

    if (hasWindow() && !navigator.onLine) {
      setIsOffline(true);
      if (!offlineToastShown.current) {
        offlineToastShown.current = true;
        notify('offline', 'warning', 'Offline detected. Serving cached drops.');
      }
      return makeFallbackProduct();
    }

    offlineToastShown.current = false;

    try {
      setLoading(true);
      setStatus('loading');
      const res = await fetch('/api/generate', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
      if (res.status === 429) {
        const retryAfterHeader = res.headers.get('Retry-After');
        const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
        const retryAfterMs = Number.isFinite(retryAfterSeconds)
          ? Math.max(500, retryAfterSeconds * 1000)
          : Math.max(retryDelayRef.current, INITIAL_RETRY_DELAY);
        rateLimitResetRef.current = Date.now() + retryAfterMs;
        rateLimitedRef.current = true;
        setLastError('Rate limit hit');
        setStatus('retrying');
        const waitSeconds = Math.ceil(retryAfterMs / 1000);
        notify('rate-limit', 'warning', `Easy there—give the feed ~${waitSeconds}s to recover.`);
        return null;
      }
      if (!res.ok) {
        throw new Error(`Unable to generate product (${res.status})`);
      }
      const json = (await res.json()) as GenerateApiResponse;
      setLastError(null);
      rateLimitedRef.current = false;
      rateLimitResetRef.current = 0;
      return json.product;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return null;
      }
      console.error('[feed] failed to fetch product', error);
      rateLimitedRef.current = false;
      rateLimitResetRef.current = 0;
      setLastError('Generation failed');
      setStatus('retrying');
      notify('generate-error', 'danger', 'Generation failed. Showing saved picks while we retry.');
      return makeFallbackProduct();
    } finally {
      setLoading(false);
    }
  }, [payload, notify, automationEnabled]);

  const ensureFilled = useCallback(async () => {
    const scheduleRateLimitRetry = (delayMs: number) => {
      if (!hasWindow()) return;
      window.clearTimeout(retryTimerRef.current ?? undefined);
      retryTimerRef.current = window.setTimeout(() => {
        rateLimitedRef.current = false;
        rateLimitResetRef.current = 0;
        retryDelayRef.current = INITIAL_RETRY_DELAY;
        void ensureFilled();
      }, Math.max(delayMs, 0));
    };

    const scheduleStandardRetry = () => {
      if (!hasWindow()) return;
      retryDelayRef.current = Math.min(retryDelayRef.current * 1.5, MAX_RETRY_DELAY);
      window.clearTimeout(retryTimerRef.current ?? undefined);
      retryTimerRef.current = window.setTimeout(() => {
        void ensureFilled();
      }, retryDelayRef.current);
    };

    if (automationEnabled) {
      if (queueRef.current.length === 0) {
        const fallback = makeFallbackProduct();
        queueRef.current = [fallback];
        setQueue([fallback]);
        persistPreloadQueue([fallback]);
      }
      setStatus('idle');
      return;
    }

    if (loading) {
      return;
    }

    if (queueRef.current.length >= DESIRED_QUEUE_LENGTH) {
      setStatus('idle');
      return;
    }

    const now = Date.now();
    if (rateLimitedRef.current && rateLimitResetRef.current > now) {
      setStatus('retrying');
      scheduleRateLimitRetry(rateLimitResetRef.current - now);
      return;
    }

    rateLimitedRef.current = false;
    rateLimitResetRef.current = 0;
    const next = await fetchNext();
    if (!next) {
      if (rateLimitedRef.current && rateLimitResetRef.current > Date.now()) {
        setStatus('retrying');
        scheduleRateLimitRetry(rateLimitResetRef.current - Date.now());
        return;
      }
      setStatus('retrying');
      scheduleStandardRetry();
      return;
    }
    retryDelayRef.current = INITIAL_RETRY_DELAY;
    setStatus('idle');
    setQueue((prev) => {
      const updated = [...prev, next];
      persistPreloadQueue(updated);
      return updated;
    });
  }, [fetchNext, automationEnabled, loading]);

  useEffect(() => {
    if (!hasWindow()) return undefined;
    const handleOffline = () => {
      setIsOffline(true);
      notify('offline', 'warning', 'Offline detected. Serving cached drops.');
    };
    const handleOnline = () => {
      setIsOffline(false);
      notify('online', 'success', 'Back online. Fetching fresh drops.');
      retryDelayRef.current = INITIAL_RETRY_DELAY;
      void ensureFilled();
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [notify, ensureFilled]);

  useEffect(() => {
    retryDelayRef.current = INITIAL_RETRY_DELAY;

    if (!automationEnabled) {
      setQueue([]);
      queueRef.current = [];
      persistPreloadQueue([]);
    }

    void ensureFilled();
    return () => abortRef.current?.abort();
  }, [payloadKey, automationEnabled, ensureFilled]);

  useEffect(() => {
    if (!automationEnabled || !hasWindow()) return;
    const storedQueue = loadPreloadQueue();
    if (storedQueue.length) {
      queueRef.current = storedQueue;
      setQueue(storedQueue);
      persistPreloadQueue(storedQueue);
      setStatus('idle');
      return;
    }
    if (queueRef.current.length === 0) {
      const fallback = makeFallbackProduct();
      queueRef.current = [fallback];
      setQueue([fallback]);
      persistPreloadQueue([fallback]);
      setStatus('idle');
    }
  }, [automationEnabled]);

  useEffect(() => {
    if (queue.length < DESIRED_QUEUE_LENGTH) {
      void ensureFilled();
    }
  }, [queue.length, ensureFilled]);

  const consumeNext = useCallback(() => {
    if (queueRef.current.length === 0) return null;
    const [head, ...rest] = queueRef.current;
    setQueue(rest);
    queueRef.current = rest;
    persistPreloadQueue(rest);
    void ensureFilled();
    return head;
  }, [ensureFilled]);

  useEffect(
    () => () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    },
    []
  );

  return {
    queue,
    consumeNext,
    loading,
    status,
    lastError,
    isOffline,
    refresh: () => void ensureFilled(),
  };
};
