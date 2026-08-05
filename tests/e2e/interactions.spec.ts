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

  // Data & Alerts rather than the landing hero: the hero aside used to carry the
  // MCP install command and now advertises all four surfaces without a command,
  // because every install route lives together on that panel instead.
  await page.getByRole('button', { name: 'Data & Alerts', exact: true }).click();
  await page.locator('.build-grid').waitFor();
  await page.locator('.build-grid .copy-button').first().click();

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
    const measure = (t: Element) => {
      const r = (t as SVGGraphicsElement).getBBox();
      return { name: t.textContent ?? '', x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const all = [...document.querySelectorAll('.value-map svg text')];
    const labels = all.filter((t) => t.getAttribute('font-weight') === '600').map(measure);
    // Everything else that is drawn: axis tick numbers and axis titles. A model
    // name printed over the y-axis "70" is exactly as unreadable as one printed
    // over another model, and the label-versus-label check cannot see it.
    const furniture = all.filter((t) => t.getAttribute('font-weight') !== '600').map(measure);

    const hits = (a: ReturnType<typeof measure>, b: ReturnType<typeof measure>) =>
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

    const clashes: string[] = [];
    for (let i = 0; i < labels.length; i += 1) {
      const a = labels[i]!;
      if (!Number.isFinite(a.x) || !Number.isFinite(a.w)) {
        clashes.push(`${a.name} could not be measured`);
        continue;
      }
      for (let j = i + 1; j < labels.length; j += 1) {
        if (hits(a, labels[j]!)) clashes.push(`${a.name} over ${labels[j]!.name}`);
      }
      for (const f of furniture) {
        if (f.name.trim() && hits(a, f)) clashes.push(`${a.name} over axis text "${f.name}"`);
      }
    }
    return clashes;
  });

  expect(overlaps, `overlapping labels: ${overlaps.join(', ')}`).toEqual([]);
});

/**
 * The chart's caption tells the reader to hover or tab a dot for its details,
 * so both routes have to actually show them.
 *
 * Focus was setting the hover state to (0, 0) while the tooltip renders only
 * when `x > 0`, so tabbing a dot displayed nothing at all. The aria-label
 * carried the same information, which is why it survived an axe pass and a
 * manual read: a screen reader was never affected, only a sighted person using
 * a keyboard.
 */
test('a dot shows its details on hover and on keyboard focus', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  const dot = page.locator('.value-map svg g[tabindex="0"]').first();
  await expect(dot).toBeAttached();
  const tip = page.locator('.chart-tooltip');

  // Explicit coordinates rather than `hover()`. The dot is an svg <g> whose
  // only painted children are transparent circles, and Playwright's
  // actionability wait never settles on it.
  await dot.scrollIntoViewIfNeeded();
  const box = (await dot.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(tip).toBeVisible();
  const hovered = await tip.innerText();
  expect(hovered.length).toBeGreaterThan(0);

  await page.mouse.move(1, 1);
  await expect(tip).toBeHidden();

  await dot.focus();
  await expect(tip, 'focusing a dot must show its details, as hovering does').toBeVisible();

  // Not compared against the hovered text: the 22px transparent hit areas
  // overlap, so the pixel under the cursor is often a different model from the
  // one `.first()` focuses. What matters is that focus names the dot it landed
  // on, so the tooltip is checked against that dot's own accessible name.
  const name = ((await dot.getAttribute('aria-label')) ?? '').split(',')[0]!;
  expect(await tip.innerText()).toContain(name);
});

/**
 * The shortlist on Compare must agree with the cost cards on Estimate.
 *
 * Compare used to let you assemble a selection and then show you none of its
 * money, so the panel exists to answer "what do these cost" without changing
 * page. It reads the same `estimator.rows` the cards do, and that is the point
 * — two different numbers for the same model on two tabs of one site is the
 * failure this whole project argues against, and it would look like a pricing
 * error rather than a plumbing one.
 */
test('the Compare shortlist and the Estimate cards report the same monthly cost', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  const items = page.locator('.shortlist li');
  await expect(items.first()).toBeVisible();
  const shortlist = await items.evaluateAll((nodes) =>
    nodes.map((n) => ({
      name: n.querySelector('.shortlist__name')?.textContent?.replace('CHEAPEST', '').trim() ?? '',
      cost: n.querySelector('.shortlist__cost')?.textContent?.trim() ?? '',
    })),
  );
  expect(shortlist.length, 'the default selection should populate the shortlist').toBeGreaterThan(1);

  await page.getByRole('button', { name: 'Estimate', exact: true }).click();
  await expect(page.locator('.cost-card__total').first()).toBeVisible();
  const cards = await page.locator('.card-grid > *').evaluateAll((nodes) =>
    nodes.map((n) => ({
      name: n.querySelector('.cost-card__name')?.textContent?.trim() ?? '',
      total: n.querySelector('.cost-card__total')?.textContent?.trim() ?? '',
    })),
  );

  for (const row of shortlist) {
    const card = cards.find((c) => c.name === row.name);
    expect(card, `${row.name} is on Compare but not on Estimate`).toBeTruthy();
    // The card prints "$723/mo" with the unit in a child; compare the figure.
    const figure = row.cost.replace('/mo', '').trim();
    expect(card!.total.replace(/\s+/g, ''), `${row.name} disagrees between the two pages`).toContain(figure);
  }
});

/**
 * The shortlist has to be on screen while the chart is being used.
 *
 * It was added to the hero, above the chart, which meant clicking a dot changed
 * a panel that had already scrolled out of the window: the reader made a choice
 * and saw no consequence, which is the exact failure the panel was added to
 * fix. The two now share a row and the panel is sticky.
 *
 * Asserted at the moment it matters — scrolled to the bottom of the plot, where
 * the cheap models are and where the panel had furthest to fall.
 */
test('the shortlist stays on screen, and updates, while the chart is in use', async ({ page, viewport }) => {
  // Only where the two-column layout applies. Under 1080px the panel is meant
  // to stack below the chart, and asserting otherwise would be asserting the
  // opposite of the design at three of the four viewports.
  test.skip((viewport?.width ?? 0) < 1080, 'single column below 1080px, by design');
  await page.goto('/');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();

  const side = page.locator('.compare-layout__side');
  const map = page.locator('.value-map');
  await expect(side).toBeVisible();

  // Side by side, not stacked, at this width.
  const sideBox = (await side.boundingBox())!;
  const mapBox = (await map.boundingBox())!;
  expect(sideBox.x, 'the shortlist should sit beside the chart').toBeGreaterThanOrEqual(
    mapBox.x + mapBox.width - 2,
  );

  // Scroll to the bottom of the plot and confirm the panel came along.
  await map.evaluate((el) => {
    window.scrollTo({ top: el.getBoundingClientRect().bottom + window.scrollY - window.innerHeight + 40 });
  });
  await expect(side, 'the shortlist must stay visible while the chart is').toBeInViewport();

  // Toggling a dot from down here must change the list, in view.
  const before = await page.locator('.shortlist li').count();
  await page.locator('.value-map svg g[aria-label*="In your estimate"]').first().click();
  await expect(page.locator('.shortlist li')).toHaveCount(before - 1);
  await expect(side).toBeInViewport();
});
