const shimmerBlocks = new Array(4).fill(null);

const LoaderSkeleton = () => (
  <div className="skeleton" role="status" aria-live="polite">
    {shimmerBlocks.map((_, idx) => (
      <div key={idx} className="skeleton__block" />
    ))}
    <span className="skeleton__text">Generating your next find…</span>
  </div>
);

export default LoaderSkeleton;
