import { recordMetric } from '@/lib/metrics/collector';

export type RetailerListing = {
  label: string;
  url: string;
  priceHint?: string;
  trusted?: boolean;
};

const SERP_ENDPOINT = 'https://serpapi.com/search.json';

const sanitizeListings = (results: unknown[]): RetailerListing[] => {
  return results
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null) {
        return null;
      }
      const candidate = entry as { store?: string; link?: string; price?: string; shipping?: string };
      if (!candidate.link || !candidate.link.startsWith('http')) {
        return null;
      }
      return {
        label: candidate.store ?? 'Retailer',
        url: candidate.link,
        priceHint: candidate.price,
        trusted: candidate.shipping?.toLowerCase().includes('free') ?? false,
      } satisfies RetailerListing;
    })
    .filter((entry): entry is RetailerListing => Boolean(entry));
};

export const fetchRetailerListings = async (query: string, limit = 3): Promise<RetailerListing[]> => {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    recordMetric('ai.retailer_lookup_skipped', { reason: 'serpapi_missing' });
    throw new Error('serpapi_missing_key');
  }

  const url = new URL(SERP_ENDPOINT);
  url.searchParams.set('engine', 'google_shopping');
  url.searchParams.set('q', query);
  url.searchParams.set('hl', 'en');
  url.searchParams.set('gl', 'us');
  url.searchParams.set('api_key', apiKey);

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'ProductPulseBot/1.0' },
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`serpapi_${response.status}`);
    }
    const json = (await response.json()) as { shopping_results?: unknown[] };
    const listings = sanitizeListings(json.shopping_results ?? []).slice(0, limit);
    if (!listings.length) {
      throw new Error('serpapi_no_results');
    }
    recordMetric('ai.retailer_lookup_success', { count: listings.length });
    return listings;
  } catch (error) {
    recordMetric('ai.retailer_lookup_failed', { reason: (error as Error).message });
    throw error;
  }
};
