import { describe, expect, it, vi, afterEach } from 'vitest';

import { applyHistoryRetention } from '@/lib/preferences/storage';
import { HistorySnapshot } from '@/types/preferences';

const makeSnapshot = (size: number): HistorySnapshot => {
  const makeIds = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => `${prefix}-${index}`);
  const makeTimeline = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      id: `event-${index}`,
      type: index % 2 === 0 ? 'liked' : 'viewed',
      occurredAt: new Date(Date.now() - index * 60_000).toISOString(),
      product: { id: `product-${index}` },
    }));
  const makeSearches = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      id: `search-${index}`,
      query: `query-${index}`,
      derivedTags: ['tag'],
      searchedAt: new Date(Date.now() - index * 90_000).toISOString(),
    }));
  return {
    viewed: makeIds('viewed', size),
    liked: makeIds('liked', size),
    disliked: makeIds('disliked', size),
    reported: makeIds('reported', size),
    saved: makeIds('saved', size),
    searches: makeSearches(size),
    timeline: makeTimeline(size * 2),
    viewTimestamps: makeIds('viewed', size * 2).reduce<Record<string, string>>((acc, id, idx) => {
      acc[id] = new Date(Date.now() - idx * 24 * 60 * 60 * 1000).toISOString();
      return acc;
    }, {}),
  };
};

afterEach(() => {
  vi.useRealTimers();
});

describe('applyHistoryRetention', () => {
  it('caps events and searches in balanced mode', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const snapshot = makeSnapshot(800);
    const retained = applyHistoryRetention(snapshot, 'balanced');
    expect(retained.viewed).toHaveLength(400);
    expect(retained.liked).toHaveLength(400);
    expect(retained.disliked).toHaveLength(400);
    expect(retained.reported).toHaveLength(400);
    expect(retained.saved).toHaveLength(400);
    expect(retained.searches).toHaveLength(250);
    expect(retained.timeline).toHaveLength(600);
    // timestamps older than 30 days should be pruned
    const timestamps = Object.values(retained.viewTimestamps);
    expect(timestamps.every((iso) => new Date('2026-01-01T00:00:00Z').getTime() - new Date(iso).getTime() <= 30 * 24 * 60 * 60 * 1000)).toBe(true);
  });

  it('keeps everything in unlimited mode', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const snapshot = makeSnapshot(100);
    const retained = applyHistoryRetention(snapshot, 'unlimited');
    expect(retained.viewed).toHaveLength(snapshot.viewed.length);
    expect(retained.saved).toHaveLength(snapshot.saved.length);
    expect(retained.timeline).toHaveLength(snapshot.timeline.length);
    expect(Object.keys(retained.viewTimestamps).length).toBe(Object.keys(snapshot.viewTimestamps).length);
  });
});
