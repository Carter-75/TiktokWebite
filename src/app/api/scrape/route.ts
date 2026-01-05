import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { recordMetric } from '@/lib/metrics/collector';
import { scrapeProductMetadata } from '@/lib/scraper/fetchProduct';
import { enforceRateLimit, RateLimitError } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

const schema = z.object({ url: z.string().url() });

export async function POST(request: NextRequest) {
  try {
    enforceRateLimit(request, 'scrape');
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 429, headers: { 'Retry-After': String(error.retryAfterSeconds) } }
      );
    }
    throw error;
  }

  const json = await request.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }
  try {
    const payload = await scrapeProductMetadata(parsed.data.url);
    recordMetric('api.scrape', { ok: true });
    return NextResponse.json({ ok: true, payload });
  } catch (error) {
    recordMetric('api.scrape', { ok: false });
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 422 });
  }
}
