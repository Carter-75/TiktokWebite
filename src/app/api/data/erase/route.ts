import { NextResponse } from 'next/server';

import { clearProductCache } from '@/lib/ai/client';
import { resetRateLimiters } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

export const POST = async () => {
  clearProductCache();
  resetRateLimiters();
  return NextResponse.json({ status: 'cleared' });
};
