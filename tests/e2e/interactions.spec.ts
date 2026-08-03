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

/**
 * The copy button actually puts the command on the clipboard.
 *
 * `navigator.clipboard.writeText` needs a secure context AND transient user
 * activation, so this cannot be checked by calling `.click()` from a console:
 * a synthetic click has no activation and the write is refused. Only a trusted
 * event proves the thing works, which is exactly what Playwright produces.
 *
 * Worth a test rather than a look because the failure is quiet — the button
 * still depresses, and a user pastes whatever was on the clipboard before.
 */
test('the install command copy button writes to the clipboard', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are chromium-specific here');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');

  await page.locator('.hero__aside .copy-button').click();

  await expect(page.locator('.toast')).toContainText('Install command copied');
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe('claude mcp add promptspend -- npx -y @promptspend/mcp');
});

/**
 * No two labels on the value map may overlap.
 *
 * They did: the frontier models sit within a few capability points and a couple
 * of dollars of each other, and every label was drawn 15px above its dot with
 * no regard for what was already there, so four names printed through one
 * another. Placement now tries four positions and drops a label that fits
 * nowhere.
 *
 * Measured with `getBBox`, not estimated, because the placement code estimates
 * — if that estimate drifts from what the font actually does, this is the thing
 * that notices. It regresses quietly the next time a model lands near a crowded
 * corner, which is why it is a test rather than a look.
 */
test('the value map never prints one model label through another', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  // Wait for the labels themselves, not just the frame around them. An earlier
  // version of this test asserted the svg was visible and then measured before
  // the catalog had loaded: it found zero labels, zero pairs, and passed while
  // the built site had four clashes. The count assertion is what stops a green
  // result meaning nothing was looked at.
  const labels = page.locator('.value-map svg text[font-weight="600"]');
  await expect(labels.first()).toBeVisible();
  expect(await labels.count(), 'no labels were drawn, so nothing was checked').toBeGreaterThan(4);

  const overlaps = await page.evaluate(() => {
    // Read the rect properties explicitly. `SVGRect` exposes x/y/width/height as
    // prototype accessors, not own enumerable properties, so spreading getBBox()
    // copies nothing and every comparison silently comes out false. That is how
    // the first version of this test passed against a chart with four visible
    // collisions on screen.
    const boxes = [...document.querySelectorAll('.value-map svg text')]
      .filter((t) => t.getAttribute('font-weight') === '600')
      .map((t) => {
        const r = (t as SVGGraphicsElement).getBBox();
        return { name: t.textContent ?? '', x: r.x, y: r.y, w: r.width, h: r.height };
      });
    const clashes: string[] = [];
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        if (!Number.isFinite(a.x) || !Number.isFinite(b.x)) {
          clashes.push('a label could not be measured');
          continue;
        }
        if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
          clashes.push(a.name + ' over ' + b.name);
        }
      }
    }
    return clashes;
  });

  expect(overlaps, `overlapping labels: ${overlaps.join(', ')}`).toEqual([]);
});
