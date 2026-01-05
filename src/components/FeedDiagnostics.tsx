'use client';

import { useMemo, useState } from 'react';

import type { ProductContent } from '@/types/product';

type FeedDiagnosticsProps = {
  authStatus: string;
  queueStatus: string;
  queueLength: number;
  lastError: string | null;
  isOffline: boolean;
  sessionMode?: string;
  activeSearch?: string | null;
  currentProduct?: ProductContent | null;
  compareProduct?: ProductContent | null;
};

const FeedDiagnostics = ({
  authStatus,
  queueStatus,
  queueLength,
  lastError,
  isOffline,
  sessionMode,
  activeSearch,
  currentProduct,
  compareProduct,
}: FeedDiagnosticsProps) => {
  const [copied, setCopied] = useState(false);
  const snapshot = useMemo(
    () => ({
      timestamp: new Date().toISOString(),
      authStatus,
      queueStatus,
      queueLength,
      lastError,
      isOffline,
      sessionMode,
      activeSearch,
      currentProductId: currentProduct?.id ?? null,
      compareProductId: compareProduct?.id ?? null,
    }),
    [
      authStatus,
      queueStatus,
      queueLength,
      lastError,
      isOffline,
      sessionMode,
      activeSearch,
      currentProduct?.id,
      compareProduct?.id,
    ]
  );

  const rows = [
    { label: 'Auth', value: authStatus },
    { label: 'Session', value: sessionMode ?? 'guest' },
    { label: 'Queue', value: `${queueLength} (${queueStatus})` },
    { label: 'Offline', value: isOffline ? 'yes' : 'no' },
    { label: 'Active search', value: activeSearch ?? 'none' },
    { label: 'Last error', value: lastError ?? 'none' },
  ];

  const handleCopy = async () => {
    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.warn('[diagnostics] failed to copy snapshot', error);
    }
  };

  return (
    <section className="feed-diagnostics" aria-live="polite">
      <header>
        <h3>Feed diagnostics</h3>
        <span>{snapshot.timestamp}</span>
      </header>
      <div className="feed-diagnostics__grid">
        {rows.map((row) => (
          <dl key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </dl>
        ))}
      </div>
      <div className="feed-diagnostics__actions">
        <button type="button" className="feed-diagnostics__copy" onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy snapshot'}
        </button>
      </div>
    </section>
  );
};

export default FeedDiagnostics;
