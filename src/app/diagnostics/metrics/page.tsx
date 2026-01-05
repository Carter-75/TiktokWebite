'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type MetricEvent = {
  event: string;
  count: number;
  lastSampleAt: string;
  sample?: Record<string, unknown>;
};

type MetricSnapshot = {
  generatedAt: string;
  events: MetricEvent[];
};

const STORAGE_KEY = 'product-pulse.metrics-dashboard-key';

const formatTimestamp = (iso?: string) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
};

const MetricsDashboardPage = () => {
  const [formKey, setFormKey] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [snapshot, setSnapshot] = useState<MetricSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setFormKey(stored);
      setApiKey(stored);
    }
  }, []);

  const fetchSnapshot = useCallback(async (key: string) => {
    if (!key) {
      setSnapshot(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/metrics/summary', {
        headers: {
          'x-metrics-key': key,
        },
        cache: 'no-store',
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? 'Unexpected error fetching metrics');
      }
      setSnapshot(payload.snapshot as MetricSnapshot);
    } catch (fetchError) {
      setError((fetchError as Error).message);
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSnapshot(apiKey);
  }, [apiKey, fetchSnapshot]);

  const handleKeySubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = formKey.trim();
    setApiKey(trimmed);
    if (trimmed) {
      window.localStorage.setItem(STORAGE_KEY, trimmed);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  };

  const totalEvents = useMemo(
    () => snapshot?.events.reduce((sum, entry) => sum + entry.count, 0) ?? 0,
    [snapshot?.events]
  );
  const latestSampleAt = useMemo(() => {
    if (!snapshot?.events.length) return '—';
    const latest = snapshot.events.reduce((latestIso, entry) =>
      entry.lastSampleAt > latestIso ? entry.lastSampleAt : latestIso
    , '');
    return formatTimestamp(latest);
  }, [snapshot?.events]);

  const groupedEvents = useMemo(() => {
    if (!snapshot) return [] as MetricEvent[];
    return [...snapshot.events].sort((a, b) => b.count - a.count);
  }, [snapshot]);

  return (
    <main className="metrics-dashboard">
      <header>
        <div>
          <p className="metrics-dashboard__eyebrow">Diagnostics</p>
          <h1>Usage & cost dashboard</h1>
          <p>
            Inspect live metrics captured from the AI + retailer pipeline. Provide the shared read key to decrypt the
            feed and refresh on demand. Keys are stored locally only.
          </p>
        </div>
      </header>

      <section className="metrics-dashboard__controls">
        <form onSubmit={handleKeySubmit}>
          <label>
            Metrics read key
            <input
              type="password"
              value={formKey}
              onChange={(event) => setFormKey(event.target.value)}
              placeholder="Paste METRICS_READ_KEY"
            />
          </label>
          <div className="metrics-dashboard__actions">
            <button type="submit" className="button is-link" disabled={loading}>
              {apiKey ? 'Update key' : 'Save key'}
            </button>
            <button type="button" className="button is-light" onClick={() => void fetchSnapshot(apiKey)} disabled={loading || !apiKey}>
              Refresh snapshot
            </button>
          </div>
        </form>
        {error && <p className="metrics-dashboard__error">{error}</p>}
      </section>

      <section className="metrics-dashboard__summary">
        <article>
          <p>Total events</p>
          <strong>{totalEvents.toLocaleString()}</strong>
        </article>
        <article>
          <p>Unique metrics</p>
          <strong>{snapshot?.events.length ?? 0}</strong>
        </article>
        <article>
          <p>Last sample</p>
          <strong>{latestSampleAt}</strong>
        </article>
        <article>
          <p>Snapshot generated</p>
          <strong>{formatTimestamp(snapshot?.generatedAt)}</strong>
        </article>
      </section>

      <section className="metrics-dashboard__table">
        <header>
          <h2>Event log</h2>
          <span>{groupedEvents.length} tracked</span>
        </header>
        {!snapshot || groupedEvents.length === 0 ? (
          <p className="metrics-dashboard__empty">No metrics available yet. Trigger AI calls or ad events to populate the feed.</p>
        ) : (
          <div className="metrics-dashboard__table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Count</th>
                  <th>Last sample</th>
                  <th>Sample meta</th>
                </tr>
              </thead>
              <tbody>
                {groupedEvents.map((entry) => (
                  <tr key={entry.event}>
                    <td>{entry.event}</td>
                    <td>{entry.count.toLocaleString()}</td>
                    <td>{formatTimestamp(entry.lastSampleAt)}</td>
                    <td>
                      {entry.sample ? (
                        <pre>{JSON.stringify(entry.sample, null, 2)}</pre>
                      ) : (
                        <span className="metrics-dashboard__muted">None</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
};

export default MetricsDashboardPage;
