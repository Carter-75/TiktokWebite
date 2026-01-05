'use client';

type Props = {
  disabled?: boolean;
  onLike: () => void;
  onDislike: () => void;
  onReport: () => void;
  onNext: () => void;
  onBack: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
};

const InteractionBar = ({
  disabled,
  onLike,
  onDislike,
  onReport,
  onNext,
  onBack,
  canGoBack,
  canGoForward,
}: Props) => (
  <div className="interaction-bar">
    <button
      type="button"
      className="button vibe-button vibe-button--back"
      disabled={!canGoBack}
      onClick={onBack}
    >
      ⏮ Back
    </button>
    <button
      type="button"
      className="button vibe-button vibe-button--like is-success"
      disabled={disabled}
      onClick={onLike}
    >
      👍 Like
    </button>
    <button
      type="button"
      className="button vibe-button vibe-button--skip is-warning"
      disabled={disabled}
      onClick={onDislike}
    >
      👎 Skip
    </button>
    <button
      type="button"
      className="button vibe-button vibe-button--report is-danger"
      disabled={disabled}
      onClick={onReport}
    >
      🚩 Report
    </button>
    <button
      type="button"
      className="button vibe-button vibe-button--next is-info"
      disabled={disabled && !canGoForward}
      onClick={onNext}
    >
      ⏭ Next
    </button>
  </div>
);

export default InteractionBar;
