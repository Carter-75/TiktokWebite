import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const seededProduct = {
  id: 'seed-product',
  title: 'Seeded Neon Diffuser',
  summary: 'A deterministic fallback product for automated smoke testing.',
  whatItIs: 'A tabletop diffuser that projects neon gradients synced to your phone.',
  whyUseful: 'Provides a calm ambient glow while keeping scent throw adjustable.',
  priceRange: { min: 89, max: 129, currency: 'USD' },
  pros: ['Ships with reusable pods', 'Pairs with any smart home'],
  cons: ['Pods sold separately'],
  tags: [
    { id: 'decor', label: 'Decor' },
    { id: 'wellness', label: 'Wellness' },
  ],
  buyLinks: [
    {
      label: 'Pulse Shop',
      url: 'https://example.com/pulse',
      trusted: true,
      priceHint: '$99 kit',
    },
  ],
  noveltyScore: 0.42,
  generatedAt: new Date().toISOString(),
  source: 'hybrid',
};

const waitForProductCard = async (page) => {
  await page.getByTestId('product-card').waitFor({ state: 'visible', timeout: 25000 });
};

const primeLocalState = async (page) => {
  await page.addInitScript(({ seeded }) => {
    const hydratedAt = new Date().toISOString();
    window.localStorage.setItem(
      'preload_queue',
      JSON.stringify({
        queue: [{ ...seeded, generatedAt: hydratedAt }],
        hydratedAt,
      })
    );
  }, { seeded: seededProduct });
};

test.describe('Guest feed smoke test', () => {
  test('loads feed, interacts with control center, and passes axe audit', async ({ page }) => {
    page.on('console', (msg) => {
      console.log(`[browser:${msg.type()}] ${msg.text()}`);
    });

    await page.route('**/auth/me', async (route) => {
      console.info('[e2e] intercepting /auth/me');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ session: { sessionId: 'automation-session', userId: 'guest-automation', mode: 'guest' } }),
      });
    });

    await page.route('**/api/generate', async (route) => {
      console.info('[e2e] intercepting /api/generate', route.request().method());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ product: { ...seededProduct, generatedAt: new Date().toISOString() }, cacheHit: false }),
      });
    });

    await primeLocalState(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const queueSnapshot = await page.evaluate(() => window.localStorage.getItem('preload_queue'));
    console.info('[e2e] preload queue snapshot', queueSnapshot);
    const debugState = await page.evaluate(() => ({
      hasProductCard: Boolean(document.querySelector('[data-testid="product-card"]')),
      loaderVisible: Boolean(document.querySelector('.skeleton')),
      authBadgeVisible: Boolean(document.querySelector('[data-testid="auth-badge"]')),
    }));
    console.info('[e2e] debug state', debugState);
    const html = await page.content();
    console.info('[e2e] html snippet', html.slice(0, 500));

    await expect(page.getByRole('heading', { name: 'Product Pulse' })).toBeVisible();

    await waitForProductCard(page);

    await expect(page.getByRole('button', { name: /Controls/i })).toBeVisible();
    await page.getByRole('button', { name: /Controls/i }).click();
    await expect(page.getByRole('heading', { name: 'Control Center' })).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.getByRole('button', { name: /Like/i })).toBeVisible();
    await page.getByRole('button', { name: /Next/i }).click();
    await waitForProductCard(page);

    const axeResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .analyze();
    expect(axeResults.violations, JSON.stringify(axeResults.violations, null, 2)).toEqual([]);
  });
});
