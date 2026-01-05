import { z } from 'zod';
import { ProductGenerationRequest, ProductGenerationResponse } from '@/types/product';

const productSchema = z.object({
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
  retailLookupConfidence: z.number().min(0).max(1).optional(),
});

export const productResponseSchema = z.object({
  products: z.array(productSchema).min(2).max(4),
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
  const desired = Math.min(4, Math.max(2, request.resultsRequested ?? 2));
  const system = `You generate concise shopping spotlights. Always return strictly valid JSON that matches the provided schema.
- Produce exactly ${desired} distinct products per response.
- Each product must reference a real item that can be purchased today.
- Include a direct HTTPS mediaUrl for every product (brand press kit or royalty-free photo that visually matches the item).
- Avoid duplicate titles or URLs across the products.
- Keep copy under 320 characters per field.
- Estimate how likely each product can be found at mainstream retailers using retailLookupConfidence (0 = obscure prototype, 1 = widely stocked). Favor confident matches when unsure.`;
  const user = JSON.stringify({
    preferences: request.preferences,
    searchTerms: request.searchTerms,
    lastViewed: request.lastViewed.map((item) => ({
      id: item.id,
      tags: item.tags,
      liked: request.preferences.likedTags.includes(item.id),
    })),
    constraints: {
      tokenLimit: 768,
      dedupeWithinHours: 24,
      maxPriceUSD: 2000,
      resultsRequested: desired,
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
