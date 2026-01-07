import { NextRequest } from 'next/server';

const parsePositiveInt = (value?: string | null) => {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed === 0) return 0;
  if (parsed <= 0) return null;
  return parsed;
};

const getWindowMs = () => {
  const override = parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS);
  if (override) return override;
  if (process.env.NODE_ENV === 'development') {
    return parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS_DEV) ?? 30_000;
  }
  return 60_000;
};

const getMaxRequests = () => {
  const override = parsePositiveInt(process.env.RATE_LIMIT_MAX);
  if (override) return override;
  if (process.env.NODE_ENV === 'development') {
    return parsePositiveInt(process.env.RATE_LIMIT_MAX_DEV) ?? 250;
  }
  return 45;
};

const buckets = new Map<string, { count: number; reset: number }>();

export class RateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const sanitizeIdentity = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/[^a-z0-9_-]/gi, '').slice(0, 64) || null;
};

const keyFromRequest = (request: NextRequest, namespace: string, identityKey?: string) => {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  const ua = request.headers.get('user-agent') ?? 'unknown';
  const identity = sanitizeIdentity(identityKey) ?? 'shared';
  return `${namespace}:${identity}:${ip}:${ua}`;
};

export const enforceRateLimit = (request: NextRequest, namespace: string, identityKey?: string) => {
  const maxRequests = getMaxRequests();
  const windowMs = getWindowMs();
  if (!maxRequests || maxRequests <= 0) return;
  const key = keyFromRequest(request, namespace, identityKey);
  const now = Date.now();
  const bucket = buckets.get(key) ?? { count: 0, reset: now + windowMs };
  if (now > bucket.reset) {
    bucket.count = 0;
    bucket.reset = now + windowMs;
  }
  bucket.count += 1;
  buckets.set(key, bucket);
  if (bucket.count > maxRequests) {
    const retryAfter = Math.max(1, Math.ceil((bucket.reset - now) / 1000));
    throw new RateLimitError('Too many requests. Please slow down.', retryAfter);
  }
};

export const resetRateLimiters = () => buckets.clear();
