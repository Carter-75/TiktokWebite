'use client';

import { useCallback, useEffect, useState } from 'react';

import { adjustWeights, Interaction } from '@/lib/feed/engine';
import {
  createBlankHistory,
  createBlankPreferences,
  loadHistorySnapshot,
  loadPreferenceSnapshot,
  persistHistorySnapshot,
  persistPreferenceSnapshot,
} from '@/lib/preferences/storage';
import { ProductContent } from '@/types/product';

const makeHistoryEntryId = () => (crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

export const useFeedLearning = () => {
  const [preferences, setPreferences] = useState(createBlankPreferences);
  const [history, setHistory] = useState(createBlankHistory);

  useEffect(() => {
    setPreferences(loadPreferenceSnapshot());
    setHistory(loadHistorySnapshot());
  }, []);

  const recordInteraction = useCallback((product: ProductContent, interaction: Interaction) => {
    setPreferences((prev) => {
      const updatedPreferences = adjustWeights(prev, product, interaction);
      persistPreferenceSnapshot(updatedPreferences);
      return updatedPreferences;
    });

    setHistory((prev) => {
      const nowIso = new Date().toISOString();
      const updatedHistory = {
        ...prev,
        viewed: interaction === 'viewed' ? [...prev.viewed, product.id] : prev.viewed,
        liked: interaction === 'liked' ? [...prev.liked, product.id] : prev.liked,
        disliked: interaction === 'disliked' ? [...prev.disliked, product.id] : prev.disliked,
        reported: interaction === 'reported' ? [...prev.reported, product.id] : prev.reported,
        viewTimestamps:
          interaction === 'viewed'
            ? { ...prev.viewTimestamps, [product.id]: nowIso }
            : prev.viewTimestamps,
        timeline: [
          ...prev.timeline,
          {
            id: makeHistoryEntryId(),
            type: interaction,
            occurredAt: nowIso,
            product: {
              id: product.id,
              title: product.title,
              tags: product.tags.map((tag) => tag.label),
            },
          },
        ],
      };
      persistHistorySnapshot(updatedHistory);
      return updatedHistory;
    });
  }, []);

  const recordSave = useCallback((product: ProductContent) => {
    setHistory((prev) => {
      const nowIso = new Date().toISOString();
      const savedSet = new Set(prev.saved);
      savedSet.add(product.id);
      const updatedHistory = {
        ...prev,
        saved: Array.from(savedSet),
        timeline: [
          ...prev.timeline,
          {
            id: makeHistoryEntryId(),
            type: 'saved' as const,
            occurredAt: nowIso,
            product: {
              id: product.id,
              title: product.title,
              tags: product.tags.map((tag) => tag.label),
            },
          },
        ],
      };
      persistHistorySnapshot(updatedHistory);
      return updatedHistory;
    });
  }, []);

  const recordSearch = useCallback((query: string, derivedTags: string[]) => {
    if (!query.trim()) return;
    const nowIso = new Date().toISOString();
    setHistory((prev) => {
      const searchEntry = {
        id: makeHistoryEntryId(),
        query,
        derivedTags,
        searchedAt: nowIso,
      };
      const updatedHistory = {
        ...prev,
        searches: [...prev.searches, searchEntry],
        timeline: [
          ...prev.timeline,
          {
            id: makeHistoryEntryId(),
            type: 'search' as const,
            occurredAt: nowIso,
            search: { query, derivedTags },
          },
        ],
      };
      persistHistorySnapshot(updatedHistory);
      return updatedHistory;
    });
  }, []);

  const resetHistory = useCallback(() => {
    const blank = createBlankHistory();
    setHistory(blank);
    persistHistorySnapshot(blank);
  }, []);

  const resetPreferences = useCallback(() => {
    const blank = createBlankPreferences();
    setPreferences(blank);
    persistPreferenceSnapshot(blank);
  }, []);

  return { preferences, history, recordInteraction, recordSearch, recordSave, resetHistory, resetPreferences };
};
