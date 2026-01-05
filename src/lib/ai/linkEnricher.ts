import { fetchRetailerListings } from '@/lib/catalog/liveRetailerLookup';
import { recordMetric } from '@/lib/metrics/collector';
import type { ProductContent } from '@/types/product';

const STOP_WORDS = new Set([
  'the',
  'and',
  'a',
  'for',
  'with',
  'to',
  'your',
  'new',
  'best',
  'buy',
  'online',
  'usa',
  'shop',
]);

const pendingLookups = new Map<string, ReturnType<typeof fetchRetailerListings>>();
const hotQueryHits = new Map<string, number>();

const dedupeBuyLinks = (links: ProductContent['buyLinks']) => {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = link.url.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

const createCanonicalKey = (product: ProductContent) => {
  const tokens = new Set<string>();
  const sources = [product.title, product.whatItIs ?? '', product.summary ?? '', product.tags.map((tag) => tag.label).join(' ')];
  for (const source of sources) {
    for (const token of tokenize(source)) {
      if (!STOP_WORDS.has(token)) {
        tokens.add(token);
      }
    }
  }
  const key = Array.from(tokens).slice(0, 16).join(' ').trim();
  return key;
};

const buildLookupQuery = (product: ProductContent, canonicalKey: string) => {
  if (canonicalKey) {
    const focused = canonicalKey.split(' ').slice(0, 12).join(' ');
    return `${focused} buy online`.trim();
  }
  return `${product.title} buy online`.trim();
};

const clamp = (value: number) => Number(Math.min(1, Math.max(0, value)).toFixed(3));

const deriveHeuristicConfidence = (product: ProductContent, canonicalKey: string) => {
  let score = typeof product.retailLookupConfidence === 'number' ? product.retailLookupConfidence : 0.55;
  if (product.noveltyScore >= 0.75) {
    score -= 0.25;
  }
  if (/concept|prototype|beta|waitlist|exclusive/i.test(`${product.summary} ${product.cons.join(' ')}`)) {
    score -= 0.2;
  }
  if (!product.buyLinks.length) {
    score += 0.12;
  }
  if (product.buyLinks.some((link) => link.trusted)) {
    score -= 0.05;
  }
  if (canonicalKey.split(' ').length >= 3) {
    score += 0.05;
  }
  const reuseBonus = Math.min(0.15, (hotQueryHits.get(canonicalKey) ?? 0) * 0.02);
  score += reuseBonus;
  return clamp(score);
};

const getConfidenceThreshold = () => {
  const raw = Number(process.env.RETAIL_LOOKUP_CONFIDENCE_THRESHOLD ?? 0.45);
  if (!Number.isFinite(raw)) {
    return 0.45;
  }
  return clamp(raw);
};

const resolveLookupLimit = (fallback: number) => {
  const raw = Number(process.env.RETAIL_LOOKUP_LIMIT ?? fallback);
  if (!Number.isFinite(raw)) {
    return fallback;
  }
  return Math.max(0, Math.floor(raw));
};

const resolveLinksPerProduct = () => {
  const raw = Number(process.env.RETAIL_LINKS_PER_PRODUCT ?? 3);
  if (!Number.isFinite(raw)) {
    return 3;
  }
  return Math.max(1, Math.floor(raw));
};

const sharedLookup = (canonicalKey: string, query: string, limit: number) => {
  if (pendingLookups.has(canonicalKey)) {
    return pendingLookups.get(canonicalKey)!;
  }
  const task = fetchRetailerListings(query, limit, { canonicalKey }).finally(() => {
    pendingLookups.delete(canonicalKey);
  });
  pendingLookups.set(canonicalKey, task);
  return task;
};

export const enrichProductsWithRetailers = async (products: ProductContent[]): Promise<ProductContent[]> => {
  if (!products.length) {
    return products;
  }

  const confidenceThreshold = getConfidenceThreshold();
  const linksPerProduct = resolveLinksPerProduct();
  const lookupLimit = resolveLookupLimit(products.length);

  const candidates = products
    .map((product) => {
      const canonicalKey = createCanonicalKey(product);
      return {
        product,
        canonicalKey,
        query: buildLookupQuery(product, canonicalKey),
        confidence: canonicalKey ? deriveHeuristicConfidence(product, canonicalKey) : 0,
      };
    })
    .filter((candidate) => candidate.canonicalKey && candidate.confidence >= confidenceThreshold)
    .sort((a, b) => b.confidence - a.confidence);

  const selected = lookupLimit > 0 ? candidates.slice(0, lookupLimit) : [];
  recordMetric('ai.retailer_lookup_queue', {
    eligible: candidates.length,
    selected: selected.length,
    threshold: confidenceThreshold,
  });

  const grouped = new Map<
    string,
    {
      query: string;
      entries: { product: ProductContent; confidence: number }[];
    }
  >();

  for (const candidate of selected) {
    if (!grouped.has(candidate.canonicalKey)) {
      grouped.set(candidate.canonicalKey, { query: candidate.query, entries: [] });
    }
    grouped.get(candidate.canonicalKey)!.entries.push({ product: candidate.product, confidence: candidate.confidence });
  }

  const enriched = new Map<string, ProductContent>();

  await Promise.all(
    Array.from(grouped.entries()).map(async ([canonicalKey, payload]) => {
      try {
        const listings = await sharedLookup(canonicalKey, payload.query, linksPerProduct);
        hotQueryHits.set(canonicalKey, Math.min(50, (hotQueryHits.get(canonicalKey) ?? 0) + 1));
        const retailerLinks = listings.slice(0, linksPerProduct).map((listing) => ({
          label: listing.label,
          url: listing.url,
          priceHint: listing.priceHint,
          trusted: listing.trusted ?? false,
        }));

        payload.entries.forEach(({ product }) => {
          enriched.set(product.id, {
            ...product,
            source: product.source === 'ai' ? 'hybrid' : product.source,
            buyLinks: dedupeBuyLinks([...retailerLinks, ...product.buyLinks]),
          });
        });

        recordMetric('ai.retailer_lookup_applied', {
          canonical: canonicalKey,
          retailers: retailerLinks.length,
          products: payload.entries.length,
        });
      } catch (error) {
        recordMetric('ai.retailer_lookup_skipped', {
          reason: (error as Error).message,
          canonical: canonicalKey,
        });
      }
    })
  );

  return products.map((product) => enriched.get(product.id) ?? product);
};
