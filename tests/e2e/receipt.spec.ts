import { expect, test } from '@playwright/test';
import { horizontalOverflow, report, smallTouchTargets, tinyText } from './lib/audit';

test.describe('PromptSpend Receipt', () => {
  test('is a real route with current pricing evidence and visible instructions', async ({ page }) => {
    const response = await page.goto('/receipt/');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your prompt has a price tag.');
    await expect(page.getByRole('status').filter({ hasText: 'Pricing source ready' })).toBeVisible();
    await expect(page.locator('.receipt-instructions')).toContainText('PROMPTSPEND RECEIPT · v1.1.1');
    await expect(page.locator('.receipt-instructions')).toContainText('Current pricing unavailable');
    await expect(page.locator('.receipt-instructions')).toContainText(
      'Do not count this receipt message or the response it triggers',
    );
    await expect(page.locator('.receipt-instructions')).toContainText(
      'Do not enumerate, estimate, or include internal model calls',
    );
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
    expect(spec.version).toBe('1.1.1');
    expect(spec.instructions).toBe(instructions);
    expect(instructions).toContain('Never count this receipt message');
    expect(instructions).toContain('function schemas');
  });

  test('imports the assistant share block and keeps estimates explicit', async ({ page }) => {
    await page.goto('/receipt/');
    await page.getByLabel('Assistant receipt JSON').fill(
      JSON.stringify({
        conversation: '47 visible turns',
        estimatedTokens: '120,000–136,000 estimated',
        currentModel: 'Example Model',
        estimatedCost: '$1.62–$1.88 estimated',
        alternativeModel: 'Example Mini — test quality first',
        alternativeCost: '$0.18–$0.22 estimated',
        priceDifference: '8.5×–9×',
        note: 'Estimate, not invoice. Quality equivalence is not assumed.',
      }),
    );
    await page.getByRole('button', { name: 'Import assistant result' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Receipt imported' })).toBeVisible();
    await expect(page.getByLabel('Shareable PromptSpend receipt preview')).toContainText('8.5×–9×');
    await expect(page.getByLabel('Shareable PromptSpend receipt preview')).toContainText(
      'Quality equivalence',
    );
  });

  test('reports invalid share data without replacing the safe preview', async ({ page }) => {
    await page.goto('/receipt/');
    await page.getByLabel('Assistant receipt JSON').fill('{"conversation":"one"}');
    await page.getByRole('button', { name: 'Import assistant result' }).click();
    await expect(page.getByRole('alert')).toContainText('missing receipt fields');
    await expect(page.getByLabel('Shareable PromptSpend receipt preview')).toContainText('Not established');
  });

  test('exports a real PNG receipt without uploading its fields', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto('/receipt/');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PNG' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^promptspend-ai-receipt-\d{4}-\d{2}-\d{2}\.png$/);
    expect(requests.filter((url) => !url.startsWith('http://127.0.0.1:4173'))).toEqual([]);
  });
});
