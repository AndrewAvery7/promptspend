/**
 * The kind of page a visit landed on, sent to Google Analytics as `page_type`
 * with the configuration and every page view, so reports can group the site's
 * ~300 addresses into the handful of page kinds that matter ("comparison
 * page", "model page").
 *
 * A small closed list, never free text: the value is one of the labels below,
 * chosen by PromptSpend's own build, and says nothing about the visitor.
 *
 * Every page declares its own type in `<meta name="ps:page-type">`: the
 * generated pages through `layout()` in `src/lib/seo/render.ts` (which refuses
 * a page without one), the calculator and the Receipt page in their HTML
 * files. `npm run check:seo` reads every page in the built site and fails if
 * one has no type, an unknown type, or a type its address does not match
 * (`pageTypeForPath`, which only the build and the tests use, so it stays out
 * of the browser code). A page that somehow declares none is sent as `other`.
 *
 * This module has no imports, because the build scripts read it too.
 */
export const PAGE_TYPES = [
  /** The calculator, `/`. */
  'home',
  /** The Receipt page, `/receipt/`. */
  'receipt',
  /** One model, `/models/<slug>/`. */
  'model',
  /** One provider, `/providers/<id>/`. */
  'provider',
  /** One pair, `/compare/<a>-vs-<b>/`, including retired pairs' signposts. */
  'comparison',
  /** One provider's free tier, `/providers/<id>/free/`. */
  'free-tier',
  /** One article, `/writing/<slug>/`. */
  'article',
  /** A list of other pages: models, providers, comparisons, free tiers, writing. */
  'hub',
  /** The open-data page, `/data/`. */
  'data',
  /** The price-changes page, `/changes/`. */
  'changes',
  /** The token counter, `/token-counter/`. */
  'token-counter',
  /** The apps page, `/app/`. */
  'app',
  'about',
  'corrections',
  'privacy',
  'support',
  'topics',
  /** The page served for an address that does not exist. */
  'not-found',
  /** Only ever the fallback for an address none of the above matches. No generated page uses it. */
  'other',
] as const;

export type PageType = (typeof PAGE_TYPES)[number];

/** The `<meta name>` every page declares its type in. */
export const PAGE_TYPE_META = 'ps:page-type';

export function isPageType(value: unknown): value is PageType {
  return typeof value === 'string' && (PAGE_TYPES as readonly string[]).includes(value);
}

/** The pages whose type is their own top-level folder's name. */
const SINGLE_PAGES: Readonly<Record<string, PageType>> = {
  receipt: 'receipt',
  data: 'data',
  changes: 'changes',
  'token-counter': 'token-counter',
  app: 'app',
  about: 'about',
  corrections: 'corrections',
  privacy: 'privacy',
  support: 'support',
  topics: 'topics',
};

/** The folders that hold one page per item, with a list page at their root. */
const COLLECTIONS: Readonly<Record<string, PageType>> = {
  models: 'model',
  providers: 'provider',
  compare: 'comparison',
  'free-tiers': 'free-tier',
  writing: 'article',
};

/**
 * The type a path stands for, from the address alone. `basePath` is the site's
 * base (`/`, or `/promptspend/` on the project-pages build).
 */
export function pageTypeForPath(pathname: string, basePath = '/'): PageType {
  const base = basePath.endsWith('/') ? basePath : `${basePath}/`;
  let rest = pathname.startsWith(base) ? pathname.slice(base.length) : pathname.replace(/^\//, '');
  rest = rest.replace(/index\.html$/, '');
  if (rest === '') return 'home';
  if (rest === '404.html') return 'not-found';
  const parts = rest.split('/').filter(Boolean);
  if (parts.length === 1) {
    const single = SINGLE_PAGES[parts[0]!];
    if (single) return single;
    if (COLLECTIONS[parts[0]!]) return 'hub';
  }
  if (parts.length === 2 && COLLECTIONS[parts[0]!]) return COLLECTIONS[parts[0]!]!;
  if (parts.length === 3 && parts[0] === 'providers' && parts[2] === 'free') return 'free-tier';
  return 'other';
}

/**
 * This page's type: the one it declares, or `other` if it declares none.
 * Anything not on the list is never passed on.
 */
export function pageTypeOf(doc: Pick<Document, 'querySelector'>): PageType {
  const declared = doc.querySelector(`meta[name="${PAGE_TYPE_META}"]`)?.getAttribute('content');
  return isPageType(declared) ? declared : 'other';
}
