import { describe, expect, it } from 'vitest';

import { adjustWeights } from '@/lib/feed/engine';
import { PreferenceSnapshot } from '@/types/preferences';
import { ProductContent } from '@/types/product';

const basePreferences: PreferenceSnapshot = {
  likedTags: [],
  dislikedTags: [],
  blacklistedItems: [],
  tagWeights: {},
};

const mockProduct: ProductContent = {
  id: 'p-1',
  title: 'Test',
  summary: 'summary',
  whatItIs: 'thing',
  whyUseful: 'useful',
  priceRange: { min: 1, max: 2, currency: 'USD' },
  pros: ['pro'],
  cons: ['con'],
  tags: [
    { id: 'smart-home', label: 'Smart Home' },
    { id: 'lighting', label: 'Lighting' },
  ],
  buyLinks: [{ label: 'Store', url: 'https://example.com', trusted: true }],
  noveltyScore: 0.5,
  generatedAt: new Date().toISOString(),
  source: 'ai',
};

describe('adjustWeights', () => {
  it('increases weights on like interactions', () => {
    const updated = adjustWeights(basePreferences, mockProduct, 'liked');
    expect(updated.tagWeights['smart-home']).toBeGreaterThan(0);
    expect(updated.likedTags).toContain('smart-home');
  });

  it('penalizes tags on report', () => {
    const updated = adjustWeights(basePreferences, mockProduct, 'reported');
    expect(updated.tagWeights['smart-home']).toBeLessThan(0);
    expect(updated.blacklistedItems).toContain('p-1');
  });
});
