/**
 * Capture the real interface for the promo video.
 *
 * The two earlier repos in this set are command-line tools, so their promos had
 * to draw a terminal in PIL — there was no interface to film. This one has a
 * real interface, and this project's own rule is that a claim on screen must be
 * true of the code. So the video shows the actual product, driven by the same
 * Playwright that already gates the layout, against the same built site.
 *
 * Every frame is deterministic: fixed viewport, animations off, a scenario
 * pinned in the URL, and real numbers from the committed catalog. Nothing here
 * is a mockup, so nothing here can drift away from what the site does.
 *
 *   npm run build          (with BASE_PATH=/)
 *   npx vite preview --port 4173 --strictPort --host 127.0.0.1
 *   npx tsx tools/capture-ui.ts
 */
import { chromium, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'assets/promo-frames');
const BASE = process.env.CAPTURE_BASE ?? 'http://127.0.0.1:4173';

/**
 * A support assistant at real scale, chosen so the spread is the story: four
 * models people genuinely choose between, across four providers, with a ~40x
 * gap between the cheapest and dearest output rate.
 */
const SCENARIO = new URLSearchParams({
  m: 'claude-opus-5,gpt-5,gemini-gemini-3.6-flash,deepseek-deepseek-v3.2',
  sys: '1200',
  usr: '180',
  out: '350',
  t: '6',
  cpd: '4000',
  mau: '25000',
  rev: '12',
});

async function shot(page: Page, name: string, full = false): Promise<void> {
  await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: full });
  console.log(`  ${name}${full ? ' (full page)' : ''}`);
}

/**
 * Capture one element by selector.
 *
 * By selector rather than by pixel rectangle on purpose: a hard-coded crop
 * silently captures the wrong thing the first time a margin changes, and the
 * video would be wrong in a way nobody notices until it is published. A missing
 * selector is reported instead, which is a failure you can see.
 */
async function element(page: Page, name: string, selector: string, problems: string[]): Promise<void> {
  const target = page.locator(selector).first();
  if ((await target.count()) === 0) {
    problems.push(`no element matched ${selector} (wanted for ${name})`);
    return;
  }
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await target.screenshot({ path: resolve(OUT, `${name}.png`) });
  const box = await target.boundingBox();
  console.log(`  ${name}  ${box ? `${Math.round(box.width)}x${Math.round(box.height)}` : '?'}  ${selector}`);
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    colorScheme: 'dark',
  });

  // Set before any script runs, so the first paint is already the right theme
  // and the welcome banner never appears to be dismissed on camera.
  await context.addInitScript(() => {
    localStorage.setItem('ps.theme', 'dark');
    localStorage.setItem('ps.accent', 'cobalt');
    localStorage.setItem('ps.canvas', 'cool');
    localStorage.setItem('ps.welcomeDismissed', '1');
  });

  const page = await context.newPage();
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(String(e)));

  console.log(`capturing from ${BASE}`);
  await page.goto(`${BASE}/?${SCENARIO}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('main');

  // The ticker is a marquee. Stopping it keeps successive frames identical
  // where they should be, so a cut between two shots does not jump.
  await page.addStyleTag({
    content: '*,*::before,*::after{animation-play-state:paused!important;transition:none!important}',
  });
  await page.waitForTimeout(400);

  console.log('estimate:');
  await shot(page, '01-estimate-top');
  await shot(page, '01-estimate-full', true);
  await element(page, '01-ticker', '.ticker', problems);
  await element(page, '01-cards', '.card-grid', problems);
  await element(page, '01-saving', '.callout', problems);

  for (const view of ['Compare', 'Learn', 'Data & Alerts'] as const) {
    const button = page.getByRole('button', { name: view, exact: true });
    if ((await button.count()) === 0) {
      problems.push(`no nav button named ${view}`);
      continue;
    }
    await button.click();
    await page.waitForTimeout(600);
    const slug = view.split(' ')[0].toLowerCase();
    console.log(`${slug}:`);
    await shot(page, `02-${slug}-top`);
    await shot(page, `02-${slug}-full`, true);

    if (slug === 'compare') {
      await element(page, '02-valuemap', '.value-map', problems);
      await element(page, '02-catalog', 'table.catalog', problems);
    }
    if (slug === 'data') {
      // The panel, not the grid inside it. `.health-grid` has no padding of its
      // own, so its first label sat flush against the crop edge and the rounded
      // corner in the video clipped the P off "PRICES LAST CHANGED".
      await element(page, '02-health', '.panel:has(.health-grid)', problems);
      await element(page, '02-flagged', '.panel:has-text("FLAGGED FOR REVIEW")', problems);
    }
  }

  console.log(`\nwrote frames to ${OUT}`);
  if (problems.length > 0) {
    console.error('\npage problems (a capture is only as honest as a clean run):');
    for (const p of problems) console.error(`  - ${p}`);
  }

  await browser.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
