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

const queueSuccessfulAiResponse = () => {
  const iso = new Date().toISOString();
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
};

const resolveUrl = (input: Parameters<typeof fetch>[0]) => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  return '';
};

// Mock Amazon Product Advertising API response
const queueAmazonSearchResponse = () => {
  const amazonResponse = {
    ok: true,
    json: async () => ({
      SearchResult: {
        Items: [
          {
            ASIN: 'B08TESTXYZ',
            DetailPageURL: 'https://www.amazon.com/dp/B08TESTXYZ',
            ItemInfo: {
              Title: { DisplayValue: 'Portable Bluetooth Speaker' }
            },
            Offers: {
              Listings: [
                { Price: { DisplayAmount: '$109.99', Amount: 109.99, Currency: 'USD' } }
              ]
            },
            Images: {
              Primary: {
                Large: { URL: 'https://m.media-amazon.com/images/I/test1.jpg' }
              }
            },
            CustomerReviews: {
              StarRating: { Value: 4.5 },
              Count: 1234
            }
          },
          {
            ASIN: 'B09TESTXYZ',
            DetailPageURL: 'https://www.amazon.com/dp/B09TESTXYZ',
            ItemInfo: {
              Title: { DisplayValue: 'Portable Power Bank' }
            },
            Offers: {
              Listings: [
                { Price: { DisplayAmount: '$69.99', Amount: 69.99, Currency: 'USD' } }
              ]
            },
            Images: {
              Primary: {
                Large: { URL: 'https://m.media-amazon.com/images/I/test2.jpg' }
              }
            },
            CustomerReviews: {
              StarRating: { Value: 4.7 },
              Count: 5678
            }
          }
        ]
      }
    }),
  } as Response;
  
  return amazonResponse;
};

beforeEach(() => {
  clearProductCache();
  fetchSpy.mockReset();
  mockResponsesCreate.mockReset();
  process.env.AI_PROVIDER_URL = 'https://api.example.com/v1/responses';
  process.env.AI_PROVIDER_KEY = 'test-key';
  process.env.AI_PROVIDER_MODEL = 'test-model';
  process.env.AMAZON_ACCESS_KEY = 'test-access';
  process.env.AMAZON_SECRET_KEY = 'test-secret';
  process.env.AMAZON_ASSOCIATE_TAG = 'test-tag';
});

afterAll(() => {
  fetchSpy.mockRestore();
});

describe('requestProductPage', () => {
  it('throws when provider config is missing', async () => {
    delete process.env.AMAZON_ACCESS_KEY;

    await expect(requestProductPage(baseRequest)).rejects.toThrow('amazon_credentials_missing');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockResponsesCreate).not.toHaveBeenCalled();
  });

  it('propagates provider errors when the remote call fails', async () => {
    const amazonResponse = queueAmazonSearchResponse();
    fetchSpy.mockImplementation((input) => {
      const url = resolveUrl(input);
      if (url.includes('amazon.com')) {
        return Promise.resolve(amazonResponse);
      }
      return Promise.resolve(new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } }));
    });

    mockResponsesCreate.mockRejectedValueOnce(new Error('Product generation is unavailable right now.'));

    await expect(requestProductPage(baseRequest)).rejects.toThrow('Product generation is unavailable right now.');
    expect(mockResponsesCreate).toHaveBeenCalled();
  });

  it('uses the remote provider when it succeeds', async () => {
    queueSuccessfulAiResponse();
    const amazonResponse = queueAmazonSearchResponse();

    fetchSpy.mockImplementation((input) => {
      const url = resolveUrl(input);
      if (url.includes('amazon.com')) {
        return Promise.resolve(amazonResponse);
      }
      return Promise.resolve(
        new Response(null, {
          status: 200,
          headers: {
            'content-type': 'image/jpeg',
          },
        })
      );
    });

    const result = await requestProductPage(baseRequest);

    expect(result.cacheHit).toBe(false);
    expect(result.response.products[0].id).toBe('remote-1');
    expect(result.response.debug?.provider).toBe('remote');
    expect(mockResponsesCreate).toHaveBeenCalledTimes(1);
  });

  it('falls back to placeholder media when remote assets fail validation', async () => {
    queueSuccessfulAiResponse();
    const amazonResponse = queueAmazonSearchResponse();

    fetchSpy.mockImplementation((input) => {
      const url = resolveUrl(input);
      if (url.includes('amazon.com')) {
        return Promise.resolve(amazonResponse);
      }
      return Promise.resolve(
        new Response(null, {
          status: 404,
          headers: {
            'content-type': 'text/html; charset=utf-8',
          },
        })
      );
    });

    const result = await requestProductPage(baseRequest);

    expect(result.response.products).toHaveLength(2);
    result.response.products.forEach((product) => {
      expect(product.mediaUrl).toMatch(/^\/media\/placeholders\//);
    });
  });
});
