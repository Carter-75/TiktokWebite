import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requestProductPage } from '@/lib/ai/client';
import { staticProducts } from '@/lib/data/staticProducts';
import { recordMetric } from '@/lib/metrics/collector';
import { enforceRateLimit, RateLimitError } from '@/lib/server/rateLimit';
import { aiLogger } from '@/lib/logger';

const payloadSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  preferences: z.object({
    likedTags: z.array(z.string()),
    dislikedTags: z.array(z.string()),
    blacklistedItems: z.array(z.string()),
    tagWeights: z.record(z.number()),
  }),
  searchTerms: z.array(z.string()).default([]),
  lastViewed: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        summary: z.string(),
        whatItIs: z.string(),
        whyUseful: z.string(),
        priceRange: z.object({
          min: z.number(),
          max: z.number(),
          currency: z.string(),
        }),
        pros: z.array(z.string()),
        cons: z.array(z.string()),
        tags: z.array(z.object({ id: z.string(), label: z.string() })),
        buyLinks: z.array(
          z.object({ label: z.string(), url: z.string(), priceHint: z.string().nullable().optional(), trusted: z.boolean() })
        ),
        mediaUrl: z.string().nullable().optional(),
        noveltyScore: z.number(),
        generatedAt: z.string(),
        source: z.enum(['ai', 'scrape', 'hybrid']),
        retailLookupConfidence: z.number().nullable().optional(),
      })
    )
    .default([]),
  forceNovelty: z.boolean().optional(),
  resultsRequested: z.number().int().min(2).max(4).optional(),
});

const guardRateLimit = (request: NextRequest, identity?: string) => {
  try {
    enforceRateLimit(request, 'generate', identity);
    return null;
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: error.message },
        { status: 429, headers: { 'Retry-After': String(error.retryAfterSeconds) } }
      );
    }
    throw error;
  }
};

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const rateLimitResponse = guardRateLimit(request, 'invalid');
    if (rateLimitResponse) return rateLimitResponse;
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    const rateLimitResponse = guardRateLimit(request, 'invalid');
    if (rateLimitResponse) return rateLimitResponse;
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const rateLimitResponse = guardRateLimit(request, parsed.data.sessionId ?? parsed.data.userId);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { response, cacheHit } = await requestProductPage(parsed.data, {
      forceNovelty: parsed.data.forceNovelty,
    });
    recordMetric('api.generate', {
      cacheHit,
      requested: parsed.data.resultsRequested ?? 2,
    });
    return NextResponse.json({ ...response, cacheHit });
  } catch (error) {
    // NO FALLBACKS - Show clear error so you know when things break
    aiLogger.error('AI provider failed - NO FALLBACK', {
      error: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    
    recordMetric('api.generate', {
      failed: true,
      reason: (error as Error).message || 'unknown',
    });
    
    return NextResponse.json(
      { 
        error: 'Product generation failed. Check console for details.',
        details: (error as Error).message,
        stack: process.env.NODE_ENV === 'development' ? (error as Error).stack : undefined
      }, 
      { status: 503 }
    );
  }
}
