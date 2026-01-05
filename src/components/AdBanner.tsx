'use client';

import { useEffect } from 'react';

import AdMobSlot from '@/components/AdMobSlot';
import { getAdMobSlot, hasAdMobConfig } from '@/lib/ads/loader';
import { trackAdImpression } from '@/lib/metrics/client';

const footerSlotId = getAdMobSlot('footer');
const footerConfigured = hasAdMobConfig('footer') && Boolean(footerSlotId);

const AdBanner = () => {
  useEffect(() => {
    if (!footerConfigured) return;
    trackAdImpression('footer');
  }, []);

  if (!footerConfigured) {
    return null;
  }

  return (
    <div className="ad-banner" role="complementary" aria-label="Sponsored">
      <AdMobSlot
        slotId={footerSlotId}
        adLabel="Sponsored"
        className="admob-footer"
        style={{ display: 'block', minHeight: '120px' }}
      />
    </div>
  );
};

export default AdBanner;
