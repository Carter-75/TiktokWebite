import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { recordMetric } from '@/lib/metrics/collector';
import { enforceRateLimit, RateLimitError } from '@/lib/server/rateLimit';

const schema = z.object({
  event: z.string().min(1).max(64),
  meta: z.record(z.any()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    enforceRateLimit(request, 'metrics');
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 429, headers: { 'Retry-After': String(error.retryAfterSeconds) } }
      );
    }
    throw error;
  }

  const rawBody = await request.text();
  if (!rawBody) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  let jsonPayload: unknown;
  try {
    jsonPayload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsed = schema.safeParse(jsonPayload);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }
  recordMetric(parsed.data.event, {
    origin: 'client',
    ...parsed.data.meta,
  });
  return NextResponse.json({ ok: true });
}
