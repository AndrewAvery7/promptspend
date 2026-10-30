import { describe, expect, it } from 'vitest';
import { attribute, countWords, decodeEntities, extractPage } from './html';
import { isAllowed, parseRobots, robotsPath, rulesFor } from './robots';
import { parseSitemap, spreadSample } from './sitemap';

const ROBOTS = `# comment
User-agent: *
Disallow: /private/
Disallow: /*?m=
Allow: /private/open$

User-agent: Googlebot
User-agent: Bingbot
Disallow: /no-search/

User-agent: CrestwoodSiteAudit
Disallow:

Sitemap: https://example.com/sitemap-index.xml
`;

describe('robots.txt', () => {
  const robots = parseRobots(ROBOTS);

  it('reads groups, shared agent lines and sitemaps', () => {
    expect(robots.groups).toHaveLength(3);
    expect(robots.groups[1]!.agents).toEqual(['googlebot', 'bingbot']);
    expect(robots.sitemaps).toEqual(['https://example.com/sitemap-index.xml']);
    // An empty Disallow is no rule at all.
    expect(rulesFor(robots, 'CrestwoodSiteAudit')).toEqual([]);
  });

  it('uses the most specific group, the longest rule, and wildcards', () => {
    expect(isAllowed(robots, 'other-bot', '/private/x')).toBe(false);
    expect(isAllowed(robots, 'other-bot', '/private/open')).toBe(true);
    expect(isAllowed(robots, 'other-bot', '/private/open/more')).toBe(false);
    expect(isAllowed(robots, 'other-bot', '/?m=gpt-5')).toBe(false);
    // Googlebot has its own group, so the * rules do not apply to it.
    expect(isAllowed(robots, 'Googlebot', '/private/x')).toBe(true);
    expect(isAllowed(robots, 'googlebot-image', '/no-search/a')).toBe(false);
    expect(isAllowed(robots, 'CrestwoodSiteAudit', '/private/x')).toBe(true);
  });

  it('lets Allow win a tie and allows everything with no file', () => {
    const tie = parseRobots('User-agent: *\nDisallow: /a\nAllow: /a\n');
    expect(isAllowed(tie, 'x', '/a')).toBe(true);
    expect(isAllowed(parseRobots(''), 'x', '/anything')).toBe(true);
    expect(isAllowed(parseRobots('Disallow: /orphan-rule\n'), 'x', '/orphan-rule')).toBe(true);
    expect(robotsPath('https://a.com/x?y=1#z')).toBe('/x?y=1');
  });
});

describe('sitemaps', () => {
  it('tells an index from a page list from anything else', () => {
    expect(
      parseSitemap('<sitemapindex><sitemap><loc>https://a.com/s1.xml</loc></sitemap></sitemapindex>'),
    ).toEqual({
      kind: 'index',
      locs: ['https://a.com/s1.xml'],
    });
    expect(
      parseSitemap('<urlset xmlns="x"><url><loc> https://a.com/?a=1&amp;b=2 </loc></url></urlset>').locs,
    ).toEqual(['https://a.com/?a=1&b=2']);
    expect(parseSitemap('<html>not found</html>').kind).toBe('invalid');
    expect(parseSitemap('<urlset><url><loc>https://a.com/</loc>').kind).toBe('invalid');
  });

  it('samples evenly through a long list', () => {
    expect(spreadSample([1, 2, 3], 5)).toEqual([1, 2, 3]);
    expect(spreadSample([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 5)).toEqual([0, 2, 4, 6, 8]);
  });
});

const PAGE = `<!doctype html><html><head>
<title> Example &amp; Co — prices </title>
<meta name="description" content="A plain description of the page.">
<link rel="canonical" href="/about/">
<script type="application/ld+json">{"@graph":[{"@type":"Organization","name":"Ex"},{"@type":["WebSite","Thing"]}]}</script>
<script type="application/ld+json">{ broken </script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC1234"></script>
<script>gtag('config', 'G-ABC1234');</script>
<script defer src="https://static.cloudflareinsights.com/beacon.min.js"></script>
</head><body>
<nav><a href="/">Home</a> <a href="/privacy/">Privacy</a></nav>
<main><h1>About us</h1><p>We sell three kinds of widgets, and it&rsquo;s 100% true.</p>
<a href="#top">top</a> <a href="/about/#team">Team</a> <a href="/about/">again</a>
<a href="mailto:x@example.com">mail</a> <a href="https://other.org/page">Other</a></main>
<footer>footer words here</footer>
</body></html>`;

describe('reading a page', () => {
  const page = extractPage(PAGE, 'https://example.com/about/');

  it('reads the title, description and canonical', () => {
    expect(page.title).toBe('Example & Co — prices');
    expect(page.description).toBe('A plain description of the page.');
    expect(page.canonical).toBe('https://example.com/about/');
    expect(page.canonicalIsAbsolute).toBe(false);
  });

  it('collects JSON-LD types through @graph and arrays, and counts parse errors', () => {
    expect(page.jsonLdTypes.sort()).toEqual(['Organization', 'Thing', 'WebSite']);
    expect(page.jsonLdErrors).toBe(1);
  });

  it('resolves links, drops fragments, mail links and repeats', () => {
    expect(page.links.map((link) => link.url)).toEqual([
      'https://example.com/',
      'https://example.com/privacy/',
      'https://example.com/about/',
      'https://other.org/page',
    ]);
    expect(page.links[1]!.text).toBe('Privacy');
  });

  it('counts the main content only, and finds tags and analytics', () => {
    expect(page.text).toContain('three kinds of widgets');
    expect(page.text).not.toContain('footer');
    expect(page.wordCount).toBe(17);
    expect(page.tagIds).toEqual(['G-ABC1234']);
    expect(page.analytics).toEqual(['Google Analytics', 'Cloudflare Web Analytics']);
  });

  it('falls back to the body without navigation when there is no main element', () => {
    const bare = extractPage(
      '<body><header>Menu</header><p>Only words</p><footer>x</footer></body>',
      'https://a.com/',
    );
    expect(bare.text).toBe('Only words');
    expect(bare.title).toBeNull();
    expect(bare.description).toBeNull();
    expect(bare.canonical).toBeNull();
    expect(bare.cspAnalytics).toEqual([]);
  });

  it('notices Google Analytics allowed by a Content-Security-Policy but loaded by no script in the HTML', () => {
    const csp = extractPage(
      '<head><meta http-equiv="Content-Security-Policy" content="script-src https://www.googletagmanager.com"></head><body>x</body>',
      'https://a.com/',
    );
    expect(csp.cspAnalytics).toEqual(['Google Analytics']);
    expect(page.cspAnalytics).toEqual([]);
  });

  it('decodes entities and reads attributes in any quoting', () => {
    expect(decodeEntities('&#x41;&#66;&nbsp;&bogus; &#0;')).toBe('AB &bogus; &#0;');
    expect(attribute('<a href=plain>', 'href')).toBe('plain');
    expect(attribute("<a href='single'>", 'href')).toBe('single');
    expect(attribute('<a data-href="no">', 'href')).toBeNull();
    expect(countWords('')).toBe(0);
  });
});
