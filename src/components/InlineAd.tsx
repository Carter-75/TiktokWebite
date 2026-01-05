'use client';

import { useEffect } from 'react';

import { trackAdImpression } from '@/lib/metrics/client';

const InlineAd = () => {
  useEffect(() => {
    trackAdImpression('inline');
  }, []);

  return (
    <div className="inline-ad" role="complementary" aria-label="Sponsored">
      <p>Sponsored suggestion · Upgrade your workspace with ergonomic essentials curated weekly.</p>
      <a href="https://example.com/partner" target="_blank" rel="noreferrer">
        Explore partner deals
      </a>
    </div>
  );
};

export default InlineAd;
