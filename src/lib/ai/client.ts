import crypto from 'node:crypto';

import { recordMetric } from '@/lib/metrics/collector';
import { ProductGenerationRequest, ProductGenerationResponse, ProductContent } from '@/types/product';
import { buildProductPrompt, validateProductResponse } from '@/lib/ai/prompts';
import { enrichProductsWithRetailers } from '@/lib/ai/linkEnricher';

const memoryCache = new Map<string, ProductGenerationResponse>();

const hashKey = (input: object) =>
  crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');

const clampText = (value: string, max = 320) => (value.length > max ? `${value.slice(0, max)}…` : value);

const deriveMediaUrl = (product: ProductContent) => {
  if (product.mediaUrl?.startsWith('http')) {
    return product.mediaUrl;
  }
  const keywords = [product.title, ...product.tags.map((tag) => tag.label)].filter(Boolean).join(',');
  const query = encodeURIComponent(keywords || 'modern product gadget');
  return `https://source.unsplash.com/featured/900x600?${query}`;
};

const sanitizeProduct = (product: ProductContent): ProductContent => ({
  ...product,
  summary: clampText(product.summary),
  whatItIs: clampText(product.whatItIs),
  whyUseful: clampText(product.whyUseful),
  pros: product.pros.slice(0, 5).map((item) => clampText(item, 160)),
  cons: product.cons.slice(0, 5).map((item) => clampText(item, 160)),
  tags: product.tags.slice(0, 8),
  buyLinks: product.buyLinks.slice(0, 4),
  noveltyScore: Number(Math.min(1, Math.max(0, product.noveltyScore)).toFixed(2)),
  mediaUrl: deriveMediaUrl(product),
});

const clampResultCount = (value?: number) => Math.min(4, Math.max(2, value ?? 2));

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

  const providerUrl = process.env.AI_PROVIDER_URL;
  const providerKey = process.env.AI_PROVIDER_KEY;
  if (!providerUrl || !providerKey) {
    recordMetric('ai.call_skipped', { reason: 'provider_missing' });
    throw new Error('AI provider credentials missing');
  }

  const { system, user, schema } = buildProductPrompt(normalizedRequest);
  try {
    recordMetric('ai.call_attempt', { provider: 'remote', count: desiredResults });
    const raw = await fetch(providerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${providerKey}`,
      },
      body: JSON.stringify({
        model: process.env.AI_PROVIDER_MODEL ?? 'gpt-4o-mini',
        system,
        input: user,
        response_format: { type: 'json_schema', json_schema: schema },
      }),
      cache: 'no-store',
    });

    if (!raw.ok) {
      let errorMessage = `AI provider error: ${raw.status}`;
      const contentType = raw.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        try {
          const errorJson = await raw.json();
          if (typeof errorJson?.error === 'string' && errorJson.error.trim()) {
            errorMessage = errorJson.error.trim();
          }
        } catch {
          // ignore parse issues and fall back to default message
        }
      } else {
        try {
          const text = (await raw.text()).trim();
          if (text) {
            errorMessage = text;
          }
        } catch {
          // ignore
        }
      }
      throw new Error(errorMessage);
    }
    const json = await raw.json();
    const validated = validateProductResponse(json);
    const sanitizedProducts = validated.products.slice(0, desiredResults).map(sanitizeProduct);
    const enrichedProducts = await enrichProductsWithRetailers(sanitizedProducts);

    if (enrichedProducts.length < desiredResults) {
      throw new Error('AI payload missing product entries');
    }

    const parsed: ProductGenerationResponse = {
      products: enrichedProducts,
      debug: validated.debug,
    };
    memoryCache.set(cacheKey, parsed);
    recordMetric('ai.call_success', { provider: 'remote', count: enrichedProducts.length });
    return { response: parsed, cacheHit: false };
  } catch (error) {
    const reason = (error as Error)?.message ?? 'unknown';
    recordMetric('ai.call_failed', {
      reason,
    });
    throw error;
  }
};

export const clearProductCache = () => memoryCache.clear();
