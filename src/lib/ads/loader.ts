import { recordMetric } from '@/lib/metrics/collector';

type AdCreative = {
  headline: string;
  body: string;
  cta: string;
  url: string;
};

const fallbackCreative: AdCreative = {
  headline: 'Sponsor Spotlight',
  body: 'Reach shoppers who love discovering emerging products. Your brand fits right here.',
  cta: 'Book a demo',
  url: 'https://example.com/ads',
};

let creative: AdCreative | null = null;

export const getAdCreative = async (): Promise<AdCreative> => {
  if (creative) return creative;
  const variant = process.env.ADS_VARIANT ?? 'control';
  if (!process.env.ADS_ENDPOINT) {
    creative = fallbackCreative;
    recordMetric('ads.fetch', { variant, source: 'fallback' });
    return creative;
  }
  try {
    const res = await fetch(process.env.ADS_ENDPOINT, {
      cache: 'no-store',
      headers: { 'x-ads-variant': variant },
    });
    if (!res.ok) throw new Error('Ad endpoint failed');
    const json = (await res.json()) as AdCreative;
    creative = json;
    recordMetric('ads.fetch', { variant, source: 'remote' });
  } catch (error) {
    console.warn('[ads] falling back to default creative', error);
    creative = fallbackCreative;
    recordMetric('ads.fetch', { variant, source: 'fallback_error' });
  }
  return creative;
};
