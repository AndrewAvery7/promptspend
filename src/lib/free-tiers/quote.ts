/**
 * Does a vendor's page still say what we quote it as saying?
 *
 * The daily free-tier check reads each source page and looks for each quote in
 * it. A plain substring test would fail on nearly every page for reasons that
 * have nothing to do with the wording: the page is HTML where we read Markdown,
 * a table row we joined with " · " is cells and pipes on the page, a curly
 * apostrophe is straight on one side, a non-breaking space sits in a figure.
 *
 * So both sides are reduced to the same thing — lowercase letters and digits,
 * nothing else — and the quote is looked for in that. It is deliberately
 * forgiving about everything except the words and numbers, which are the
 * claim: every digit survives, so a changed figure fails the check, while
 * "1,000" and "1000" (punctuation only) do not. A quote is a sentence rather
 * than a bare figure, so its surrounding words pin a number to its place.
 *
 * An elision (" … " or "...") splits a quote into parts; each part must appear,
 * in order.
 */

/** Lowercase letters and digits only. Accents are folded first: "é" → "e". */
export function reduceText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** HTML to its readable text, roughly: tags, scripts and entities removed. */
export function htmlText(html: string): string {
  return html
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;|&#x27;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

/**
 * Markdown links reduced to their words: `[Billing Page](https://…)` becomes
 * `[Billing Page]`. Many vendor docs are read as Markdown, where a link's
 * address sits in the middle of the sentence and would otherwise break every
 * quote that spans a link. The quotes in the data file keep a link's words and
 * drop its address (see the file's comment), so the page is made to match.
 */
export function stripMarkdownLinks(text: string): string {
  return text.replace(/\]\([^)\s]*(?:\s+"[^"]*")?\)/g, ']');
}

/** The parts of a quote, split at its elisions, each reduced. Empty parts dropped. */
export function quoteParts(quote: string): string[] {
  return quote
    .split(/\s*(?:…|\.\.\.)\s*/)
    .map(reduceText)
    .filter((part) => part.length > 0);
}

/** True when every part of `quote` appears in `pageText`, in order. */
export function pageContainsQuote(pageText: string, quote: string): boolean {
  const haystack = reduceText(stripMarkdownLinks(pageText));
  const parts = quoteParts(quote);
  if (parts.length === 0) return false;
  let from = 0;
  for (const part of parts) {
    const at = haystack.indexOf(part, from);
    if (at === -1) return false;
    from = at + part.length;
  }
  return true;
}
