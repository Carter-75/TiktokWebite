import { NextRequest } from 'next/server';
import { describe, expect, beforeEach, vi, it } from 'vitest';

import { POST } from '@/app/api/generate/route';
import { requestProductPage } from '@/lib/ai/client';
import { resetRateLimiters } from '@/lib/server/rateLimit';

vi.mock('@/lib/ai/client', () => ({
  requestProductPage: vi.fn().mockResolvedValue({
    response: {
      product: {
        id: 'test-product',
        title: 'Test Product',
        summary: 'Summary',
        whatItIs: 'Something great',
        whyUseful: 'Because reasons',
        priceRange: { min: 10, max: 20, currency: 'USD' },
        pros: ['pro'],
        cons: ['con'],
        tags: [{ id: 'tag', label: 'Tag' }],
        buyLinks: [{ label: 'Store', url: 'https://example.com', trusted: true }],
        noveltyScore: 0.5,
        generatedAt: new Date().toISOString(),
        source: 'ai',
      },
    },
    cacheHit: false,
  }),
}));

const makeRequest = (body: unknown) =>
  new NextRequest('http://localhost/api/generate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('/api/generate', () => {
  beforeEach(() => {
    resetRateLimiters();
    process.env.RATE_LIMIT_MAX = '5';
    process.env.RATE_LIMIT_WINDOW_MS = '1000';
    vi.mocked(requestProductPage).mockClear();
  });

  it('rejects invalid payloads', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns product payload for valid requests', async () => {
    const payload = {
      sessionId: 's1',
      userId: 'u1',
      preferences: {
        likedTags: [],
        dislikedTags: [],
        blacklistedItems: [],
        tagWeights: {},
      },
      searchTerms: [],
      lastViewed: [],
    };
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty('product.id', 'test-product');
  });

  it('rate limits after threshold', async () => {
    process.env.RATE_LIMIT_MAX = '1';
    const payload = {
      sessionId: 's1',
      userId: 'u1',
      preferences: {
        likedTags: [],
        dislikedTags: [],
        blacklistedItems: [],
        tagWeights: {},
      },
      searchTerms: [],
      lastViewed: [],
    };
    await POST(makeRequest(payload));
    const second = await POST(makeRequest(payload));
    expect(second.status).toBe(429);
  });
});
