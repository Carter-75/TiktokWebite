import crypto from 'node:crypto';

import { recordMetric } from '@/lib/metrics/collector';
import { ProductGenerationRequest, ProductGenerationResponse, ProductContent } from '@/types/product';
import { buildProductPrompt, validateProductResponse } from '@/lib/ai/prompts';
import { enrichProductsWithRetailers } from '@/lib/ai/linkEnricher';

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

const clampConfidence = (value?: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0.55;
  }
  return Number(Math.min(1, Math.max(0, value)).toFixed(3));
};

const deriveMediaUrl = (product: ProductContent) => {
  if (product.mediaUrl?.startsWith('http')) {
    return product.mediaUrl;
  }
  const keywords = [product.title, ...product.tags.map((tag) => tag.label)].filter(Boolean).join(',');
  const query = encodeURIComponent(keywords || 'modern product gadget');
  return `https://source.unsplash.com/featured/900x600?${query}`;
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
    mediaUrl: deriveMediaUrl(product),
    retailLookupConfidence: clampConfidence(product.retailLookupConfidence),
  };
};

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

  const { system, user, schema, schemaName } = buildProductPrompt(normalizedRequest);
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
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: schemaName,
            schema,
            strict: true,
          },
        },
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
    const payloadText = JSON.stringify(json);
    const payloadBytes = new TextEncoder().encode(payloadText).length;
    const validated = validateProductResponse(json);
    recordMetric('ai.response_size_bytes', {
      bytes: payloadBytes,
      products: validated.products.length,
    });
    if (validated.debug?.promptTokens || validated.debug?.completionTokens) {
      recordMetric('ai.token_usage', {
        promptTokens: validated.debug?.promptTokens ?? 0,
        completionTokens: validated.debug?.completionTokens ?? 0,
        provider: validated.debug?.provider ?? 'unknown',
      });
    }

    const sanitizedProducts = validated.products.slice(0, desiredResults).map(sanitizeProduct);
    const enrichedProducts = await enrichProductsWithRetailers(sanitizedProducts);

    if (enrichedProducts.length < desiredResults) {
      throw new Error('AI payload missing product entries');
    }

    const parsed: ProductGenerationResponse = {
      products: enrichedProducts,
      debug: validated.debug,
    };
    const sanitizedBytes = new TextEncoder().encode(JSON.stringify(parsed)).length;
    recordMetric('ai.response_sanitized_bytes', {
      bytes: sanitizedBytes,
      products: enrichedProducts.length,
    });
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
