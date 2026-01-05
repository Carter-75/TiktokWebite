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

test.describe('Guest feed smoke test', () => {
  test('loads feed, interacts with control center, and passes axe audit', async ({ page }) => {
    page.on('console', (msg) => {
      console.log(`[browser:${msg.type()}] ${msg.text()}`);
    });

    await page.route('**/api/generate', async (route) => {
      console.info('[e2e] intercepting /api/generate');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ product: { ...seededProduct, generatedAt: new Date().toISOString() }, cacheHit: false }),
      });
    });

    await page.context().addCookies([
      {
        name: 'pp-e2e',
        value: '1',
        domain: '127.0.0.1',
        path: '/',
        httpOnly: false,
        secure: false,
      },
    ]);

    await page.goto('/');
    const webdriverFlag = await page.evaluate(() => navigator.webdriver);
    console.info('[e2e] navigator.webdriver', webdriverFlag);

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
