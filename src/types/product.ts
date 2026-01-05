export type Tag = {
  id: string;
  label: string;
  weight?: number;
};

export type BuyLink = {
  label: string;
  url: string;
  priceHint?: string;
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
  mediaUrl?: string;
  noveltyScore: number;
  generatedAt: string;
  source: 'ai' | 'scrape' | 'hybrid';
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
};

export type ProductGenerationResponse = {
  product: ProductContent;
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
