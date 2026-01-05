import { recordMetric } from '@/lib/metrics/collector';

export type RetailerListing = {
  label: string;
  url: string;
  priceHint?: string;
  trusted?: boolean;
};

const SERP_ENDPOINT = 'https://serpapi.com/search.json';
const DEFAULT_CACHE_TTL = Math.max(1_000, Number(process.env.RETAIL_LOOKUP_CACHE_TTL_MS ?? 15 * 60 * 1000));
const MAX_CACHE_ENTRIES = Math.max(16, Number(process.env.RETAIL_LOOKUP_CACHE_SIZE ?? 256));

type CacheEntry = {
  listings: RetailerListing[];
  expiresAt: number;
};

const retailerCache = new Map<string, CacheEntry>();

const buildCacheKey = (value: string) => value.trim().toLowerCase();

const readCache = (key: string): RetailerListing[] | null => {
  const entry = retailerCache.get(key);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    retailerCache.delete(key);
    return null;
  }
  retailerCache.delete(key);
  retailerCache.set(key, entry);
  return entry.listings.map((listing) => ({ ...listing }));
};

const writeCache = (key: string, listings: RetailerListing[]) => {
  retailerCache.set(key, {
    listings: listings.map((listing) => ({ ...listing })),
    expiresAt: Date.now() + DEFAULT_CACHE_TTL,
  });
  if (retailerCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = retailerCache.keys().next().value as string | undefined;
    if (oldestKey) {
      retailerCache.delete(oldestKey);
    }
  }
};

export const clearRetailerCache = () => retailerCache.clear();

const sanitizeListings = (results: unknown[]): RetailerListing[] => {
  const listings: RetailerListing[] = [];
  for (const entry of results) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const candidate = entry as { store?: string; link?: string; price?: string; shipping?: string };
    if (!candidate.link || !candidate.link.startsWith('http')) {
      continue;
    }
    listings.push({
      label: candidate.store ?? 'Retailer',
      url: candidate.link,
      priceHint: candidate.price,
      trusted: candidate.shipping?.toLowerCase().includes('free') ?? false,
    });
  }
  return listings;
};

export const fetchRetailerListings = async (
  query: string,
  limit = 3,
  opts?: { canonicalKey?: string; forceRefresh?: boolean }
): Promise<RetailerListing[]> => {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    recordMetric('ai.retailer_lookup_skipped', { reason: 'serpapi_missing' });
    throw new Error('serpapi_missing_key');
  }

  const cacheKey = buildCacheKey(opts?.canonicalKey ?? query);
  if (!opts?.forceRefresh) {
    const cached = readCache(cacheKey);
    if (cached) {
      recordMetric('ai.retailer_lookup_cache_hit', { count: cached.length });
      return cached.slice(0, limit);
    }
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
    writeCache(cacheKey, listings);
    return listings;
  } catch (error) {
    recordMetric('ai.retailer_lookup_failed', { reason: (error as Error).message });
    throw error;
  }
};
