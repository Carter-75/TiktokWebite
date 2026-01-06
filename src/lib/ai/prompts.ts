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
  request: ProductGenerationRequest
): { system: string; user: string; schema: JsonSchema; schemaName: string } => {
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
