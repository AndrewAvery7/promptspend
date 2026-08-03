import { expect, test } from '@playwright/test';

/**
 * The handful of interactions whose failure mode is layout rather than logic.
 *
 * Deliberately small. Everything that can be proved in jsdom already is, and
 * duplicating it here would buy nothing but a slower, flakier suite. What
 * belongs here is what needs a real layout engine: a popover that has to be on
 * screen, a control that has to be reachable under a thumb.
 */

test('the CHECK popover opens fully on screen, at any width', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.locator('table.catalog')).toBeVisible();

  const badge = page.getByRole('button', { name: 'Why this price is flagged' }).first();
  const count = await page.getByRole('button', { name: 'Why this price is flagged' }).count();
  test.skip(count === 0, 'no flagged rows in this catalog');

  await badge.click();
  const note = page.getByRole('note');
  await expect(note).toBeVisible();

  // It used to be clipped by the scrolling model picker, and positioning it
  // against a trigger scrolled out of view put it off-screen entirely.
  const fits = await note.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      top: r.top >= -0.5,
      bottom: r.bottom <= window.innerHeight + 0.5,
      left: r.left >= -0.5,
      right: r.right <= window.innerWidth + 0.5,
    };
  });
  expect(fits, 'the note must be fully within the viewport').toEqual({
    top: true,
    bottom: true,
    left: true,
    right: true,
  });
});

test('Clear all empties the selection and leaves the workload alone', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();
  await page.waitForLoadState('networkidle');

  const turns = page.getByLabel(/turns/i).first();
  const before = (await turns.count()) > 0 ? await turns.inputValue() : null;

  await expect(page.getByRole('button', { name: 'Clear all' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear all' }).click();

  // The count goes to zero and the button retires, having nothing left to do.
  await expect(page.locator('.selection-count')).toContainText('0 of 4');
  await expect(page.getByRole('button', { name: 'Clear all' })).toHaveCount(0);

  // Changing which models you compare is not starting over: the scenario stays.
  if (before !== null) expect(await turns.inputValue()).toBe(before);
});

test('the ticker leaves room under itself at every width', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.ticker')).toBeVisible();

  const gap = await page.evaluate(() => {
    const ticker = document.querySelector('.ticker')?.getBoundingClientRect();
    const logo = document.querySelector('.logo')?.getBoundingClientRect();
    return ticker && logo ? Math.round(logo.top - ticker.bottom) : null;
  });

  // Raised three times before it took, because two media queries reset the
  // padding and only the base rule was being edited.
  expect(gap, 'the header must not sit flush against the ticker').not.toBeNull();
  expect(gap!).toBeGreaterThanOrEqual(8);
});
