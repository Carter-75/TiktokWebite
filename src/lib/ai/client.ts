import crypto from 'node:crypto';

import OpenAI from 'openai';
import type { Response as OpenAIResponsePayload } from 'openai/resources/responses/responses';

import { buildFallbackMediaUrl } from '@/lib/media/fallback';
import { recordMetric } from '@/lib/metrics/collector';
import { ProductGenerationRequest, ProductGenerationResponse, ProductContent } from '@/types/product';
import {
  buildProductPrompt,
  validateProductResponse,
  type ProductResponseShape,
} from '@/lib/ai/prompts';
import { enrichProductsWithRetailers } from '@/lib/ai/linkEnricher';
import { fetchRetailerListings } from '@/lib/catalog/liveRetailerLookup';
import { aiLogger, logAIError, productLogger } from '@/lib/logger';

const memoryCache = new Map<string, ProductGenerationResponse>();

const hashKey = (input: object) =>
  crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');

const trackClamp = (field: string, before: number, after: number) => {
  if (before <= after) return;
  recordMetric('ai.payload_clamped', {
    field,
    before,
    after,
    overflow: Number(Math.max(0, before - after).toFixed(0)),
  });
};

const clampText = (value: string, max = 320, field = 'text') => {
  if (value.length <= max) return value;
  trackClamp(field, value.length, max);
  return `${value.slice(0, max)}…`;
};

const limitArray = <T>(items: T[], max: number, field: string) => {
  if (items.length <= max) return items;
  trackClamp(field, items.length, max);
  return items.slice(0, max);
};

const clampConfidence = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0.55;
  }
  return Number(Math.min(1, Math.max(0, value)).toFixed(3));
};

const MEDIA_PROBE_TIMEOUT_MS = (() => {
  const parsed = Number(process.env.MEDIA_PROBE_TIMEOUT_MS ?? 2500);
  if (!Number.isFinite(parsed)) {
    return 2500;
  }
  return Math.min(7000, Math.max(500, parsed));
})();

const IMAGE_EXTENSION_REGEX = /\.(?:apng|avif|gif|jpe?g|jfif|pjpeg|pjp|png|svg|webp|heic|heif)(?:\?.*)?$/i;

const normalizeMediaUrl = (value?: string | null) => (typeof value === 'string' && value.startsWith('http') ? value : undefined);

const isImageMime = (value?: string | null) => typeof value === 'string' && value.toLowerCase().startsWith('image/');

const hasImageExtension = (url: string) => {
  try {
    const parsed = new URL(url);
    return IMAGE_EXTENSION_REGEX.test(parsed.pathname);
  } catch {
    return false;
  }
};

const fetchWithTimeout = async (url: string, init: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MEDIA_PROBE_TIMEOUT_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const probeRemoteImage = async (url: string): Promise<boolean> => {
  if (typeof fetch !== 'function') {
    return true;
  }

  try {
    const headResponse = await fetchWithTimeout(url, {
      method: 'HEAD',
      redirect: 'follow',
      cache: 'no-store',
    });
    if (headResponse.ok) {
      const contentType = headResponse.headers.get('content-type');
      return isImageMime(contentType) || (!contentType && hasImageExtension(url));
    }

    if ([403, 405, 406, 500, 501].includes(headResponse.status)) {
      const probeResponse = await fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          Range: 'bytes=0-0',
          Accept: 'image/*',
        },
        redirect: 'follow',
        cache: 'no-store',
      });
      if (probeResponse.ok) {
        const contentType = probeResponse.headers.get('content-type');
        return isImageMime(contentType) || hasImageExtension(url);
      }
    }
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      recordMetric('ai.media_probe_error', { reason: (error as Error).message ?? 'unknown' });
    }
  }

  return false;
};

const ensureProductMedia = async (product: ProductContent): Promise<ProductContent> => {
  const normalized = normalizeMediaUrl(product.mediaUrl);
  if (normalized) {
    const valid = await probeRemoteImage(normalized);
    if (valid) {
      return product;
    }
    recordMetric('ai.media_fallback_applied', { reason: 'invalid_remote' });
  } else {
    recordMetric('ai.media_fallback_applied', { reason: 'missing_remote' });
  }

  return {
    ...product,
    mediaUrl: buildFallbackMediaUrl(product),
  };
};

const sanitizeProduct = (product: ProductContent): ProductContent => {
  const trimmedPros = limitArray(product.pros, 5, 'pros');
  const trimmedCons = limitArray(product.cons, 5, 'cons');
  const trimmedTags = limitArray(product.tags, 8, 'tags');
  const trimmedBuyLinks = limitArray(product.buyLinks, 4, 'buyLinks');

  return {
    ...product,
    summary: clampText(product.summary, 320, 'summary'),
    whatItIs: clampText(product.whatItIs, 320, 'whatItIs'),
    whyUseful: clampText(product.whyUseful, 320, 'whyUseful'),
    pros: trimmedPros.map((item, index) => clampText(item, 160, `pros[${index}]`)),
    cons: trimmedCons.map((item, index) => clampText(item, 160, `cons[${index}]`)),
    tags: trimmedTags,
    buyLinks: trimmedBuyLinks,
    noveltyScore: Number(Math.min(1, Math.max(0, product.noveltyScore)).toFixed(2)),
    mediaUrl: normalizeMediaUrl(product.mediaUrl),
    retailLookupConfidence: clampConfidence(product.retailLookupConfidence),
  };
};

const clampResultCount = (value?: number) => Math.min(4, Math.max(2, value ?? 2));

const normalizeProviderBaseUrl = (raw?: string | null) => {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\/responses\/?$/i, '').replace(/\/+$/, '');
};

const buildOpenAIClient = () => {
  const providerKey = process.env.AI_PROVIDER_KEY;
  if (!providerKey) {
    recordMetric('ai.call_skipped', { reason: 'provider_missing' });
    throw new Error('AI provider credentials missing');
  }
  const baseURL = normalizeProviderBaseUrl(process.env.AI_PROVIDER_URL);
  return new OpenAI({
    apiKey: providerKey,
    ...(baseURL ? { baseURL } : {}),
  });
};

type OpenAIResponse = OpenAIResponsePayload;

type ResponsesClient = OpenAI['responses'];

const invokeStructuredResponse = async (
  client: OpenAI,
  params: Parameters<ResponsesClient['create']>[0]
): Promise<OpenAIResponse> => {
  const responses = client.responses as Partial<ResponsesClient> & { create: ResponsesClient['create'] };
  if (typeof responses.parse === 'function') {
    return (responses.parse as ResponsesClient['parse'])(params as Parameters<ResponsesClient['parse']>[0]) as Promise<OpenAIResponse>;
  }
  return responses.create(params) as Promise<OpenAIResponse>;
};

const extractResponsePayload = (response: OpenAIResponse): unknown => {
  const textSegments: string[] = Array.isArray(response.output_text)
    ? response.output_text
    : typeof response.output_text === 'string' && response.output_text.trim()
      ? [response.output_text]
      : [];
  const fallbackSegments: string[] = Array.isArray(response.output)
    ? response.output.flatMap((entry) => {
        if (!entry || typeof entry !== 'object' || !('content' in entry)) {
          return [];
        }

        const content = (entry as { content?: Array<unknown> }).content;
        if (!Array.isArray(content)) return [];

        return content
          .map((part) => {
            if (!part || typeof part !== 'object' || !('text' in part)) return '';
            const text = (part as { text?: unknown }).text;
            return typeof text === 'string' ? text : '';
          })
          .filter((segment) => Boolean(segment?.trim()));
      })
    : [];

  const jsonText = [...textSegments, ...fallbackSegments]
    .map((segment) => segment?.trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  if (!jsonText) {
    throw new Error('AI provider returned empty response payload');
  }

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    logAIError('parse', 'Failed to parse JSON payload from AI provider', {
      error: error instanceof Error ? error : undefined,
      snippet: jsonText.slice(0, 200),
    });
    throw new Error('AI provider returned invalid JSON payload');
  }
};

const logProviderError = (error: unknown) => {
  if (error instanceof OpenAI.APIError) {
    const pickHeader = (header: string) =>
      typeof error.headers?.get === 'function' ? error.headers.get(header) ?? undefined : undefined;
    logAIError('provider', 'OpenAI API error', {
      status: error.status,
      code: error.code,
      type: error.type,
      message: error.message,
      requestId: pickHeader('x-request-id') ?? (error as { request_id?: string }).request_id,
      processingMs: pickHeader('openai-processing-ms'),
      ratelimit: {
        limitRequests: pickHeader('x-ratelimit-limit-requests'),
        remainingRequests: pickHeader('x-ratelimit-remaining-requests'),
        resetRequests: pickHeader('x-ratelimit-reset-requests'),
        limitTokens: pickHeader('x-ratelimit-limit-tokens'),
        remainingTokens: pickHeader('x-ratelimit-remaining-tokens'),
        resetTokens: pickHeader('x-ratelimit-reset-tokens'),
      },
    });
    return;
  }

  if (error instanceof Error) {
    logAIError('provider', 'Unexpected provider error', { error });
    return;
  }

  logAIError('provider', 'Unknown provider error', { error: String(error) });
};

/**
 * Search Amazon for real products using SERPAPI Amazon search
 * Returns actual Amazon products with real URLs, prices, and ASINs
 */
const searchAmazonProducts = async (searchTerms: string[]): Promise<Array<{
  title: string;
  url: string;
  price?: string;
  asin?: string;
}>> => {
  aiLogger.info('Searching Amazon for real products', { searchTerms });
  
  const allProducts: Array<{title: string; url: string; price?: string; asin?: string}> = [];
  const seenAsins = new Set<string>();
  
  // Use first search term or combine multiple terms for better results
  const searchQuery = searchTerms.slice(0, 2).join(' ');
  
  try {
    // Fetch more listings to ensure we have enough products
    const listings = await fetchRetailerListings(searchQuery, 6);
    productLogger.info('Found Amazon products', { count: listings.length, query: searchQuery });
    
    for (const listing of listings) {
      // Skip if missing essential data
      if (!listing.title || !listing.asin) {
        productLogger.debug('Skipping listing without title/ASIN', { listing });
        continue;
      }
      
      // Skip duplicates
      if (seenAsins.has(listing.asin)) {
        continue;
      }
      seenAsins.add(listing.asin);
      
      // Use real Amazon product data
      allProducts.push({
        title: listing.title,
        url: listing.url,
        price: listing.priceHint,
        asin: listing.asin,
      });
      
      // Limit to 4 products max
      if (allProducts.length >= 4) {
        break;
      }
    }
  } catch (error) {
    productLogger.error('Failed to search Amazon', {
      error: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      searchQuery,
    });
    throw new Error(`Amazon search failed: ${(error as Error).message}`);
  }
  
  if (allProducts.length === 0) {
    throw new Error('No Amazon products found for search terms');
  }
  
  productLogger.info('Returning unique Amazon products', {
    count: allProducts.length,
    sampleTitle: allProducts[0]?.title,
    sampleAsin: allProducts[0]?.asin,
  });
  return allProducts;
};

export const requestProductPage = async (
  request: ProductGenerationRequest,
  opts?: { forceNovelty?: boolean }
): Promise<{ response: ProductGenerationResponse; cacheHit: boolean }> => {
  const desiredResults = clampResultCount(request.resultsRequested);
  const normalizedRequest: ProductGenerationRequest = {
    ...request,
    resultsRequested: desiredResults,
  };

  const cacheKey = hashKey({
    preferences: normalizedRequest.preferences,
    searchTerms: normalizedRequest.searchTerms,
    lastViewed: normalizedRequest.lastViewed.map((p) => p.id),
    resultsRequested: desiredResults,
  });

  if (!opts?.forceNovelty && memoryCache.has(cacheKey)) {
    recordMetric('ai.cache_hit', { count: desiredResults });
    return { response: memoryCache.get(cacheKey)!, cacheHit: true };
  }

  // STEP 1: Search Amazon for real products first
  aiLogger.info('STEP 1: Searching Amazon for real products');
  const amazonProducts = await searchAmazonProducts(normalizedRequest.searchTerms);
  
  if (amazonProducts.length === 0) {
    productLogger.error('No Amazon products found, cannot proceed', { searchTerms: normalizedRequest.searchTerms });
    throw new Error('No Amazon products found for search terms');
  }
  
  productLogger.success('Found real Amazon products', { 
    count: amazonProducts.length,
    sample: amazonProducts[0]
  });

  // STEP 2: Have AI describe the real Amazon products
  aiLogger.info('STEP 2: Having AI describe the real products');
  const { system, user, schema, schemaName } = buildProductPrompt(normalizedRequest, amazonProducts);
  const openAiClient = buildOpenAIClient();
  const targetModel = process.env.AI_PROVIDER_MODEL ?? 'gpt-4o-mini';
  try {
    aiLogger.info('Requesting AI descriptions', { productCount: amazonProducts.length });
    
    recordMetric('ai.call_attempt', { provider: 'openai', count: desiredResults });
    const aiResponse = await invokeStructuredResponse(openAiClient, {
      model: targetModel,
      instructions: system,
      input: user,
      text: {
        format: {
          type: 'json_schema',
          name: schemaName,
          schema,
        },
      },
    });

    const structuredPayload =
      ((aiResponse as OpenAIResponse & { output_parsed?: unknown }).output_parsed as ProductResponseShape | null) ??
      (extractResponsePayload(aiResponse) as ProductResponseShape);
    const payloadText = JSON.stringify(structuredPayload);
    const payloadBytes = new TextEncoder().encode(payloadText).length;
    const validated = validateProductResponse(structuredPayload);
    recordMetric('ai.response_size_bytes', {
      bytes: payloadBytes,
      products: validated.products.length,
    });
    const promptTokens = aiResponse.usage?.input_tokens ?? validated.debug?.promptTokens ?? 0;
    const completionTokens = aiResponse.usage?.output_tokens ?? validated.debug?.completionTokens ?? 0;
    if (promptTokens || completionTokens) {
      recordMetric('ai.token_usage', {
        promptTokens,
        completionTokens,
        provider: validated.debug?.provider ?? 'openai',
      });
    }

    const sanitizedProducts = validated.products.slice(0, desiredResults).map(sanitizeProduct);
    aiLogger.success('AI described products', { count: sanitizedProducts.length });
    
    // No need to enrich with retailers since we already have real Amazon products
    // Just ensure the Amazon links are present in buyLinks
    const productsWithLinks = sanitizedProducts.map((product, index) => {
      const amazonProduct = amazonProducts[index];
      if (!amazonProduct) return product;
      
      // Ensure the real Amazon link is in buyLinks
      const hasAmazonLink = product.buyLinks.some(link => link.url === amazonProduct.url);
      if (!hasAmazonLink) {
        product.buyLinks.unshift({
          label: 'Amazon',
          url: amazonProduct.url,
          priceHint: amazonProduct.price,
          trusted: true,
        });
      }
      
      return product;
    });
    
    productLogger.success('Products ready with real Amazon links', { count: products.length });
    
    const mediaSafeProducts = await Promise.all(productsWithLinks.map(ensureProductMedia));

    if (mediaSafeProducts.length < desiredResults) {
      throw new Error('AI payload missing product entries');
    }

    const debugInfo = {
      ...validated.debug,
      provider: validated.debug?.provider ?? 'openai',
      promptTokens: validated.debug?.promptTokens ?? aiResponse.usage?.input_tokens,
      completionTokens: validated.debug?.completionTokens ?? aiResponse.usage?.output_tokens,
    };
    const parsed: ProductGenerationResponse = {
      products: mediaSafeProducts,
      debug: debugInfo,
    };
    const sanitizedBytes = new TextEncoder().encode(JSON.stringify(parsed)).length;
    recordMetric('ai.response_sanitized_bytes', {
      bytes: sanitizedBytes,
      products: mediaSafeProducts.length,
    });
    memoryCache.set(cacheKey, parsed);
    recordMetric('ai.call_success', { provider: 'openai', count: mediaSafeProducts.length });
    return { response: parsed, cacheHit: false };
  } catch (error) {
    logProviderError(error);
    const reason = (error as Error)?.message ?? 'unknown';
    recordMetric('ai.call_failed', {
      reason,
    });
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(reason);
  }
};

export const clearProductCache = () => memoryCache.clear();
