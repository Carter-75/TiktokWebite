import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requestProductPage } from '@/lib/ai/client';
import { recordMetric } from '@/lib/metrics/collector';
import { enforceRateLimit, RateLimitError } from '@/lib/server/rateLimit';

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
          z.object({ label: z.string(), url: z.string(), priceHint: z.string().optional(), trusted: z.boolean() })
        ),
        mediaUrl: z.string().optional(),
        noveltyScore: z.number(),
        generatedAt: z.string(),
        source: z.enum(['ai', 'scrape', 'hybrid']),
      })
    )
    .default([]),
  forceNovelty: z.boolean().optional(),
  preferStaticDataset: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    enforceRateLimit(request, 'generate');
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: error.message },
        { status: 429, headers: { 'Retry-After': String(error.retryAfterSeconds) } }
      );
    }
    throw error;
  }

  const body = await request.json();
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { response, cacheHit } = await requestProductPage(parsed.data, {
    forceNovelty: parsed.data.forceNovelty,
    preferStatic: parsed.data.preferStaticDataset,
  });
  recordMetric('api.generate', { cacheHit, preferStatic: parsed.data.preferStaticDataset });

  return NextResponse.json({ ...response, cacheHit });
}
