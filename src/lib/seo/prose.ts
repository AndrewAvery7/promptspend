/**
 * The narrow markdown this repo's writing content actually uses, turned into
 * HTML for the generated pages.
 *
 * Deliberately not a general-purpose parser or a new dependency: the pieces
 * used here are `## ` headings, blank-line-separated paragraphs, fenced code
 * blocks, unordered lists, links, `**bold**` and `` `code` `` spans. Nothing
 * else is supported, and anything outside that set (blockquotes, images) passes
 * through as a literal paragraph rather than silently vanishing — a markdown
 * feature nobody wrote a renderer for should fail loud in review, not render
 * as plain, un-styled text with no explanation.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/** `**bold**` and `` `code` `` within a run of text already destined for HTML. */
function inline(text: string): string {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2">$1</a>');
}

export interface ParsedContent {
  meta: Record<string, string>;
  body: string;
}

/**
 * `---\nkey: value\n---\n<body>`. Hand-rolled rather than a frontmatter
 * library because the fields are three lines of `key: value` — a real parser
 * would be more code than the format it's parsing.
 */
export function parseFrontmatter(raw: string): ParsedContent {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
  if (!match) throw new Error('content file has no --- frontmatter block');
  const [, frontmatter, body] = match;
  const meta: Record<string, string> = {};
  for (const line of frontmatter!.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const separator = line.indexOf(':');
    if (separator === -1) throw new Error(`frontmatter line is not "key: value": ${line}`);
    meta[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return { meta, body: body!.trim() };
}

/** Markdown body to HTML. See the module doc for exactly what's supported. */
export function renderMarkdown(markdown: string): string {
  const blocks = markdown.split(/\r?\n\r?\n+/);
  const html: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1]!.length;
      html.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
      continue;
    }

    const fence = /^```(\w*)\r?\n([\s\S]*?)\r?\n```$/.exec(trimmed);
    if (fence) {
      const lang = fence[1] ? ` class="language-${escapeHtml(fence[1])}"` : '';
      html.push(`<pre><code${lang}>${escapeHtml(fence[2]!)}</code></pre>`);
      continue;
    }

    const listItems = trimmed.split(/\r?\n/);
    if (listItems.every((line) => /^-\s+\S/.test(line))) {
      html.push(
        `<ul>${listItems.map((line) => `<li>${inline(line.replace(/^-\s+/, ''))}</li>`).join('')}</ul>`,
      );
      continue;
    }

    // A run of consecutive lines is one paragraph; a single '\n' inside it is
    // a soft wrap in the source, not a break, so it collapses to one space.
    html.push(`<p>${inline(trimmed.replace(/\r?\n/g, ' '))}</p>`);
  }

  return html.join('\n');
}
