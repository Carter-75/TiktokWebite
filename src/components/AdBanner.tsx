import { Suspense } from 'react';

import { getAdCreative } from '@/lib/ads/loader';
import { recordMetric } from '@/lib/metrics/collector';

const AdBannerInner = async () => {
  const creative = await getAdCreative();
  recordMetric('ad_impression', { placement: 'footer', source: 'ssr' });
  return (
    <div className="ad-banner" role="complementary">
      <div>
        <strong>{creative.headline}</strong>
        <p>{creative.body}</p>
      </div>
      <a className="button is-primary" href={creative.url} target="_blank" rel="noreferrer">
        {creative.cta}
      </a>
    </div>
  );
};

const AdBanner = () => (
  <Suspense fallback={<div className="ad-banner placeholder" /> }>
    {/* @ts-expect-error Async Server Component */}
    <AdBannerInner />
  </Suspense>
);

export default AdBanner;
