const shimmerBlocks = new Array(4).fill(null);

type DeckSkeletonProps = {
  status?: string;
  detail?: string;
  dual?: boolean;
};

const DeckCardSkeleton = ({ label }: { label: string }) => (
  <article className="deck-skeleton__card">
    <header>
      <span>{label}</span>
      <strong>Pairing contender…</strong>
    </header>
    <div className="deck-skeleton__media" />
    <div className="deck-skeleton__rows">
      {shimmerBlocks.map((_, idx) => (
        <div key={idx} className="deck-skeleton__row" />
      ))}
    </div>
    <div className="deck-skeleton__actions">
      <div className="deck-skeleton__pill" />
      <div className="deck-skeleton__pill" />
      <div className="deck-skeleton__pill" />
      <div className="deck-skeleton__pill deck-skeleton__pill--danger" />
    </div>
  </article>
);

const LoaderSkeleton = ({ status, detail, dual = true }: DeckSkeletonProps) => (
  <div className="deck-skeleton" role="status" aria-live="polite">
    <div className="deck-skeleton__meta">
      <p>{status ?? 'Calibrating the duel desk…'}</p>
      <small>{detail ?? 'Tuning preferences, hydrating session, and queuing contenders.'}</small>
    </div>
    <div className={`deck-skeleton__grid${dual ? ' deck-skeleton__grid--dual' : ''}`}>
      <DeckCardSkeleton label="Spotlight" />
      {dual && <DeckCardSkeleton label="Challenger" />}
    </div>
  </div>
);

export default LoaderSkeleton;
