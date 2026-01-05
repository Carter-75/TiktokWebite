import crypto from 'node:crypto';

import { recordMetric } from '@/lib/metrics/collector';
import {
  ProductGenerationRequest,
  ProductGenerationResponse,
  ProductContent,
} from '@/types/product';
import { buildProductPrompt, validateProductResponse } from '@/lib/ai/prompts';
import { staticProducts } from '@/lib/data/staticProducts';

const memoryCache = new Map<string, ProductGenerationResponse>();

const hashKey = (input: object) =>
  crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');

const pickFallbackProduct = (request: ProductGenerationRequest) => {
  const preferredTags = new Set(request.preferences.likedTags);
  const disliked = new Set(request.preferences.dislikedTags);

  const ranked = staticProducts
    .map((product) => {
      const productTags = product.tags.map((t) => t.id);
      const affinity = productTags.reduce((score, tag) => {
        if (disliked.has(tag)) return score - 1;
        if (preferredTags.has(tag)) return score + 1.5;
        return score + 0.1;
      }, 0);
      return { affinity, product };
    })
    .sort((a, b) => b.affinity - a.affinity);

  return ranked[0]?.product ?? staticProducts[0];
};

const clampText = (value: string, max = 320) => (value.length > max ? `${value.slice(0, max)}…` : value);

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
});

export const requestProductPage = async (
  request: ProductGenerationRequest,
  opts?: { forceNovelty?: boolean; preferStatic?: boolean }
): Promise<{ response: ProductGenerationResponse; cacheHit: boolean }> => {
  const cacheKey = hashKey({
    preferences: request.preferences,
    searchTerms: request.searchTerms,
    lastViewed: request.lastViewed.map((p) => p.id),
    preferStatic: opts?.preferStatic ?? false,
  });

  if (!opts?.forceNovelty && memoryCache.has(cacheKey)) {
    recordMetric('ai.cache_hit');
    return { response: memoryCache.get(cacheKey)!, cacheHit: true };
  }

  const providerUrl = process.env.AI_PROVIDER_URL;
  const providerKey = process.env.AI_PROVIDER_KEY;
  const hasProvider = Boolean(providerUrl && providerKey);
  const useProvider = hasProvider && !opts?.preferStatic;

  if (useProvider && providerUrl && providerKey) {
    const { system, user, schema } = buildProductPrompt(request);
    try {
      recordMetric('ai.call_attempt', { provider: 'remote' });
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
        throw new Error(`AI provider error: ${raw.status}`);
      }
      const json = await raw.json();
      const validated = validateProductResponse(json);
      const parsed: ProductGenerationResponse = {
        product: sanitizeProduct(validated.product),
        debug: validated.debug,
      };
      memoryCache.set(cacheKey, parsed);
      recordMetric('ai.call_success', { provider: 'remote' });
      return { response: parsed, cacheHit: false };
    } catch (err) {
      console.warn('[ai] provider failed, falling back to static dataset', err);
      recordMetric('ai.call_fallback', { reason: 'provider_error' });
    }
  } else {
    recordMetric('ai.call_skipped', {
      reason: opts?.preferStatic ? 'static_mode' : 'provider_missing',
    });
  }

  const fallback = pickFallbackProduct(request);
  const response: ProductGenerationResponse = {
    product: {
      ...sanitizeProduct(fallback),
      id: `${fallback.id}-${hashKey({ cacheKey, ts: Date.now() }).slice(0, 6)}`,
      generatedAt: new Date().toISOString(),
      source: hasProvider ? 'hybrid' : 'ai',
    },
  };
  recordMetric('ai.fallback_served', { preferStatic: opts?.preferStatic });
  memoryCache.set(cacheKey, response);
  return { response, cacheHit: false };
};

export const clearProductCache = () => memoryCache.clear();
