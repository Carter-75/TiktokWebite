import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

import { requestProductPage, clearProductCache } from '@/lib/ai/client';
import { ProductGenerationRequest } from '@/types/product';

const mockResponsesCreate = vi.fn();

vi.mock('openai', () => {
  class MockOpenAI {
    responses = { create: mockResponsesCreate };
    static APIError = class extends Error {};
    constructor(_config: { apiKey: string; baseURL?: string }) {}
  }

  return {
    default: MockOpenAI,
  };
});

const baseRequest: ProductGenerationRequest = {
  sessionId: 'sess-1',
  userId: 'user-1',
  preferences: {
    likedTags: ['audio', 'travel'],
    dislikedTags: [],
    blacklistedItems: [],
    tagWeights: {},
  },
  searchTerms: ['portable'],
  lastViewed: [],
  resultsRequested: 2,
};

const fetchSpy = vi.spyOn(globalThis, 'fetch');

beforeEach(() => {
  clearProductCache();
  fetchSpy.mockReset();
  mockResponsesCreate.mockReset();
  process.env.AI_PROVIDER_URL = 'https://api.example.com/v1/responses';
  process.env.AI_PROVIDER_KEY = 'test-key';
  process.env.AI_PROVIDER_MODEL = 'test-model';
  process.env.SERPAPI_KEY = 'test-serp';
});

afterAll(() => {
  fetchSpy.mockRestore();
});

describe('requestProductPage', () => {
  it('throws when provider config is missing', async () => {
    delete process.env.AI_PROVIDER_KEY;

    await expect(requestProductPage(baseRequest)).rejects.toThrow('AI provider credentials missing');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockResponsesCreate).not.toHaveBeenCalled();
  });

  it('propagates provider errors when the remote call fails', async () => {
    mockResponsesCreate.mockRejectedValueOnce(new Error('Product generation is unavailable right now.'));

    await expect(requestProductPage(baseRequest)).rejects.toThrow('Product generation is unavailable right now.');
    expect(mockResponsesCreate).toHaveBeenCalled();
  });

  it('uses the remote provider when it succeeds', async () => {
    const iso = new Date().toISOString();
    const serpResponse = {
      ok: true,
      json: async () => ({
        shopping_results: [
          {
            store: 'Test Retailer',
            link: 'https://example.com/buy',
            price: '$109',
            shipping: 'Free Shipping',
          },
        ],
      }),
    } as Response;

    mockResponsesCreate.mockResolvedValueOnce({
      id: 'resp_123',
      output_text: [
        JSON.stringify({
          products: [
            {
              id: 'remote-1',
              title: 'Remote Product One',
              summary: 'Remote summary',
              whatItIs: 'Remote item',
              whyUseful: 'Remote usefulness',
              priceRange: { min: 99, max: 129, currency: 'USD' },
              pros: ['Pro one', 'Pro two'],
              cons: ['Con one'],
              tags: [{ id: 'audio', label: 'Audio' }],
              buyLinks: [
                { label: 'Remote Shop', url: 'https://example.com/one', priceHint: '$109', trusted: true },
              ],
              mediaUrl: 'https://example.com/one.jpg',
              noveltyScore: 0.44,
              generatedAt: iso,
              source: 'ai' as const,
            },
            {
              id: 'remote-2',
              title: 'Remote Product Two',
              summary: 'Another summary',
              whatItIs: 'Another item',
              whyUseful: 'Another usefulness',
              priceRange: { min: 59, max: 79, currency: 'USD' },
              pros: ['Pro three', 'Pro four'],
              cons: ['Con two'],
              tags: [{ id: 'travel', label: 'Travel' }],
              buyLinks: [
                { label: 'Remote Shop 2', url: 'https://example.com/two', priceHint: '$69', trusted: true },
              ],
              mediaUrl: 'https://example.com/two.jpg',
              noveltyScore: 0.33,
              generatedAt: iso,
              source: 'ai' as const,
            },
          ],
          debug: { provider: 'remote' },
        }),
      ],
      usage: { input_tokens: 123, output_tokens: 456 },
    });

    fetchSpy.mockResolvedValueOnce(serpResponse).mockResolvedValueOnce(serpResponse);

    const result = await requestProductPage(baseRequest);

    expect(result.cacheHit).toBe(false);
    expect(result.response.products[0].id).toBe('remote-1');
    expect(result.response.debug?.provider).toBe('remote');
    expect(mockResponsesCreate).toHaveBeenCalledTimes(1);
  });
});
