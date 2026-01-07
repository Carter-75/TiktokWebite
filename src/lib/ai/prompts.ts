import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ProductGenerationRequest, ProductGenerationResponse } from '@/types/product';

type JsonSchema = Record<string, unknown>;

type JsonSchemaWithDefs = JsonSchema & {
  definitions?: Record<string, unknown>;
  $defs?: Record<string, unknown>;
};

const resolveSchemaDefinition = (schema: JsonSchema, schemaName: string): JsonSchema => {
  const typed = schema as JsonSchemaWithDefs;
  const candidate = typed.definitions?.[schemaName] ?? typed.$defs?.[schemaName];
  if (candidate && typeof candidate === 'object') {
    return candidate as JsonSchema;
  }
  return schema;
};

const enforceRequiredProperties = (schema: JsonSchema): JsonSchema => {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  const normalized: JsonSchema = { ...schema };

  const normalizeChild = (child: unknown): unknown => {
    if (Array.isArray(child)) {
      return child.map((entry) => enforceRequiredProperties(entry as JsonSchema));
    }
    if (child && typeof child === 'object') {
      return enforceRequiredProperties(child as JsonSchema);
    }
    return child;
  };

  if ('properties' in normalized && normalized.properties && typeof normalized.properties === 'object') {
    const props = normalized.properties as Record<string, unknown>;
    const enriched: Record<string, unknown> = {};
    Object.entries(props).forEach(([key, value]) => {
      enriched[key] = normalizeChild(value);
    });
    normalized.properties = enriched;
    normalized.required = Object.keys(enriched);
  }

  if ('items' in normalized && normalized.items) {
    normalized.items = normalizeChild(normalized.items);
  }

  ['anyOf', 'allOf', 'oneOf'].forEach((key) => {
    const bucket = (normalized as Record<string, unknown>)[key];
    if (Array.isArray(bucket)) {
      (normalized as Record<string, unknown>)[key] = bucket.map((entry) => normalizeChild(entry));
    }
  });

  return normalized;
};

const SUPPORTED_STRING_FORMATS = new Set(['date-time', 'time', 'email', 'uuid', 'ipv4', 'ipv6']);

const stripUnsupportedFormats = (schema: JsonSchema): JsonSchema => {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  const normalized: JsonSchema = { ...schema };
  const sanitizeChild = (child: unknown): unknown => {
    if (Array.isArray(child)) {
      return child.map((entry) => stripUnsupportedFormats(entry as JsonSchema));
    }
    if (child && typeof child === 'object') {
      return stripUnsupportedFormats(child as JsonSchema);
    }
    return child;
  };

  if ('format' in normalized) {
    const value = (normalized as { format?: unknown }).format;
    if (typeof value === 'string' && !SUPPORTED_STRING_FORMATS.has(value)) {
      delete (normalized as { format?: unknown }).format;
    }
  }

  if ('properties' in normalized && normalized.properties && typeof normalized.properties === 'object') {
    const props = normalized.properties as Record<string, unknown>;
    const enriched: Record<string, unknown> = {};
    Object.entries(props).forEach(([key, value]) => {
      enriched[key] = sanitizeChild(value);
    });
    normalized.properties = enriched;
  }

  if ('items' in normalized && normalized.items) {
    normalized.items = sanitizeChild(normalized.items);
  }

  ['anyOf', 'allOf', 'oneOf'].forEach((key) => {
    const bucket = (normalized as Record<string, unknown>)[key];
    if (Array.isArray(bucket)) {
      (normalized as Record<string, unknown>)[key] = bucket.map((entry) => sanitizeChild(entry));
    }
  });

  return normalized;
};

const jsonSchemaConverter = zodToJsonSchema as unknown as (
  schema: z.ZodTypeAny,
  name?: string
) => JsonSchema;

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
      weight: z.number().nullable().optional(),
    })
  ),
  buyLinks: z.array(
    z.object({
      label: z.string(),
      url: z.string().url(),
      priceHint: z.string().nullable().optional(),
      trusted: z.boolean().default(false),
    })
  ),
  mediaUrl: z.string().url().nullable().optional(),
  noveltyScore: z.number().min(0).max(1),
  generatedAt: z.string(),
  source: z.enum(['ai', 'scrape', 'hybrid']),
  retailLookupConfidence: z.number().min(0).max(1).nullable().optional(),
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

const PRODUCT_RESPONSE_SCHEMA_NAME = 'ProductSpotlightResponse';
const productResponseJsonSchema = jsonSchemaConverter(
  productResponseSchema as z.ZodTypeAny,
  PRODUCT_RESPONSE_SCHEMA_NAME
);

export type ProductResponseShape = z.infer<typeof productResponseSchema>;

export const buildProductPrompt = (
  request: ProductGenerationRequest,
  amazonProducts?: Array<{title: string; url: string; price?: string; asin?: string}>
): { system: string; user: string; schema: JsonSchema; schemaName: string } => {
  const desired = Math.min(4, Math.max(2, request.resultsRequested ?? 2));
  
  // If we have real Amazon products, use description mode
  if (amazonProducts && amazonProducts.length > 0) {
    const system = `You are a product reviewer that creates detailed descriptions for REAL Amazon products. Always return strictly valid JSON that matches the provided schema.
- You will be given actual Amazon products with real URLs and prices.
- Your job is to describe these products with compelling summaries, pros/cons, and details.
- DO NOT make up new products - ONLY describe the products provided to you.
- Keep the exact Amazon URL provided - do not modify it.
- Include a direct HTTPS mediaUrl for every product (use Unsplash or real Amazon product image URLs).
- Keep copy under 320 characters per field.
- Set retailLookupConfidence to 0.95 since these are real Amazon products.
- Create engaging descriptions that highlight why someone would want to buy each product.`;

    const user = JSON.stringify({
      amazonProducts: amazonProducts.map(p => ({
        title: p.title,
        amazonUrl: p.url,
        price: p.price,
        asin: p.asin,
      })),
      preferences: request.preferences,
      constraints: {
        tokenLimit: 768,
        resultsRequested: Math.min(desired, amazonProducts.length),
      },
    });

    const normalizedSchema = stripUnsupportedFormats(
      enforceRequiredProperties(resolveSchemaDefinition(productResponseJsonSchema, PRODUCT_RESPONSE_SCHEMA_NAME))
    );

    return {
      system,
      user,
      schema: normalizedSchema,
      schemaName: PRODUCT_RESPONSE_SCHEMA_NAME,
    };
  }
  
  // Fallback to original generation mode (should rarely be used)
  const system = `You generate concise shopping spotlights for REAL products available for purchase today. Always return strictly valid JSON that matches the provided schema.
- Produce exactly ${desired} distinct products per response.
- Each product MUST be a real item that exists and can be purchased right now on Amazon.
- For buyLinks, provide ACTUAL working Amazon URLs (e.g., https://www.amazon.com/dp/PRODUCTID or https://www.amazon.com/product-name/dp/PRODUCTID).
- DO NOT use example.com, placeholder URLs, or non-Amazon retailers.
- Focus on popular, well-reviewed products that are actually in stock on Amazon.
- Include a direct HTTPS mediaUrl for every product (use Unsplash or real product image URLs).
- Avoid duplicate titles or URLs across the products.
- Keep copy under 320 characters per field.
- Set retailLookupConfidence to 0.85-0.95 for mainstream Amazon products.
- Focus on trending, popular, or innovative products that users would actually want to buy from Amazon.`;
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

  const normalizedSchema = stripUnsupportedFormats(
    enforceRequiredProperties(resolveSchemaDefinition(productResponseJsonSchema, PRODUCT_RESPONSE_SCHEMA_NAME))
  );

  return {
    system,
    user,
    schema: normalizedSchema,
    schemaName: PRODUCT_RESPONSE_SCHEMA_NAME,
  };
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
