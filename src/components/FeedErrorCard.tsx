import React from 'react';

export type FeedErrorCardProps = {
  message: string;
  onRetry: () => void;
  onShowDiagnostics: () => void;
  busy?: boolean;
  isOffline?: boolean;
};

const onlineTips = [
  'Confirm AI_PROVIDER_URL, AI_PROVIDER_KEY, and SERPAPI_KEY exist in .env.local.',
  'Restart the dev server after changing env vars so route handlers reload.',
  'Run npm run launch to surface lint/test/build issues before trying again.',
];

const offlineTips = [
  'Check your internet connection or VPN before retrying.',
  'Guest mode can only serve cached drops while offline.',
  'Reconnect, then hit Retry to pull fresh products.',
];

const FeedErrorCard: React.FC<FeedErrorCardProps> = ({
  message,
  onRetry,
  onShowDiagnostics,
  busy = false,
  isOffline = false,
}) => {
  const tips = isOffline ? offlineTips : onlineTips;
  return (
    <section
      className={`feed-error-card${isOffline ? ' feed-error-card--offline' : ''}`}
      role="alert"
    >
      <div className="feed-error-card__body">
        <p className="feed-error-card__eyebrow">{isOffline ? 'Offline detected' : 'Issue detected'}</p>
        <h2>{message}</h2>
        <ul>
          {tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </div>
      <div className="feed-error-card__actions">
        <button type="button" className="button is-primary" onClick={onRetry} disabled={busy}>
          {busy ? 'Retrying…' : 'Retry now'}
        </button>
        <button type="button" className="button is-light" onClick={onShowDiagnostics}>
          View diagnostics
        </button>
      </div>
    </section>
  );
};

export default FeedErrorCard;
