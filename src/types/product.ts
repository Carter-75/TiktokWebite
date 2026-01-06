export type Tag = {
  id: string;
  label: string;
  weight?: number | null;
};

export type BuyLink = {
  label: string;
  url: string;
  priceHint?: string | null;
  trusted: boolean;
};

export type PriceRange = {
  min: number;
  max: number;
  currency: string;
};

export type ProductContent = {
  id: string;
  title: string;
  summary: string;
  whatItIs: string;
  whyUseful: string;
  priceRange: PriceRange;
  pros: string[];
  cons: string[];
  tags: Tag[];
  buyLinks: BuyLink[];
  mediaUrl?: string | null;
  noveltyScore: number;
  generatedAt: string;
  source: 'ai' | 'scrape' | 'hybrid';
  retailLookupConfidence?: number | null;
};

export type ProductHistoryEntry = {
  productId: string;
  viewedAt: string;
  action: 'viewed' | 'liked' | 'disliked' | 'reported';
  tags: string[];
};

export type ProductGenerationRequest = {
  sessionId: string;
  userId: string;
  preferences: {
    likedTags: string[];
    dislikedTags: string[];
    blacklistedItems: string[];
    tagWeights: Record<string, number>;
  };
  searchTerms: string[];
  lastViewed: ProductContent[];
  resultsRequested?: number;
};

export type ProductGenerationResponse = {
  products: ProductContent[];
  debug?: {
    promptTokens?: number;
    completionTokens?: number;
    provider?: string;
  };
};

export type ScrapedProductPayload = {
  url: string;
  title: string;
  summary: string;
  priceText?: string;
  buyLinks: BuyLink[];
  tags: Tag[];
};
