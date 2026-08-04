/**
 * Load the built bundle the way the extension host will, and activate it.
 *
 * This exists because of what the MCP server learned the hard way: everything
 * upstream of running the artifact said it was fine. The typecheck passes, the
 * tests pass — vitest resolves the `@` alias itself and never loads the bundle —
 * and then the published extension fails at activation with an error pointing at
 * a minified line nobody wrote.
 *
 * Three failures this catches and nothing before it can:
 *
 *   - `format: 'esm'` instead of `'cjs'`, or the output named `.js` under a
 *     `"type": "module"` package. Both make `require` throw immediately.
 *   - `vscode` bundled instead of external — the bundle then tries to resolve a
 *     module that only exists inside the editor.
 *   - An unresolved `@/...` import surviving into the output, which is what
 *     happens the moment someone removes the esbuild alias.
 *
 * The `vscode` module is stubbed with just enough surface for `activate` to run
 * to completion. That is not a substitute for opening the editor — no test here
 * can say whether a hover renders or reads well — but it does prove the bundle
 * loads, activates, and registers what it claims to.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Module from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = resolve(ROOT, 'dist/extension.cjs');

const registered = {
  commands: [] as string[],
  hovers: 0,
  disposables: 0,
  diagnosticCollections: [] as string[],
  treeViews: [] as string[],
  decorationsSet: [] as number[],
  diagnosticsSet: [] as number[],
  logLines: [] as string[],
};

const disposable = () => {
  registered.disposables += 1;
  return { dispose: () => {} };
};

/**
 * A document with real model ids in it, so `refresh` runs the whole way through.
 *
 * Leaving `activeTextEditor` undefined — which this stub did until an entire
 * debugging session went by with a blank screen and no explanation — means
 * `refresh` returns on its first line and the gate proves only that `activate`
 * does not throw. Everything that actually draws anything went unexercised.
 */
const SAMPLE = [
  'import anthropic',
  'client.messages.create(',
  '    model="claude-sonnet-5",',
  '    max_tokens=4096,',
  ')',
  'FALLBACK = "gemini-2.5-flash"',
  '# a comment mentioning gpt-5 that must stay quiet',
].join('\n');

const lineStarts = (() => {
  const starts = [0];
  for (let i = 0; i < SAMPLE.length; i += 1) if (SAMPLE[i] === '\n') starts.push(i + 1);
  return starts;
})();

const position = (offset: number) => {
  let line = 0;
  while (line + 1 < lineStarts.length && lineStarts[line + 1]! <= offset) line += 1;
  return { line, character: offset - lineStarts[line]! };
};

const fakeDocument = {
  languageId: 'python',
  // `scheme` matters: the extension ignores anything that is not a document a
  // person edits, which is what keeps it out of a loop with its own output
  // channel. A stub without it looks exactly like the Output panel.
  uri: { scheme: 'file', toString: () => 'file:///sample.py' },
  getText: (range?: unknown) => (range === undefined ? SAMPLE : ''),
  positionAt: position,
  offsetAt: (p: { line: number; character: number }) => (lineStarts[p.line] ?? 0) + p.character,
  lineAt: (line: number) => ({ range: { start: { line, character: 0 }, end: { line, character: 0 } } }),
};

const fakeEditor = {
  document: fakeDocument,
  selection: {},
  setDecorations: (_type: unknown, ranges: unknown[]) => {
    registered.decorationsSet.push(ranges.length);
  },
};

const stub = {
  window: {
    createTextEditorDecorationType: () => disposable(),
    createStatusBarItem: () => ({
      show: () => {},
      hide: () => {},
      dispose: () => {},
      text: '',
      tooltip: '',
      command: '',
      backgroundColor: undefined,
    }),
    createOutputChannel: () => {
      registered.disposables += 1;
      return {
        appendLine: (line: string) => registered.logLines.push(line),
        show: () => {},
        dispose: () => {},
      };
    },
    showErrorMessage: () => Promise.resolve(undefined),
    showInformationMessage: () => Promise.resolve(undefined),
    showWarningMessage: () => Promise.resolve(undefined),
    onDidChangeActiveTextEditor: () => disposable(),
    activeTextEditor: fakeEditor,
    withProgress: (_options: unknown, task: (progress: unknown, token: unknown) => Promise<unknown>) =>
      task({ report: () => {} }, { isCancellationRequested: false }),
    registerTreeDataProvider: (id: string) => {
      registered.treeViews.push(id);
      return disposable();
    },
  },
  workspace: {
    getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
    onDidChangeTextDocument: () => disposable(),
    onDidChangeConfiguration: () => disposable(),
  },
  languages: {
    registerHoverProvider: () => {
      registered.hovers += 1;
      return disposable();
    },
    createDiagnosticCollection: (name: string) => {
      registered.diagnosticCollections.push(name);
      registered.disposables += 1;
      return {
        set: (_uri: unknown, items: unknown[]) => registered.diagnosticsSet.push(items.length),
        delete: () => registered.diagnosticsSet.push(-1),
        clear: () => {},
        dispose: () => {},
      };
    },
  },
  Diagnostic: class {},
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  ProgressLocation: { Window: 10, Notification: 15 },
  EventEmitter: class {
    event = () => ({ dispose: () => {} });
    fire() {}
    dispose() {}
  },
  TreeItem: class {
    constructor(
      public label: string,
      public collapsibleState?: number,
    ) {}
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class {
    static File = {};
    constructor(public id: string) {}
  },
  commands: {
    registerCommand: (id: string) => {
      registered.commands.push(id);
      return disposable();
    },
  },
  env: { openExternal: () => Promise.resolve(true) },
  Uri: { parse: (value: string) => value },
  ThemeColor: class {},
  MarkdownString: class {},
  Hover: class {},
  Range: class {},
  StatusBarAlignment: { Right: 2 },
  DecorationRangeBehavior: { ClosedClosed: 1 },
};

// Intercept `require('vscode')`, which does not exist on disk anywhere.
const originalLoad = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...args: unknown[]) => unknown })._load = function (...args: unknown[]) {
  if (args[0] === 'vscode') return stub;
  return originalLoad.apply(this, args);
};

const require = createRequire(import.meta.url);
const extension = require(BUNDLE) as {
  activate?: (context: unknown) => void;
  deactivate?: () => void;
};

if (typeof extension.activate !== 'function') {
  throw new Error('The bundle does not export activate(). VS Code would load it and do nothing.');
}
if (typeof extension.deactivate !== 'function') {
  throw new Error('The bundle does not export deactivate().');
}

const subscriptions: unknown[] = [];
extension.activate({ subscriptions });

// `activate` kicks off a refresh it does not await. Poll rather than sleeping a
// flat fifteen seconds: this runs on every `verify`, locally and in CI, and the
// happy path finishes in well under a second.
const deadline = Date.now() + 20_000;
while (registered.decorationsSet.length === 0 && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 100));
}
extension.deactivate();

if (registered.hovers < 1) throw new Error('activate() registered no hover provider.');
if (!registered.diagnosticCollections.includes('promptspend')) {
  throw new Error(
    `activate() created no "promptspend" diagnostic collection, so nothing would reach the ` +
      `Problems panel. Created: ${registered.diagnosticCollections.join(', ') || 'none'}`,
  );
}
// Every command the manifest declares must actually be registered, or invoking
// it from the palette fails with "command not found" — a mismatch nothing else
// in the build can see, since the manifest and the code are checked separately.
const declared: string[] = JSON.parse(
  readFileSync(resolve(ROOT, 'package.json'), 'utf8'),
).contributes.commands.map((c: { command: string }) => c.command);
const missing = declared.filter((id) => !registered.commands.includes(id));
if (missing.length > 0) {
  throw new Error(
    `The manifest declares commands that activate() never registers: ${missing.join(', ')}. ` +
      `Invoking one from the palette would fail. Registered: ${registered.commands.join(', ') || 'none'}`,
  );
}
if (!registered.treeViews.includes('promptspend.workspaceCost')) {
  throw new Error(
    `activate() registered no "promptspend.workspaceCost" tree provider, so the view the ` +
      `manifest contributes would render empty forever. Registered: ${registered.treeViews.join(', ') || 'none'}`,
  );
}
if (subscriptions.length === 0) {
  throw new Error('activate() pushed nothing onto context.subscriptions; disposables would leak.');
}

// The gate that matters: did a full refresh, against a document with real model
// ids in it, actually put anything on screen? Everything above proves the bundle
// loads. Only this proves it does its job.
const drew = registered.decorationsSet.some((count) => count > 0);
if (!drew) {
  console.error(
    `\n  Log from the run:\n${registered.logLines.map((l) => `    ${l}`).join('\n') || '    (empty)'}\n`,
  );
  throw new Error(
    `activate() ran a full refresh over a document containing "claude-sonnet-5" and ` +
      `"gemini-2.5-flash" and set no decorations. The extension would look installed and ` +
      `do nothing. setDecorations calls: [${registered.decorationsSet.join(', ') || 'none'}]`,
  );
}

// A startup that logs a handful of lines is healthy; one that logs dozens is the
// feedback loop. Writing to the output channel changes a document, and if that
// change is allowed to schedule a refresh, the refresh writes the next line.
const MAX_STARTUP_LOG_LINES = 10;
if (registered.logLines.length > MAX_STARTUP_LOG_LINES) {
  throw new Error(
    `activate() wrote ${registered.logLines.length} log lines during a single startup, over the ` +
      `${MAX_STARTUP_LOG_LINES}-line budget. That is the signature of the log-feedback loop: check ` +
      `that REAL_DOCUMENT_SCHEMES still guards onDidChangeTextDocument.\n` +
      registered.logLines
        .slice(0, 5)
        .map((l) => `    ${l}`)
        .join('\n'),
  );
}

console.log(
  `  activation OK — ${subscriptions.length} subscriptions, ${registered.hovers} hover provider, ` +
    `${registered.diagnosticCollections.length} diagnostic collection, ` +
    `commands: ${registered.commands.join(', ')}`,
);
console.log(
  `  render OK — decorations ${registered.decorationsSet.join('/')}, ` +
    `diagnostics ${registered.diagnosticsSet.join('/')}`,
);
for (const line of registered.logLines) console.log(`    ${line}`);
