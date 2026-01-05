'use client';

import { useEffect } from 'react';

import AdMobSlot from '@/components/AdMobSlot';
import { getAdMobSlot, hasAdMobConfig } from '@/lib/ads/loader';
import { trackAdImpression } from '@/lib/metrics/client';

const inlineSlotId = getAdMobSlot('inline');
const inlineConfigured = hasAdMobConfig('inline') && Boolean(inlineSlotId);

const InlineAd = () => {
  useEffect(() => {
    if (!inlineConfigured) return;
    trackAdImpression('inline');
  }, [inlineConfigured]);

  if (!inlineConfigured) {
    return null;
  }

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
