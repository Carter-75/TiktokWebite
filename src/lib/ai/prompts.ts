import { z } from 'zod';
import { ProductGenerationRequest, ProductGenerationResponse } from '@/types/product';

export const productResponseSchema = z.object({
  product: z.object({
    id: z.string(),
    title: z.string(),
    summary: z.string(),
    whatItIs: z.string(),
    whyUseful: z.string(),
    priceRange: z.object({
      min: z.number().nonnegative(),
      max: z.number().nonnegative(),
      currency: z.string().length(3),
    }),
    pros: z.array(z.string()).min(2),
    cons: z.array(z.string()).min(1),
    tags: z.array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        weight: z.number().optional(),
      })
    ),
    buyLinks: z.array(
      z.object({
        label: z.string(),
        url: z.string().url(),
        priceHint: z.string().optional(),
        trusted: z.boolean().default(false),
      })
    ),
    mediaUrl: z.string().url().optional(),
    noveltyScore: z.number().min(0).max(1),
    generatedAt: z.string(),
    source: z.enum(['ai', 'scrape', 'hybrid']),
  }),
  debug: z
    .object({
      promptTokens: z.number().optional(),
      completionTokens: z.number().optional(),
      provider: z.string().optional(),
    })
    .optional(),
});

export type ProductResponseShape = z.infer<typeof productResponseSchema>;

export const buildProductPrompt = (
  request: ProductGenerationRequest
): { system: string; user: string; schema: z.ZodTypeAny } => {
  const system = `You generate concise shopping spotlights. Return strictly JSON that fits the provided schema. Favor novel but adjacent ideas.`;
  const user = JSON.stringify({
    preferences: request.preferences,
    searchTerms: request.searchTerms,
    lastViewed: request.lastViewed.map((item) => ({
      id: item.id,
      tags: item.tags,
      liked: request.preferences.likedTags.includes(item.id),
    })),
    constraints: {
      tokenLimit: 512,
      dedupeWithinHours: 24,
      maxPriceUSD: 2000,
    },
  });

  return { system, user, schema: productResponseSchema };
};

export const validateProductResponse = (
  payload: unknown
): ProductGenerationResponse => {
  const parsed = productResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`AI payload invalid: ${parsed.error.message}`);
  }
  return parsed.data;
};
