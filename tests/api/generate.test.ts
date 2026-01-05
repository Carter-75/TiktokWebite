import { NextRequest } from 'next/server';
import { describe, expect, beforeEach, vi, it } from 'vitest';

import { POST } from '@/app/api/generate/route';
import { requestProductPage } from '@/lib/ai/client';
import { resetRateLimiters } from '@/lib/server/rateLimit';

const mockProduct = vi.hoisted(() => ({
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
  generatedAt: '2025-01-01T00:00:00.000Z',
  source: 'ai' as const,
  mediaUrl: 'https://example.com/image.jpg',
}));

vi.mock('@/lib/ai/client', () => {
  const buildProducts = () => [
    { ...mockProduct, generatedAt: new Date().toISOString() },
    { ...mockProduct, id: 'test-product-2', generatedAt: new Date().toISOString() },
  ];
  return {
    requestProductPage: vi.fn().mockResolvedValue({
      response: {
        products: buildProducts(),
      },
      cacheHit: false,
    }),
  };
});


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
    const json = await res.json();
    expect(json.products).toHaveLength(2);
    expect(json.products[0].id).toBe('test-product');
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

  it('surfaces 503 when provider fails', async () => {
    vi.mocked(requestProductPage).mockRejectedValueOnce(new Error('boom'));
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
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/unavailable/i);
  });
});
