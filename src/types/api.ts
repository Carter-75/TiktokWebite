import { ProductGenerationRequest, ProductGenerationResponse } from '@/types/product';

export type GenerateApiRequest = ProductGenerationRequest & {
  forceNovelty?: boolean;
  preferStaticDataset?: boolean;
};

export type GenerateApiResponse = ProductGenerationResponse & {
  cacheHit: boolean;
};

export type ScrapeApiRequest = {
  url: string;
};

export type ScrapeApiResponse = {
  ok: boolean;
  payload?: {
    title: string;
    summary: string;
    priceText?: string;
    tags: string[];
  };
  error?: string;
};

export type AuthMeResponse = {
  session: {
    mode: 'guest' | 'google';
    userId: string;
    sessionId: string;
    email?: string;
    name?: string;
  };
};
