/**
 * Settings, and the defaults behind them.
 *
 * The language allowlist is the whole reason markdown, changelogs and plain text
 * stay quiet. The scanner has no concept of prose — a line reading "we moved
 * from gpt-5 to gpt-5.6" is indistinguishable from source at that level, and
 * scan.test.ts records that on purpose. Keeping annotations out of documents
 * where a model name is being *discussed* rather than *called* is done here, by
 * naming the languages where a model id is an instruction to a machine.
 */
import type { InlineDetail } from './present';

/**
 * Languages where a model id means "call this model".
 *
 * Markdown, plaintext and log are absent deliberately, not by oversight.
 */
export const DEFAULT_LANGUAGES: readonly string[] = [
  'python',
  'javascript',
  'javascriptreact',
  'typescript',
  'typescriptreact',
  'go',
  'rust',
  'java',
  'kotlin',
  'csharp',
  'ruby',
  'php',
  'shellscript',
  'yaml',
  'json',
  'jsonc',
  'toml',
  'ini',
  'properties',
  'dotenv',
];

export interface Settings {
  /** How much the end-of-line annotation says, or `off` to show none. */
  inlineDetail: InlineDetail;
  /** Language ids to annotate. Hovers follow the same list. */
  languages: readonly string[];
  /** Whether the sync-date item appears in the status bar. */
  showStatusBar: boolean;
  /**
   * Whether a model id inside a comment is annotated. Off by default: a model
   * named in a comment is being discussed, not called, and annotating one is
   * how the extension ends up putting a price on a sentence that says not to.
   */
  annotateComments: boolean;
  /**
   * Which findings reach the Problems panel.
   *
   * `facts` is the default and covers what the catalog *knows*: deprecated,
   * legacy, disputed, stale. `all` adds the cheaper-alternative suggestion,
   * which is an opinion rather than a fact — it rests on a capability estimate
   * the project itself calls illustrative — so it is opt-in.
   */
  diagnostics: DiagnosticLevel;
}

export type DiagnosticLevel = 'facts' | 'all' | 'off';

export const DEFAULT_SETTINGS: Settings = {
  inlineDetail: 'compact',
  languages: DEFAULT_LANGUAGES,
  showStatusBar: true,
  annotateComments: false,
  diagnostics: 'facts',
};

export function shouldAnnotate(languageId: string, settings: Settings): boolean {
  return settings.languages.includes(languageId);
}

/**
 * File extension to language id, for the workspace sweep.
 *
 * The editor knows a document's `languageId`, but only for documents it has
 * opened — and opening every file in a repository to ask would be absurd when
 * the answer is available from the name. The sweep reads bytes off disk instead
 * and looks the language up here.
 *
 * Deliberately the same set as DEFAULT_LANGUAGES, from the other direction. A
 * language that can be annotated in an open editor but not found by the sweep
 * would be a difference nobody could explain.
 */
export const EXTENSION_LANGUAGE: Readonly<Record<string, string>> = {
  '.py': 'python',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascriptreact',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'typescriptreact',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.sh': 'shellscript',
  '.bash': 'shellscript',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.json': 'json',
  '.jsonc': 'jsonc',
  '.toml': 'toml',
  '.ini': 'ini',
  '.properties': 'properties',
  '.env': 'dotenv',
};

/** The language a path implies, or undefined if it is not one we scan. */
export function languageIdForPath(path: string): string | undefined {
  const lower = path.toLowerCase();
  // `.env`, `.env.local` and `.env.production` are all dotenv, and none of them
  // has an extension in the usual sense.
  const base = lower.slice(lower.lastIndexOf('/') + 1);
  if (base === '.env' || base.startsWith('.env.')) return 'dotenv';

  const dot = lower.lastIndexOf('.');
  return dot === -1 ? undefined : EXTENSION_LANGUAGE[lower.slice(dot)];
}

/** Glob of everything the sweep will open, built from the map above. */
export const SCAN_GLOB = `**/*{${Object.keys(EXTENSION_LANGUAGE).join(',')}}`;
