'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useToast } from '@/hooks/useToast';
import { staticProducts } from '@/lib/data/staticProducts';
import { loadPreloadQueue, persistPreloadQueue } from '@/lib/preferences/storage';
import { GenerateApiRequest, GenerateApiResponse } from '@/types/api';
import { ProductContent } from '@/types/product';

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
  const initialQueue = useMemo(() => loadPreloadQueue(), []);
  const [queue, setQueue] = useState<ProductContent[]>(initialQueue);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'retrying'>('idle');
  const [lastError, setLastError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(() => (hasWindow() ? !navigator.onLine : false));
  const abortRef = useRef<AbortController | null>(null);
  const queueRef = useRef<ProductContent[]>(initialQueue);
  const retryDelayRef = useRef(INITIAL_RETRY_DELAY);
  const retryTimerRef = useRef<number | null>(null);
  const toastCooldownRef = useRef<Record<string, number>>({});
  const offlineToastShown = useRef(false);
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
        setLastError('Rate limit hit');
        setStatus('retrying');
        notify('rate-limit', 'warning', 'Easy there—give the feed a second to recover.');
        return null;
      }
      if (!res.ok) {
        throw new Error(`Unable to generate product (${res.status})`);
      }
      const json = (await res.json()) as GenerateApiResponse;
      setLastError(null);
      return json.product;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return null;
      }
      console.error('[feed] failed to fetch product', error);
      setLastError('Generation failed');
      setStatus('retrying');
      notify('generate-error', 'danger', 'Generation failed. Showing saved picks while we retry.');
      return makeFallbackProduct();
    } finally {
      setLoading(false);
    }
  }, [payload, notify]);

  const ensureFilled = useCallback(async () => {
    if (queueRef.current.length >= DESIRED_QUEUE_LENGTH) {
      setStatus('idle');
      return;
    }
    const next = await fetchNext();
    if (!next) {
      if (hasWindow()) {
        retryDelayRef.current = Math.min(retryDelayRef.current * 1.5, MAX_RETRY_DELAY);
        window.clearTimeout(retryTimerRef.current ?? undefined);
        retryTimerRef.current = window.setTimeout(() => {
          void ensureFilled();
        }, retryDelayRef.current);
      }
      return;
    }
    retryDelayRef.current = INITIAL_RETRY_DELAY;
    setStatus('idle');
    setQueue((prev) => {
      const updated = [...prev, next];
      persistPreloadQueue(updated);
      return updated;
    });
  }, [fetchNext]);

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
    setQueue([]);
    queueRef.current = [];
    persistPreloadQueue([]);
    retryDelayRef.current = INITIAL_RETRY_DELAY;
    void ensureFilled();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadKey]);

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
