import { recordMetric } from '@/lib/metrics/collector';
import crypto from 'crypto';

export type RetailerListing = {
  label: string;
  url: string;
  priceHint?: string;
  trusted?: boolean;
  title?: string; // Add title for Amazon products
  asin?: string; // Add ASIN for Amazon products
  imageUrl?: string; // Product image URL
  rating?: number; // Product rating
};

// Amazon Product Advertising API configuration
const AMAZON_API_HOST = 'webservices.amazon.com';
const AMAZON_API_ENDPOINT = '/paapi5/searchitems';
const AMAZON_REGION = process.env.AMAZON_REGION || 'us-east-1';
const AMAZON_SERVICE = 'ProductAdvertisingAPI';

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

/**
 * Generate AWS Signature Version 4 for Amazon Product Advertising API
 */
const generateAmazonSignature = (
  method: string,
  endpoint: string,
  payload: string,
  accessKey: string,
  secretKey: string,
  timestamp: string
): { headers: Record<string, string> } => {
  const dateStamp = timestamp.split('T')[0].replace(/-/g, '');
  const amzDate = timestamp.replace(/[-:]/g, '').split('.')[0] + 'Z';
  
  // Step 1: Create canonical request
  const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');
  const canonicalHeaders = [
    `content-type:application/json; charset=utf-8`,
    `host:${AMAZON_API_HOST}`,
    `x-amz-date:${amzDate}`,
    `x-amz-target:com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems`,
  ].join('\n');
  
  const signedHeaders = 'content-type;host;x-amz-date;x-amz-target';
  
  const canonicalRequest = [
    method,
    endpoint,
    '', // query string (empty for POST)
    canonicalHeaders + '\n', // must end with newline
    signedHeaders,
    payloadHash,
  ].join('\n');
  
  // Step 2: Create string to sign
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${AMAZON_REGION}/${AMAZON_SERVICE}/aws4_request`;
  const canonicalRequestHash = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    canonicalRequestHash,
  ].join('\n');
  
  // Step 3: Calculate signature
  const getSignatureKey = (key: string, dateStamp: string, regionName: string, serviceName: string) => {
    const kDate = crypto.createHmac('sha256', `AWS4${key}`).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    return kSigning;
  };
  
  const signingKey = getSignatureKey(secretKey, dateStamp, AMAZON_REGION, AMAZON_SERVICE);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  
  // Step 4: Add signing information to request
  const authorizationHeader = `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  return {
    headers: {
      'Authorization': authorizationHeader,
      'Content-Type': 'application/json; charset=utf-8',
      'Host': AMAZON_API_HOST,
      'X-Amz-Date': amzDate,
      'X-Amz-Target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems',
    },
  };
};

const sanitizeListings = (results: unknown[]): RetailerListing[] => {
  const listings: RetailerListing[] = [];
  for (const entry of results) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    
    // Amazon Product Advertising API response structure
    const candidate = entry as {
      ASIN?: string;
      DetailPageURL?: string;
      ItemInfo?: {
        Title?: { DisplayValue?: string };
      };
      Offers?: {
        Listings?: Array<{
          Price?: {
            DisplayAmount?: string;
            Amount?: number;
            Currency?: string;
          };
        }>;
      };
      Images?: {
        Primary?: {
          Large?: { URL?: string };
          Medium?: { URL?: string };
        };
      };
      CustomerReviews?: {
        StarRating?: { Value?: number };
        Count?: number;
      };
    };
    
    const asin = candidate.ASIN;
    const url = candidate.DetailPageURL || (asin ? `https://www.amazon.com/dp/${asin}` : undefined);
    
    if (!url || !asin) {
      continue;
    }
    
    // Extract title
    const title = candidate.ItemInfo?.Title?.DisplayValue;
    
    // Extract price
    const priceInfo = candidate.Offers?.Listings?.[0]?.Price;
    const priceHint = priceInfo?.DisplayAmount;
    
    // Extract image
    const imageUrl = candidate.Images?.Primary?.Large?.URL || candidate.Images?.Primary?.Medium?.URL;
    
    // Extract rating
    const rating = candidate.CustomerReviews?.StarRating?.Value;
    
    listings.push({
      label: 'Amazon',
      url: url,
      priceHint: priceHint,
      trusted: true,
      title: title,
      asin: asin,
      imageUrl: imageUrl,
      rating: rating,
    });
  }
  
  console.log('[amazon] Sanitized', listings.length, 'Amazon product listings');
  return listings;
};

export const fetchRetailerListings = async (
  query: string,
  limit = 3,
  opts?: { canonicalKey?: string; forceRefresh?: boolean }
): Promise<RetailerListing[]> => {
  const accessKey = process.env.AMAZON_ACCESS_KEY;
  const secretKey = process.env.AMAZON_SECRET_KEY;
  const partnerTag = process.env.AMAZON_ASSOCIATE_TAG;
  
  if (!accessKey || !secretKey || !partnerTag) {
    recordMetric('ai.retailer_lookup_skipped', { reason: 'amazon_credentials_missing' });
    throw new Error('amazon_credentials_missing');
  }

  const cacheKey = buildCacheKey(opts?.canonicalKey ?? query);
  if (!opts?.forceRefresh) {
    const cached = readCache(cacheKey);
    if (cached) {
      recordMetric('ai.retailer_lookup_cache_hit', { count: cached.length });
      return cached.slice(0, limit);
    }
  }

  console.log('[amazon] Searching Amazon Product API for:', query);

  const timestamp = new Date().toISOString();
  const payload = JSON.stringify({
    Keywords: query,
    Resources: [
      'Images.Primary.Large',
      'Images.Primary.Medium',
      'ItemInfo.Title',
      'Offers.Listings.Price',
      'CustomerReviews.StarRating',
      'CustomerReviews.Count',
    ],
    PartnerTag: partnerTag,
    PartnerType: process.env.AMAZON_PARTNER_TYPE || 'Associates',
    Marketplace: 'www.amazon.com',
    ItemCount: Math.min(limit, 10), // Max 10 items per request
    SearchIndex: 'All',
  });

  try {
    const { headers } = generateAmazonSignature(
      'POST',
      AMAZON_API_ENDPOINT,
      payload,
      accessKey,
      secretKey,
      timestamp
    );

    const response = await fetch(`https://${AMAZON_API_HOST}${AMAZON_API_ENDPOINT}`, {
      method: 'POST',
      headers: headers,
      body: payload,
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[amazon] API error:', response.status, errorText);
      throw new Error(`amazon_api_${response.status}`);
    }

    const json = (await response.json()) as {
      SearchResult?: {
        Items?: unknown[];
      };
      Errors?: Array<{ Code?: string; Message?: string }>;
    };

    if (json.Errors && json.Errors.length > 0) {
      const error = json.Errors[0];
      console.error('[amazon] API returned error:', error.Code, error.Message);
      throw new Error(`amazon_error_${error.Code}`);
    }

    const items = json.SearchResult?.Items ?? [];
    const listings = sanitizeListings(items).slice(0, limit);

    if (!listings.length) {
      throw new Error('amazon_no_results');
    }

    console.log('[amazon] Found', listings.length, 'Amazon products');
    recordMetric('ai.retailer_lookup_success', { count: listings.length });
    writeCache(cacheKey, listings);
    return listings;
  } catch (error) {
    console.error('[amazon] Search failed:', (error as Error).message);
    recordMetric('ai.retailer_lookup_failed', { reason: (error as Error).message });
    throw error;
  }
};
