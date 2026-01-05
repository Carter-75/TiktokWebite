import { NextRequest } from 'next/server';

const getWindowMs = () => Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const getMaxRequests = () => Number(process.env.RATE_LIMIT_MAX ?? 45);

const buckets = new Map<string, { count: number; reset: number }>();

export class RateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const keyFromRequest = (request: NextRequest, namespace: string) => {
  const ip = request.ip ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const ua = request.headers.get('user-agent') ?? 'unknown';
  return `${namespace}:${ip}:${ua}`;
};

export const enforceRateLimit = (request: NextRequest, namespace: string) => {
  const maxRequests = getMaxRequests();
  const windowMs = getWindowMs();
  if (!maxRequests || maxRequests <= 0) return;
  const key = keyFromRequest(request, namespace);
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
