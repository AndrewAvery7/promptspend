/**
 * robots.txt, read the way Google documents it (RFC 9309): groups of
 * `User-agent` lines, the most specific matching group wins, the longest
 * matching rule wins inside it, and `Allow` beats `Disallow` on a tie.
 *
 * Pure: text in, answers out. The audit uses it twice, once to obey the file
 * while crawling and once to score it.
 */

export interface RobotsRule {
  allow: boolean;
  path: string;
}

export interface RobotsGroup {
  /** Lowercased product tokens, `*` for every crawler. */
  agents: string[];
  rules: RobotsRule[];
}

export interface Robots {
  groups: RobotsGroup[];
  /** Absolute sitemap addresses, in file order. */
  sitemaps: string[];
}

export const EMPTY_ROBOTS: Robots = { groups: [], sitemaps: [] };

export function parseRobots(text: string): Robots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1]!.toLowerCase();
    const value = match[2]!.trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    if (key === 'sitemap') {
      if (value) sitemaps.push(value);
      continue;
    }
    lastWasAgent = false;
    if ((key === 'allow' || key === 'disallow') && current) {
      // An empty Disallow means "nothing is disallowed", which is no rule at all.
      if (value === '') continue;
      current.rules.push({ allow: key === 'allow', path: value });
    }
  }
  return { groups, sitemaps };
}

/**
 * The rules that apply to one crawler: every group naming the longest matching
 * token, merged, or the `*` groups when none names it.
 */
export function rulesFor(robots: Robots, agent: string): RobotsRule[] {
  const token = agent.toLowerCase();
  let best = '';
  for (const group of robots.groups) {
    for (const name of group.agents) {
      if (name !== '*' && token.startsWith(name) && name.length > best.length) best = name;
    }
  }
  const wanted = best || '*';
  return robots.groups.filter((group) => group.agents.includes(wanted)).flatMap((group) => group.rules);
}

function patternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}${anchored ? '$' : ''}`).test(path);
}

/** May this crawler read this path (with its query string)? */
export function isAllowed(robots: Robots, agent: string, path: string): boolean {
  let winner: RobotsRule | null = null;
  for (const rule of rulesFor(robots, agent)) {
    if (!patternMatches(rule.path, path)) continue;
    if (
      !winner ||
      rule.path.length > winner.path.length ||
      (rule.path.length === winner.path.length && rule.allow)
    ) {
      winner = rule;
    }
  }
  return winner ? winner.allow : true;
}

/** `https://a.com/x?y=1#z` becomes `/x?y=1`, the form robots rules are written against. */
export function robotsPath(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}
