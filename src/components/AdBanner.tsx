'use client';

import { useEffect } from 'react';

import AdMobSlot from '@/components/AdMobSlot';
import { getAdMobSlot } from '@/lib/ads/loader';
import { trackAdImpression } from '@/lib/metrics/client';

const footerSlotId = getAdMobSlot('footer');

const AdBanner = () => {
  useEffect(() => {
    trackAdImpression('footer');
  }, []);

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
