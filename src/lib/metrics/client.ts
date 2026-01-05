'use client';

import { STORAGE_KEYS } from '@/lib/preferences/storage';

type Meta = Record<string, unknown>;

const telemetryAllowed = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    if (!raw) return true;
    const parsed = JSON.parse(raw) as { telemetryEnabled?: boolean };
    return parsed.telemetryEnabled !== false;
  } catch {
    return true;
  }
};

const sendMetric = (event: string, meta?: Meta) => {
  if (typeof window === 'undefined' || !telemetryAllowed()) return;
  const payload = JSON.stringify({ event, meta, ts: Date.now() });
  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: 'application/json' });
    navigator.sendBeacon('/api/metrics/events', blob);
    return;
  }
  void fetch('/api/metrics/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  });
};

export const trackAdImpression = (placement: string, extra?: Meta) => {
  sendMetric('ad_impression', { placement, ...extra });
};

export const trackClientEvent = (event: string, meta?: Meta) => {
  sendMetric(event, meta);
};
