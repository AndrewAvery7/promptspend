/**
 * Real page-speed check against the live site (SEO register 3.13).
 *
 *   npx tsx scripts/check-pagespeed.ts
 *
 * Asks Google's PageSpeed Insights for a phone-sized lab run of a few
 * representative pages and fails when one misses its budget. It runs after each
 * deploy (the pages it measures are the ones just published) and weekly, from
 * `.github/workflows/pagespeed.yml`. The key arrives in PAGESPEED_API_KEY; without
 * it the check says so and exits 0, the same as the other keyed checks.
 *
 * Lab numbers move a little between runs, so each page gets two tries and only
 * a page that misses twice fails the job.
 */

const SITE = (process.env.SITE_URL ?? 'https://promptspend.com').replace(/\/$/, '');

/** One of each kind of page, including a featured comparison. */
export const PAGES = [
  '/',
  '/models/',
  '/compare/claude-sonnet-5-5-vs-gpt-6-1-sol/',
  '/providers/anthropic/',
  '/about/',
] as const;

export const BUDGET = {
  /** Lighthouse performance score, 0-100, phone profile. */
  performance: 80,
  /** Largest contentful paint, milliseconds: Google's "good" line. */
  lcp: 2500,
  /** Cumulative layout shift: Google's "good" line. */
  cls: 0.1,
} as const;

/**
 * Largest-paint limits that differ from `BUDGET.lcp`, by page.
 *
 * The homepage, 3 s (owner decision 2026-11-24). It is the one page drawn by
 * script. Its tape, header and hero are now written into the HTML and shown
 * before the app's code runs, but they wait for their typefaces so the app's
 * copy cannot be counted as a second, later paint; that left it at 2.4-2.7 s on
 * the phone profile against 0.9 s for the pre-built pages. It was ~5 s before
 * the November 2026 fixes, so 3 s still catches a real regression.
 */
export const LCP_BUDGET_BY_PAGE: Readonly<Record<string, number>> = { '/': 3000 };

export interface Measure {
  performance: number;
  lcp: number;
  cls: number;
}

export function overBudget(measure: Measure, path?: string): string[] {
  const misses: string[] = [];
  const lcpBudget = (path !== undefined ? LCP_BUDGET_BY_PAGE[path] : undefined) ?? BUDGET.lcp;
  if (measure.performance < BUDGET.performance)
    misses.push(`performance ${measure.performance} < ${BUDGET.performance}`);
  if (measure.lcp > lcpBudget) misses.push(`largest paint ${Math.round(measure.lcp)} ms > ${lcpBudget} ms`);
  if (measure.cls > BUDGET.cls) misses.push(`layout shift ${measure.cls.toFixed(3)} > ${BUDGET.cls}`);
  return misses;
}

interface PsiResponse {
  lighthouseResult: {
    categories: { performance: { score: number } };
    audits: Record<string, { numericValue?: number }>;
  };
}

async function measure(path: string, key: string): Promise<Measure> {
  const url = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  url.searchParams.set('url', `${SITE}${path}`);
  url.searchParams.set('strategy', 'mobile');
  url.searchParams.set('category', 'performance');
  url.searchParams.set('key', key);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`PageSpeed refused ${path}: ${response.status} ${await response.text()}`);
  const { lighthouseResult: result } = (await response.json()) as PsiResponse;
  return {
    performance: Math.round(result.categories.performance.score * 100),
    lcp: result.audits['largest-contentful-paint']?.numericValue ?? Number.POSITIVE_INFINITY,
    cls: result.audits['cumulative-layout-shift']?.numericValue ?? Number.POSITIVE_INFINITY,
  };
}

async function main(): Promise<void> {
  const key = process.env.PAGESPEED_API_KEY;
  if (!key) {
    console.log('PAGESPEED_API_KEY is not set; skipping.');
    return;
  }
  let failed = 0;
  for (const path of PAGES) {
    let misses: string[] = [];
    let last: Measure | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      last = await measure(path, key);
      misses = overBudget(last, path);
      if (misses.length === 0) break;
    }
    const line = `${path}: performance ${last!.performance}, largest paint ${Math.round(last!.lcp)} ms, layout shift ${last!.cls.toFixed(3)}`;
    if (misses.length === 0) console.log(`✓ ${line}`);
    else {
      failed++;
      console.log(`::error::${line} — over budget: ${misses.join('; ')}`);
    }
  }
  if (failed > 0) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('check-pagespeed.ts')) {
  main().catch((cause: unknown) => {
    console.error(`::error::${cause instanceof Error ? cause.message : String(cause)}`);
    process.exitCode = 1;
  });
}
