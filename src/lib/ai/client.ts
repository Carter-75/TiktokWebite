import crypto from 'node:crypto';

import OpenAI from 'openai';
import type { Response as OpenAIResponsePayload } from 'openai/resources/responses/responses';

import { recordMetric } from '@/lib/metrics/collector';
import { ProductGenerationRequest, ProductGenerationResponse, ProductContent } from '@/types/product';
import {
  buildProductPrompt,
  validateProductResponse,
  type ProductResponseShape,
} from '@/lib/ai/prompts';
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

const clampConfidence = (value?: number | null) => {
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
    console.error('[ai.provider] Failed to parse JSON payload', {
      snippet: jsonText.slice(0, 200),
    });
    throw new Error('AI provider returned invalid JSON payload');
  }
};

const logProviderError = (error: unknown) => {
  if (error instanceof OpenAI.APIError) {
    const pickHeader = (header: string) =>
      typeof error.headers?.get === 'function' ? error.headers.get(header) ?? undefined : undefined;
    console.error('[ai.provider] OpenAI API error', {
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
    console.error('[ai.provider] Unexpected provider error', error);
    return;
  }

  console.error('[ai.provider] Unknown provider error', { error });
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

  const { system, user, schema, schemaName } = buildProductPrompt(normalizedRequest);
  const openAiClient = buildOpenAIClient();
  const targetModel = process.env.AI_PROVIDER_MODEL ?? 'gpt-4o-mini';
  try {
    recordMetric('ai.call_attempt', { provider: 'openai', count: desiredResults });
    const aiResponse = await openAiClient.responses.parse({
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
      (aiResponse.output_parsed as ProductResponseShape | null) ??
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
    const enrichedProducts = await enrichProductsWithRetailers(sanitizedProducts);

    if (enrichedProducts.length < desiredResults) {
      throw new Error('AI payload missing product entries');
    }

    const debugInfo = {
      ...validated.debug,
      provider: validated.debug?.provider ?? 'openai',
      promptTokens: validated.debug?.promptTokens ?? aiResponse.usage?.input_tokens,
      completionTokens: validated.debug?.completionTokens ?? aiResponse.usage?.output_tokens,
    };
    const parsed: ProductGenerationResponse = {
      products: enrichedProducts,
      debug: debugInfo,
    };
    const sanitizedBytes = new TextEncoder().encode(JSON.stringify(parsed)).length;
    recordMetric('ai.response_sanitized_bytes', {
      bytes: sanitizedBytes,
      products: enrichedProducts.length,
    });
    memoryCache.set(cacheKey, parsed);
    recordMetric('ai.call_success', { provider: 'openai', count: enrichedProducts.length });
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
