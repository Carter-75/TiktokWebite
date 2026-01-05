'use client';

import { useEffect } from 'react';

import AdMobSlot from '@/components/AdMobSlot';
import { getAdMobSlot } from '@/lib/ads/loader';
import { trackAdImpression } from '@/lib/metrics/client';

const inlineSlotId = getAdMobSlot('inline');

const InlineAd = () => {
  useEffect(() => {
    trackAdImpression('inline');
  }, []);

  return (
    <AdMobSlot
      slotId={inlineSlotId}
      className="inline-ad"
      adLabel="Sponsored"
      style={{ display: 'block', minHeight: '90px' }}
    />
  );
};

export default InlineAd;
