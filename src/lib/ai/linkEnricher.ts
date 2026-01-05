import { fetchRetailerListings } from '@/lib/catalog/liveRetailerLookup';
import type { ProductContent } from '@/types/product';

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

const deriveQuery = (product: ProductContent) => {
  const tagTerms = product.tags.map((tag) => tag.label).join(' ');
  return `${product.title} ${tagTerms} buy online USA`.trim();
};

export const enrichProductsWithRetailers = async (products: ProductContent[]): Promise<ProductContent[]> => {
  if (!products.length) {
    return products;
  }

  const requestedLookups = Number(process.env.RETAIL_LOOKUP_LIMIT ?? products.length);
  const maxLookups = Number.isFinite(requestedLookups) ? Math.max(1, requestedLookups) : products.length;
  if (maxLookups < products.length) {
    throw new Error('retailer_lookup_limit_too_low');
  }
  const mapped = await Promise.all(
    products.map(async (product, index) => {
      if (index >= maxLookups) {
        throw new Error('retailer_lookup_limit_exceeded');
      }
      const listings = await fetchRetailerListings(deriveQuery(product));
      if (!listings.length) {
        throw new Error('retailer_lookup_empty');
      }
      const retailerLinks = listings.map((listing) => ({
        label: listing.label,
        url: listing.url,
        priceHint: listing.priceHint,
        trusted: listing.trusted ?? false,
      }));
      return {
        ...product,
        source: product.source === 'ai' ? 'hybrid' : product.source,
        buyLinks: dedupeBuyLinks([...retailerLinks, ...product.buyLinks]),
      };
    })
  );

  return mapped;
};
