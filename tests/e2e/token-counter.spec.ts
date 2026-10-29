import { expect, test } from '@playwright/test';

/**
 * The token counter counts in the browser and tells nobody what was pasted.
 *
 * The second half is a promise printed on the page ("your text is never sent
 * anywhere"), so it is tested the way the other privacy promises are: by
 * watching what a real browser does. If counting is ever moved to a server,
 * or an analytics call starts carrying the text, this fails on purpose, and the
 * page's wording has to change with it.
 */
const SECRET = 'a-private-sentence-that-must-stay-here-9f3b7c';

test.describe('the token counter', () => {
  test('counts an OpenAI-family model exactly and prices the text', async ({ page }) => {
    await page.goto('/token-counter/');
    await page.getByLabel('Your text').fill('The quick brown fox jumps over the lazy dog. '.repeat(40));
    await expect(page.locator('#tc-method')).toHaveText('Exact');
    await expect(page.locator('#tc-tokens')).toHaveText('401');
    await expect(page.locator('#tc-chars')).toHaveText('1,800');
    await expect(page.locator('#tc-cost')).not.toHaveText('$0');
    // The same text on another family is an estimate, and says so.
    const estimate = page.locator('tbody tr', { hasText: 'Estimate' }).first();
    await expect(estimate).toBeVisible();
  });

  test('follows a change of model', async ({ page }) => {
    await page.goto('/token-counter/');
    await page.getByLabel('Your text').fill('hello world '.repeat(100));
    await expect(page.locator('#tc-method')).toHaveText('Exact');
    await page.getByLabel('Count for this model').selectOption({ index: 0 });
    await expect(page.locator('#tc-tokens')).not.toHaveText('0');
  });

  test('sends the text nowhere, stores nothing and keeps it out of the address', async ({
    page,
    context,
    baseURL,
  }) => {
    const requests: { method: string; url: string; body: string | null }[] = [];
    page.on('request', (request) =>
      requests.push({ method: request.method(), url: request.url(), body: request.postData() }),
    );
    await page.goto('/token-counter/', { waitUntil: 'networkidle' });
    const before = requests.length;
    await page.getByLabel('Your text').fill(`${SECRET} `.repeat(20));
    await expect(page.locator('#tc-tokens')).not.toHaveText('0');
    await page.waitForLoadState('networkidle');

    const after = requests.slice(before);
    for (const request of after) {
      expect(request.method, `${request.url} was not a plain read`).toBe('GET');
      expect(request.url).not.toContain(SECRET);
      expect(request.body ?? '').not.toContain(SECRET);
      // Only this site's own files (the tokenizer chunk), never anywhere else.
      expect(new URL(request.url).host).toBe(new URL(baseURL!).host);
    }
    expect(page.url()).not.toContain(SECRET);
    expect(await context.cookies()).toEqual([]);
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
    expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
  });

  test('is complete without JavaScript: the explanation and every model are on the page', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/token-counter/');
    await expect(page.getByRole('heading', { name: 'What a token is' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Common questions' })).toBeVisible();
    await expect(page.locator('#tc-needs-js')).toBeVisible();
    expect(await page.locator('tbody tr').count()).toBeGreaterThan(50);
    await context.close();
  });
});
