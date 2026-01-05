import { PreferenceSnapshot } from '@/types/preferences';
import { ProductContent } from '@/types/product';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export type Interaction = 'liked' | 'disliked' | 'reported' | 'viewed';

export const adjustWeights = (
  snapshot: PreferenceSnapshot,
  product: ProductContent,
  interaction: Interaction
): PreferenceSnapshot => {
  const updated: PreferenceSnapshot = { ...snapshot, tagWeights: { ...snapshot.tagWeights } };
  const delta =
    interaction === 'liked'
      ? 0.2
      : interaction === 'disliked'
      ? -0.3
      : interaction === 'reported'
      ? -1
      : 0.05;

  product.tags.forEach((tag) => {
    const current = updated.tagWeights[tag.id] ?? 0;
    const next = clamp(current + delta, -1, 2);
    updated.tagWeights[tag.id] = Number(next.toFixed(3));
  });

  if (interaction === 'liked') {
    const liked = new Set(updated.likedTags);
    product.tags.forEach((tag) => liked.add(tag.id));
    updated.likedTags = Array.from(liked);
  }
  if (interaction === 'disliked') {
    const disliked = new Set(updated.dislikedTags);
    product.tags.forEach((tag) => disliked.add(tag.id));
    updated.dislikedTags = Array.from(disliked);
  }
  if (interaction === 'reported') {
    updated.blacklistedItems = [...new Set([...updated.blacklistedItems, product.id])];
  }

  return updated;
};

export const scoreProductForQueue = (
  product: ProductContent,
  snapshot: PreferenceSnapshot
): number => {
  const weights = snapshot.tagWeights;
  return product.tags.reduce((score, tag) => score + (weights[tag.id] ?? 0), 0);
};

export const dedupeProducts = (
  products: ProductContent[],
  blacklist: Set<string>
): ProductContent[] => {
  const seen = new Set<string>();
  return products.filter((product) => {
    if (blacklist.has(product.id)) return false;
    if (seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  });
};

export const deriveSearchWeights = (searchText: string): string[] => {
  return searchText
    .split(/[,\s]+/)
    .map((chunk) => chunk.trim().toLowerCase())
    .filter(Boolean);
};

export const mergeSearchIntoPreferences = (
  snapshot: PreferenceSnapshot,
  searchTerms: string[]
): PreferenceSnapshot => {
  const merged: PreferenceSnapshot = { ...snapshot, tagWeights: { ...snapshot.tagWeights } };
  searchTerms.forEach((term) => {
    const key = term.replace(/[^a-z0-9-]/gi, '-');
    merged.tagWeights[key] = clamp((merged.tagWeights[key] ?? 0) + 0.35, -1, 2);
  });
  return merged;
};
