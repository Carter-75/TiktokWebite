'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { HistoryEventType, HistorySnapshot, SessionState, UserSettings } from '@/types/preferences';

type Props = {
  open: boolean;
  onClose: () => void;
  session?: SessionState | null;
  settings: UserSettings;
  onUpdateSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
  history: HistorySnapshot;
  onResetHistory: () => void;
  onResetPreferences: () => void;
  onEraseAllData: () => void;
  eraseInProgress: boolean;
};

const formatId = (value?: string) => (value ? value.slice(0, 8) + '…' : 'guest');

const HISTORY_FILTER_LABELS: Record<HistoryEventType | 'all', string> = {
  all: 'Everything',
  viewed: 'Viewed',
  liked: 'Liked',
  disliked: 'Disliked',
  reported: 'Reported',
  search: 'Searches',
  saved: 'Saved',
};

const formatRelativeTime = (iso: string) => {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return 'unknown';
  const diff = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < hour) {
    const mins = Math.max(1, Math.round(diff / minute));
    return `${mins}m ago`;
  }
  if (diff < day) {
    const hours = Math.max(1, Math.round(diff / hour));
    return `${hours}h ago`;
  }
  const days = Math.max(1, Math.round(diff / day));
  return `${days}d ago`;
};

const RETENTION_LABELS: Record<UserSettings['historyRetentionMode'], string> = {
  balanced: 'Balanced · last ~400 interactions',
  extended: 'Extended · last ~4k interactions',
  unlimited: 'Unlimited · keep everything',
};

const PreferencesPanel = ({
  open,
  onClose,
  session,
  settings,
  onUpdateSetting,
  history,
  onResetHistory,
  onResetPreferences,
  onEraseAllData,
  eraseInProgress,
}: Props) => {
  const [timelineFilter, setTimelineFilter] = useState<'all' | HistoryEventType>('all');
  const [timelineQuery, setTimelineQuery] = useState('');
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    if (open) {
      node.removeAttribute('inert');
      return;
    }
    node.setAttribute('inert', '');
  }, [open]);

  const filteredTimeline = useMemo(() => {
    const base = history.timeline ?? [];
    const query = timelineQuery.trim().toLowerCase();
    return base
      .filter((entry) => (timelineFilter === 'all' ? true : entry.type === timelineFilter))
      .filter((entry) => {
        if (!query) return true;
        const haystack = `${entry.product?.title ?? ''} ${entry.search?.query ?? ''} ${entry.product?.tags?.join(' ') ?? ''}`.toLowerCase();
        return haystack.includes(query);
      })
      .slice(-120)
      .reverse();
  }, [history.timeline, timelineFilter, timelineQuery]);

  const downloadHistory = () => {
    const payload = JSON.stringify(history, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `product-pulse-history-${new Date().toISOString()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div ref={panelRef} className={`preferences-panel ${open ? 'is-open' : ''}`} aria-hidden={!open}>
      <div className="preferences-panel__backdrop" onClick={onClose} />
      <aside className="preferences-panel__content" aria-label="Session controls">
        <header>
          <div>
            <p className="preferences-panel__eyebrow">Session</p>
            <h2>Control Center</h2>
            <p className="preferences-panel__description">
              Tune how Product Pulse behaves, wipe data, or review privacy guarantees.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close preferences">
            ×
          </button>
        </header>

        <section>
          <h3>Current identity</h3>
          <dl>
            <div>
              <dt>Mode</dt>
              <dd>{session?.mode ?? 'guest'}</dd>
            </div>
            <div>
              <dt>User ID</dt>
              <dd>{formatId(session?.userId)}</dd>
            </div>
            <div>
              <dt>Session ID</dt>
              <dd>{formatId(session?.sessionId)}</dd>
            </div>
          </dl>
        </section>

        <section>
          <h3>Personalization</h3>
          <label className="preferences-panel__toggle">
            <input
              type="checkbox"
              checked={settings.reducedMotionMode}
              onChange={(event) => onUpdateSetting('reducedMotionMode', event.target.checked)}
            />
            <div>
              <strong>Reduced motion</strong>
              <p>Flatten animations and disable haptic flourishes for calmer browsing.</p>
            </div>
          </label>
          <label className="preferences-panel__toggle">
            <input
              type="checkbox"
              checked={settings.telemetryEnabled}
              onChange={(event) => onUpdateSetting('telemetryEnabled', event.target.checked)}
            />
            <div>
              <strong>Allow anonymous telemetry</strong>
              <p>Share aggregate usage metrics to help tune AI cost controls.</p>
            </div>
          </label>
          <label className="preferences-panel__select">
            <span>History retention</span>
            <select
              value={settings.historyRetentionMode}
              onChange={(event) => onUpdateSetting('historyRetentionMode', event.target.value as UserSettings['historyRetentionMode'])}
            >
              <option value="balanced">{RETENTION_LABELS.balanced}</option>
              <option value="extended">{RETENTION_LABELS.extended}</option>
              <option value="unlimited">{RETENTION_LABELS.unlimited}</option>
            </select>
          </label>
        </section>

        <section>
          <h3>History overview</h3>
          <ul className="preferences-panel__stats">
            <li>
              <span>Viewed</span>
              <strong>{history.viewed.length}</strong>
            </li>
            <li>
              <span>Liked</span>
              <strong>{history.liked.length}</strong>
            </li>
            <li>
              <span>Disliked</span>
              <strong>{history.disliked.length}</strong>
            </li>
            <li>
              <span>Reports</span>
              <strong>{history.reported.length}</strong>
            </li>
            <li>
              <span>Saved</span>
              <strong>{history.saved.length}</strong>
            </li>
            <li>
              <span>Searches</span>
              <strong>{history.searches.length}</strong>
            </li>
          </ul>
          <div className="preferences-panel__actions">
            <button type="button" className="button is-light" onClick={onResetHistory}>
              Clear history
            </button>
            <button type="button" className="button is-danger is-light" onClick={onResetPreferences}>
              Reset personalization
            </button>
            <button type="button" className="button is-dark is-light" onClick={downloadHistory}>
              Download JSON
            </button>
          </div>
        </section>

        <section>
          <h3>History vault</h3>
          <p className="preferences-panel__description">
            Inspect every interaction and search you have made. Use filters to jump to specific signals.
          </p>
          <div className="history-vault__controls">
            <label>
              <span>Filter</span>
              <select
                value={timelineFilter}
                onChange={(event) => setTimelineFilter(event.target.value as 'all' | HistoryEventType)}
              >
                {Object.entries(HISTORY_FILTER_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Search</span>
              <input
                type="text"
                value={timelineQuery}
                onChange={(event) => setTimelineQuery(event.target.value)}
                placeholder="Search titles or queries"
              />
            </label>
          </div>
          {filteredTimeline.length === 0 ? (
            <p className="history-vault__empty">No entries yet. Interact with the feed to populate the vault.</p>
          ) : (
            <ul className="history-vault__timeline">
              {filteredTimeline.map((entry) => (
                <li key={entry.id} className="history-vault__item">
                  <span className={`history-vault__pill history-vault__pill--${entry.type}`}>
                    {HISTORY_FILTER_LABELS[entry.type]}
                  </span>
                  <div>
                    <strong>{entry.product?.title ?? entry.search?.query ?? entry.type}</strong>
                    <p>
                      {entry.type === 'search'
                        ? `Query · ${entry.search?.derivedTags.join(', ') || 'no tags inferred'}`
                        : entry.product?.tags?.slice(0, 3).join(', ') ?? entry.product?.id}
                    </p>
                    <time dateTime={entry.occurredAt}>{formatRelativeTime(entry.occurredAt)}</time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3>Data control</h3>
          <p>
            Wipe every trace of local activity, clear cookies, and reload a brand-new guest session. This cannot be
            undone.
          </p>
          <button
            type="button"
            className="button is-danger"
            onClick={onEraseAllData}
            disabled={eraseInProgress}
          >
            {eraseInProgress ? 'Erasing…' : 'Erase everything'}
          </button>
        </section>

        <section>
          <h3>Privacy</h3>
          <p>
            Product Pulse never stores PII on the client, and all analytics are anonymized. Read the{' '}
            <a href="/privacy.html" target="_blank" rel="noreferrer">privacy statement</a> for details.
          </p>
        </section>
      </aside>
    </div>
  );
};

export default PreferencesPanel;
