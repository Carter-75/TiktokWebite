import { JSDOM } from 'jsdom';
import { networkLogger } from '@/lib/logger';

const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '169.254.169.254'];

const fetchRobots = async (origin: string): Promise<string> => {
  const url = new URL('/robots.txt', origin);
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      return '';
    }
    return await res.text();
  } catch (error) {
    networkLogger.warn('Failed to read robots.txt', {
      origin,
      error: error instanceof Error ? error.message : String(error),
    });
    return '';
  }
};

const isAllowedByRobots = (robots: string, path: string) => {
  const lines = robots.split('\n');
  let applies = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (/^User-agent:\s*\*/i.test(line)) {
      applies = true;
      continue;
    }
    if (!applies) continue;
    const match = line.match(/^Disallow:\s*(.*)$/i);
    if (match) {
      const rule = match[1].trim();
      if (rule === '') continue;
      if (path.startsWith(rule)) return false;
    }
  }
  return true;
};

export const scrapeProductMetadata = async (inputUrl: string) => {
  const target = new URL(inputUrl);
  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new Error('Only http/https URLs allowed');
  }
  if (BLOCKED_HOSTS.includes(target.hostname)) {
    throw new Error('URL blocked for security');
  }

  const robots = await fetchRobots(target.origin);
  if (robots && !isAllowedByRobots(robots, target.pathname)) {
    throw new Error('Robots.txt disallows scraping this path');
  }

  const res = await fetch(target, { headers: { 'User-Agent': 'ProductDiscoveryBot/1.0' } });
  if (!res.ok) {
    throw new Error('Unable to fetch target');
  }
  const html = await res.text();
  const dom = new JSDOM(html);
  const { document } = dom.window;

  const title =
    document.querySelector('meta[property="og:title"]')?.getAttribute('content') ??
    document.title ??
    'Product';
  const summary =
    document.querySelector('meta[name="description"]')?.getAttribute('content') ??
    document.querySelector('meta[property="og:description"]')?.getAttribute('content') ??
    'No summary available.';
  const priceText = document.querySelector('[itemprop="price"], .price, .product-price')?.textContent?.trim();
  const buyLinks = [
    {
      label: new URL(document.URL).hostname,
      url: target.toString(),
      priceHint: priceText ?? undefined,
      trusted: true,
    },
  ];

  return {
    url: target.toString(),
    title,
    summary,
    priceText,
    buyLinks,
    tags: [],
  } as const;
};
