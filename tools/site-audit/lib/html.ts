/**
 * Reading what the audit needs out of one HTML page, without a DOM.
 *
 * Regular expressions over markup are a known compromise. They are used here
 * because the audit only reads a handful of well-known tags (`<title>`,
 * `<meta>`, `<link rel="canonical">`, `<a href>`, JSON-LD scripts) and a word
 * count, and a parser dependency would be the one thing in this tool that the
 * repository does not already have. Anything the expressions get wrong shows
 * up as a finding the operator reads, never as a silent pass.
 */

export interface ExtractedPage {
  title: string | null;
  description: string | null;
  /** The canonical address resolved against the page, or null when there is none. */
  canonical: string | null;
  /** True when the `href` was written as an absolute address. */
  canonicalIsAbsolute: boolean;
  jsonLdTypes: string[];
  jsonLdErrors: number;
  /** Absolute addresses without fragments, in page order, duplicates removed. */
  links: { url: string; text: string }[];
  /** The visible text of the main content, whitespace collapsed. */
  text: string;
  wordCount: number;
  /** Google tag ids (`G-…`, `GTM-…`) found in scripts. */
  tagIds: string[];
  /** Analytics products whose scripts appear on the page. */
  analytics: string[];
  /**
   * Analytics products the page's Content-Security-Policy allows but whose
   * scripts are not in the HTML: most likely loaded later by a script bundle,
   * which a read-only audit that runs no JavaScript cannot see.
   */
  cspAnalytics: string[];
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  rsquo: '’',
  lsquo: '‘',
  hellip: '…',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** One attribute of an opening tag, decoded, or null. */
export function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  if (!match) return null;
  return decodeEntities(match[1] ?? match[2] ?? match[3] ?? '');
}

function resolveUrl(href: string, base: string): string | null {
  try {
    const url = new URL(href.trim(), base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function collectTypes(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectTypes(item, into);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  const type = record['@type'];
  if (typeof type === 'string') into.add(type);
  if (Array.isArray(type)) for (const t of type) if (typeof t === 'string') into.add(t);
  for (const [key, child] of Object.entries(record)) {
    if (key !== '@type' && typeof child === 'object') collectTypes(child, into);
  }
}

const ANALYTICS: { name: string; pattern: RegExp }[] = [
  {
    name: 'Google Analytics',
    pattern:
      /googletagmanager\.com\/gtag\/js|google-analytics\.com\/(?:g\/)?collect|gtag\(\s*['"]config['"]\s*,\s*['"]G-/i,
  },
  { name: 'Google Tag Manager', pattern: /googletagmanager\.com\/gtm\.js|['"]GTM-[A-Z0-9]{4,10}['"]/i },
  { name: 'Cloudflare Web Analytics', pattern: /static\.cloudflareinsights\.com\/beacon/i },
  { name: 'Plausible', pattern: /plausible\.io\/js\//i },
  { name: 'Fathom', pattern: /cdn\.usefathom\.com/i },
  { name: 'Meta Pixel', pattern: /connect\.facebook\.net\/[^"']*fbevents/i },
  { name: 'Hotjar', pattern: /static\.hotjar\.com/i },
  { name: 'Microsoft Clarity', pattern: /clarity\.ms\/tag/i },
  { name: 'Matomo', pattern: /\/(?:matomo|piwik)\.js/i },
];

/** How a privacy page would name each product. */
export const PRIVACY_MENTIONS: Record<string, RegExp> = {
  'Google Analytics': /google analytics|\bGA4\b/i,
  'Google Tag Manager': /tag manager/i,
  'Cloudflare Web Analytics': /cloudflare/i,
  Plausible: /plausible/i,
  Fathom: /fathom/i,
  'Meta Pixel': /meta pixel|facebook pixel|\bfacebook\b|\bmeta\b/i,
  Hotjar: /hotjar/i,
  'Microsoft Clarity': /clarity/i,
  Matomo: /matomo|piwik/i,
};

function mainRegion(html: string): string {
  for (const tag of ['main', 'article']) {
    const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(html);
    if (match) return match[1]!;
  }
  const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html);
  return (body ? body[1]! : html).replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ');
}

export function visibleText(html: string): string {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return collapse(decodeEntities(stripped));
}

export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
}

export function extractPage(html: string, pageUrl: string): ExtractedPage {
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? collapse(decodeEntities(titleMatch[1]!)) : null;

  let description: string | null = null;
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if ((attribute(tag, 'name') ?? '').toLowerCase() === 'description') {
      description = collapse(attribute(tag, 'content') ?? '');
      break;
    }
  }

  let canonical: string | null = null;
  let canonicalIsAbsolute = false;
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = (attribute(tag, 'rel') ?? '').toLowerCase().split(/\s+/);
    const href = attribute(tag, 'href');
    if (rel.includes('canonical') && href !== null) {
      canonical = resolveUrl(href, pageUrl);
      canonicalIsAbsolute = /^https?:\/\//i.test(href.trim());
      break;
    }
  }

  const types = new Set<string>();
  let jsonLdErrors = 0;
  const scripts: string[] = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi)) {
    const opening = match[1]!;
    const body = match[2]!;
    scripts.push(`${opening} ${body}`);
    if ((attribute(` ${opening}`, 'type') ?? '').toLowerCase() !== 'application/ld+json') continue;
    try {
      collectTypes(JSON.parse(body), types);
    } catch {
      jsonLdErrors += 1;
    }
  }
  const scriptText = scripts.join('\n');

  const seen = new Set<string>();
  const links: { url: string; text: string }[] = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attribute(` ${match[1]!}`, 'href');
    if (href === null || href.trim().startsWith('#')) continue;
    const url = resolveUrl(href, pageUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    links.push({ url, text: visibleText(match[2]!) });
  }

  const text = visibleText(mainRegion(html));
  const tagIds = [...new Set(scriptText.match(/\b(?:G|GTM)-[A-Z0-9]{4,12}\b/g) ?? [])];
  const analytics = ANALYTICS.filter((entry) => entry.pattern.test(scriptText)).map((entry) => entry.name);
  const csp = (html.match(/<meta\s[^>]*>/gi) ?? [])
    .filter((tag) => (attribute(tag, 'http-equiv') ?? '').toLowerCase() === 'content-security-policy')
    .map((tag) => attribute(tag, 'content') ?? '')
    .join(' ');
  const cspAnalytics =
    /googletagmanager\.com|google-analytics\.com/i.test(csp) && !analytics.includes('Google Analytics')
      ? ['Google Analytics']
      : [];

  return {
    title,
    description,
    canonical,
    canonicalIsAbsolute,
    jsonLdTypes: [...types],
    jsonLdErrors,
    links,
    text,
    wordCount: countWords(text),
    tagIds,
    analytics,
    cspAnalytics,
  };
}
