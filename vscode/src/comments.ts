/**
 * Finding the comments in a document, so model ids inside them can be left alone.
 *
 * This is the language allowlist's argument applied one level down. A model id
 * in markdown is being *discussed* rather than *called*, which is why markdown is
 * not annotated; a model id in `# switched from gpt-5 to gpt-5.6 last quarter` is
 * being discussed too, and it sits in a Python file.
 *
 * The case that made this non-negotiable was a comment reading "this one should
 * be left completely alone" with a price annotation hanging off the end of it.
 * An annotation that contradicts the sentence it is attached to does more damage
 * to trust than a missing annotation ever could.
 *
 * Deliberately a hand-rolled scanner rather than the editor's tokenizer: VS Code
 * exposes no stable API for "is this offset inside a comment scope". The
 * proposed one has been proposed for years.
 *
 * Triple-quoted Python strings are skipped too, though they are strings rather
 * than comments. That was originally the other way round, on the reasoning that
 * treating them as prose would silence `MODEL = """gpt-5"""`. Seeing it render
 * settled the argument: a module docstring reading "wrapper around
 * claude-opus-4-5" put the model's diagnostic on the sentence describing it
 * rather than on the call, so clicking the problem landed in documentation. One
 * of those cases is common and the other is contrived, and prose in a docstring
 * is prose by the same argument that keeps markdown out.
 */

export interface CommentSyntax {
  /** Tokens that begin a comment running to end of line. */
  line: readonly string[];
  /** Delimiters for a block comment, where the language has them. */
  block?: readonly [open: string, close: string];
  /** Characters that open a string literal, so a token inside one is not a comment. */
  quotes: readonly string[];
  /**
   * Symmetric delimiters whose contents are skipped like a comment.
   *
   * Python triple quotes. They hold docstrings far more often than they hold a
   * model id being passed to an API, and a docstring is prose.
   */
  verbatim?: readonly string[];
}

const HASH: CommentSyntax = { line: ['#'], quotes: ['"', "'"] };
const SLASHES: CommentSyntax = { line: ['//'], block: ['/*', '*/'], quotes: ['"', "'", '`'] };

/**
 * Per language, because guessing is wrong in a way that matters: `#` begins a
 * comment in Python and YAML, and is a private-field sigil in TypeScript. A
 * shared default would silence every line containing `this.#count`.
 */
const BY_LANGUAGE: Record<string, CommentSyntax> = {
  python: { ...HASH, verbatim: ['"""', "'''"] },
  yaml: HASH,
  shellscript: HASH,
  ruby: HASH,
  toml: HASH,
  dotenv: HASH,
  properties: { line: ['#', '!'], quotes: [] },
  ini: { line: [';', '#'], quotes: ['"'] },

  javascript: SLASHES,
  javascriptreact: SLASHES,
  typescript: SLASHES,
  typescriptreact: SLASHES,
  jsonc: SLASHES,
  go: SLASHES,
  rust: SLASHES,
  java: SLASHES,
  kotlin: SLASHES,
  csharp: SLASHES,
  php: { line: ['//', '#'], block: ['/*', '*/'], quotes: ['"', "'"] },

  // Strict JSON has no comments at all. Listed explicitly so that it reads as a
  // decision rather than an omission.
  json: { line: [], quotes: ['"'] },
};

export function commentSyntaxFor(languageId: string): CommentSyntax | undefined {
  return BY_LANGUAGE[languageId];
}

export type Range = readonly [start: number, end: number];

/**
 * Every comment span in the text, in order and non-overlapping.
 *
 * String state is tracked so that a `#` inside a URL, or a `//` inside one, does
 * not swallow the rest of the line. When the tracking is fooled the result is a
 * *missing* annotation rather than a wrong one, which is the direction this
 * whole extension errs in.
 */
export function commentRanges(text: string, syntax: CommentSyntax): Range[] {
  const ranges: Range[] = [];
  const quotes = new Set(syntax.quotes);
  let i = 0;

  while (i < text.length) {
    const char = text[i]!;

    // Before the single-quote check, because `"""` starts with `"` and testing
    // the short form first would consume an empty string and leave the docstring
    // body looking like code.
    const opener = syntax.verbatim?.find((v) => text.startsWith(v, i));
    if (opener !== undefined) {
      const close = text.indexOf(opener, i + opener.length);
      const end = close === -1 ? text.length : close + opener.length;
      ranges.push([i, end]);
      i = end;
      continue;
    }

    if (quotes.has(char)) {
      i = skipString(text, i, char);
      continue;
    }

    if (syntax.block && text.startsWith(syntax.block[0], i)) {
      const close = text.indexOf(syntax.block[1], i + syntax.block[0].length);
      // An unterminated block comment runs to the end of the file, which is what
      // the compiler thinks too.
      const end = close === -1 ? text.length : close + syntax.block[1].length;
      ranges.push([i, end]);
      i = end;
      continue;
    }

    const token = syntax.line.find((t) => text.startsWith(t, i));
    if (token !== undefined) {
      const newline = text.indexOf('\n', i);
      const end = newline === -1 ? text.length : newline;
      ranges.push([i, end]);
      i = end;
      continue;
    }

    i += 1;
  }

  return ranges;
}

/** Index past the closing quote, honouring backslash escapes. */
function skipString(text: string, openIndex: number, quote: string): number {
  let i = openIndex + 1;
  while (i < text.length) {
    const char = text[i];
    if (char === '\\') {
      i += 2;
      continue;
    }
    // An unterminated string ends at the newline rather than eating the file.
    // Every language here that allows a raw newline inside a single-quoted
    // string also has a better way to write it.
    if (char === '\n' || char === quote) return i + 1;
    i += 1;
  }
  return i;
}

/** True when `offset` falls inside one of the ranges. Ranges must be sorted. */
export function isInside(ranges: readonly Range[], offset: number): boolean {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const [start, end] = ranges[mid]!;
    if (offset < start) high = mid - 1;
    else if (offset >= end) low = mid + 1;
    else return true;
  }
  return false;
}
