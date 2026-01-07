import type { ProductContent } from '@/types/product';

const FALLBACK_LIBRARY = [
  '/media/placeholders/aurora.svg',
  '/media/placeholders/circuit.svg',
  '/media/placeholders/sunrise.svg',
];

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

export const buildFallbackMediaUrl = (product: Pick<ProductContent, 'title' | 'tags'>) => {
  const seed = [product.title, ...(product.tags ?? []).map((tag) => tag.label)].filter(Boolean).join('|') || 'product';
  const selected = FALLBACK_LIBRARY[hashString(seed) % FALLBACK_LIBRARY.length];
  return selected;
};
