import { expect, test } from '@playwright/test';
import { horizontalOverflow, report, smallTouchTargets, tinyText } from './lib/audit';

test.describe('PromptSpend Receipt', () => {
  test('is a real route with current pricing evidence and visible instructions', async ({ page }) => {
    const response = await page.goto('/receipt/');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your prompt has a price tag.');
    await expect(page.getByRole('status').filter({ hasText: 'Pricing source ready' })).toBeVisible();
    await expect(page.locator('.receipt-instructions')).toContainText('PROMPTSPEND RECEIPT · v1.0.0');
    await expect(page.locator('.receipt-instructions')).toContainText('Current pricing unavailable');
    await expect(page.getByRole('link', { name: 'Machine-readable specification' })).toHaveAttribute(
      'href',
      'https://promptspend.com/receipt/spec.json',
    );
  });

  test('copies exactly the visible Receipt object', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions are chromium-specific here');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/receipt/');
    await page.getByRole('button', { name: 'COPY THE PROMPTSPEND RECEIPT' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Copied. Paste it' })).toBeVisible();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    const visible = await page.locator('.receipt-instructions').textContent();
    expect(clipboard.replaceAll('\r\n', '\n')).toBe(visible?.replaceAll('\r\n', '\n'));
  });

  test('keeps the copy workflow available when pricing evidence cannot load', async ({ page }) => {
    await page.route('**/data/pricing.json', (route) => route.abort());
    await page.goto('/receipt/');

    await expect(page.getByRole('alert')).toContainText('Price source unavailable here');
    await expect(page.getByRole('alert')).toContainText('must not quote a dollar cost');
    await expect(page.getByRole('button', { name: 'COPY THE PROMPTSPEND RECEIPT' })).toBeEnabled();
  });

  test('fits, remains readable and keeps touch targets usable', async ({ page, isMobile }) => {
    await page.goto('/receipt/');
    await expect(page.locator('main')).toBeVisible();
    await page.waitForLoadState('networkidle');

    const overflow = await horizontalOverflow(page);
    expect(overflow, report('elements push the Receipt sideways', overflow)).toEqual([]);

    const smallText = await tinyText(page);
    expect(smallText, report('pieces of Receipt text are under 12px', smallText)).toEqual([]);

    if (isMobile) {
      const smallTargets = await smallTouchTargets(page);
      expect(smallTargets, report('Receipt tap targets are under 44px', smallTargets)).toEqual([]);
    }
  });

  test('publishes the exact machine-readable and plain-text contracts', async ({ request }) => {
    const [specResponse, textResponse] = await Promise.all([
      request.get('/receipt/spec.json'),
      request.get('/receipt/instructions.txt'),
    ]);
    expect(specResponse.status()).toBe(200);
    expect(textResponse.status()).toBe(200);

    const spec = (await specResponse.json()) as { version: string; instructions: string };
    const instructions = (await textResponse.text()).trimEnd();
    expect(spec.version).toBe('1.0.0');
    expect(spec.instructions).toBe(instructions);
  });
});
