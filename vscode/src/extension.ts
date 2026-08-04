/**
 * Extension entry point — the only file that imports `vscode`.
 *
 * Everything with a decision in it lives elsewhere and is unit-tested: the
 * catalog policy in catalog.ts, the matching in scan.ts, the wording in
 * present.ts, the freshness display in service.ts. What is left here is wiring,
 * which is the part a test without an editor binary could not check anyway.
 */
import * as vscode from 'vscode';
import { PricingService, statusBarText } from './service';
import { CATALOG_URL } from './catalog';
import { DEFAULT_SETTINGS, shouldAnnotate, type Settings, type DiagnosticLevel } from './config';
import { diagnose } from './diagnose';
import { hoverMarkdown, inlineText, estimateRowText, estimatorLink, type InlineDetail } from './present';
import { commentSyntaxFor } from './comments';
import { ceilingFor } from './ceiling';
import { estimateSelection } from './estimate';
import { WorkspaceCostProvider } from './tree';
import type { Model } from '@/lib/pricing/types';

/**
 * Stamped in by esbuild from the manifest. Declared rather than imported so the
 * bundle carries the version of the build, not of whatever manifest is on disk.
 */
declare const __EXTENSION_VERSION__: string;

/** How long typing has to pause before decorations are recomputed. */
const DEBOUNCE_MS = 250;

/**
 * Schemes worth looking at.
 *
 * Not a tidiness measure — a correctness one, and the bug that proved it was
 * circular. VS Code's Output panel is a real `TextEditor` with languageId `Log`,
 * so writing a diagnostic line to the output channel changed a document, which
 * fired `onDidChangeTextDocument`, which triggered a refresh, which wrote
 * another line. The extension sat in a feedback loop with its own logging.
 *
 * Restricting to documents a person actually edits fixes that at the root and
 * also stops the extension scanning diff views, git blame panes and terminals.
 */
const REAL_DOCUMENT_SCHEMES = new Set(['file', 'untitled', 'vscode-remote', 'vscode-vfs']);

function isRealDocument(document: vscode.TextDocument): boolean {
  return REAL_DOCUMENT_SCHEMES.has(document.uri.scheme);
}

export function activate(context: vscode.ExtensionContext): void {
  const service = new PricingService();

  const decoration = vscode.window.createTextEditorDecorationType({
    after: {
      // `editorCodeLens.foreground` is the theme's own colour for text that
      // annotates code rather than being code. Hard-coding a grey would look
      // wrong in half the themes people use.
      color: new vscode.ThemeColor('editorCodeLens.foreground'),
      margin: '0 0 0 1.5rem',
    },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = 'promptspend.openSite';

  const diagnostics = vscode.languages.createDiagnosticCollection('promptspend');

  /**
   * Where failures go.
   *
   * Every refresh used to be fired as `void refresh(...)`, which meant an
   * exception anywhere inside it disappeared: the decorations from the previous
   * pass stayed on screen, nothing new was drawn, and the extension looked like
   * it had simply decided there was nothing to say. A tool whose entire premise
   * is showing its working cannot fail invisibly.
   */
  const log = vscode.window.createOutputChannel('PromptSpend');

  context.subscriptions.push(decoration, status, diagnostics, log);

  /**
   * Write a line unless it is the one just written.
   *
   * The loop above is fixed at its root by the scheme guard, but a refresh that
   * legitimately fires many times — scrolling, focus changes — should still not
   * produce a hundred identical lines that bury the one that matters.
   */
  let lastLogged = '';
  function logOnce(line: string): void {
    if (line === lastLogged) return;
    lastLogged = line;
    log.appendLine(line);
  }

  /** Report a failure to the status bar and the channel rather than swallowing it. */
  function reportFailure(where: string, cause: unknown): void {
    const detail = cause instanceof Error ? (cause.stack ?? cause.message) : String(cause);
    log.appendLine(`[${where}] ${detail}`);
    status.text = '$(error) PromptSpend: failed';
    status.tooltip = `${where}: ${detail.split('\n')[0]}\n\nRun "PromptSpend: Show log" for the full trace.`;
    status.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    status.show();
  }

  const tree = new WorkspaceCostProvider(service, () => settings());
  context.subscriptions.push(vscode.window.registerTreeDataProvider('promptspend.workspaceCost', tree));

  const settings = (): Settings => {
    const config = vscode.workspace.getConfiguration('promptspend');
    return {
      inlineDetail: config.get<InlineDetail>('inlineDetail', DEFAULT_SETTINGS.inlineDetail),
      languages: config.get<string[]>('languages', [...DEFAULT_SETTINGS.languages]),
      showStatusBar: config.get<boolean>('showStatusBar', DEFAULT_SETTINGS.showStatusBar),
      annotateComments: config.get<boolean>('annotateComments', DEFAULT_SETTINGS.annotateComments),
      diagnostics: config.get<DiagnosticLevel>('diagnostics', DEFAULT_SETTINGS.diagnostics),
    };
  };

  /**
   * Comment syntax for a document, or nothing when comments are to be annotated
   * too. A language with no entry gets no comment skipping — annotating a little
   * too much in an unknown language beats silently skipping half of a known one.
   */
  const scanOptions = (document: vscode.TextDocument, current: Settings) =>
    current.annotateComments ? {} : { comments: commentSyntaxFor(document.languageId) };

  async function refresh(editor: vscode.TextEditor | undefined): Promise<void> {
    const current = settings();
    updateStatusBar(status, service, current);

    if (!editor) {
      logOnce('[refresh] no active editor');
      return;
    }

    // Output panels, diff views, git panes. Returning before touching anything
    // is what keeps the extension out of a loop with its own log channel.
    if (!isRealDocument(editor.document)) return;

    if (!shouldAnnotate(editor.document.languageId, current)) {
      // Logged because "this language is not in the allowlist" and "the catalog
      // is unreachable" look identical on screen — both are a file with no
      // annotations — and the difference is the whole diagnosis.
      logOnce(
        `[refresh] languageId "${editor.document.languageId}" is not in promptspend.languages; ` +
          `nothing annotated`,
      );
      editor.setDecorations(decoration, []);
      diagnostics.delete(editor.document.uri);
      return;
    }

    const { matches, state, skipped } = await service.scan(
      editor.document.getText(),
      scanOptions(editor.document, current),
    );
    updateStatusBar(status, service, current);

    if (skipped) {
      log.appendLine('[refresh] document past the size cap; not scanned');
      editor.setDecorations(decoration, []);
      diagnostics.delete(editor.document.uri);
      return;
    }

    if (state.status !== 'ready') {
      // The silent-return that made this whole session's bug invisible. A clean
      // "unavailable" is not an exception, so nothing was ever written down.
      log.appendLine(`[refresh] catalog unavailable, showing nothing: ${state.reason}`);
      editor.setDecorations(decoration, []);
      diagnostics.delete(editor.document.uri);
      return;
    }

    log.appendLine(
      `[refresh] ${editor.document.languageId}: ${matches.length} model reference(s), ` +
        `catalog generated ${state.generatedAt}${state.ageing ? ' (ageing)' : ''}`,
    );

    const documentText = editor.document.getText();

    editor.setDecorations(
      decoration,
      current.inlineDetail === 'off'
        ? []
        : matches.flatMap((match) => {
            const text = inlineText(match, current.inlineDetail, ceilingFor(documentText, match, matches));
            if (text === null) return [];
            // Anchored to the end of the matched id's line, not to the id itself,
            // so several ids on one line do not stack annotations on each other.
            const line = editor.document.lineAt(editor.document.positionAt(match.start).line);
            return [{ range: line.range, renderOptions: { after: { contentText: text } } }];
          }),
    );

    // Diagnostics are independent of the inline annotation: someone who turns
    // the gutter text off has asked for less clutter, not for the extension to
    // stop telling them a model is deprecated.
    diagnostics.set(
      editor.document.uri,
      current.diagnostics === 'off'
        ? []
        : diagnose(matches, state.catalog)
            .filter((finding) => current.diagnostics === 'all' || finding.kind !== 'cheaper-available')
            .map((finding) => {
              const range = new vscode.Range(
                editor.document.positionAt(finding.match.start),
                editor.document.positionAt(finding.match.end),
              );
              const diagnostic = new vscode.Diagnostic(
                range,
                finding.message,
                vscode.DiagnosticSeverity.Information,
              );
              diagnostic.source = 'PromptSpend';
              diagnostic.code = finding.url
                ? { value: finding.kind, target: vscode.Uri.parse(finding.url) }
                : finding.kind;
              return diagnostic;
            }),
    );
  }

  /**
   * `refresh` with its failures made visible.
   *
   * Fire-and-forget is right here — nothing awaits a redraw — but fire-and-
   * forget-and-hide is not, and that is what a bare `void refresh(...)` does.
   */
  const safeRefresh = (editor: vscode.TextEditor | undefined): void => {
    refresh(editor).catch((cause: unknown) => reportFailure('refresh', cause));
  };

  // One timer, reset on every keystroke. Without it, every character typed in a
  // large file triggers a full rescan and the editor feels heavy.
  let pending: ReturnType<typeof setTimeout> | undefined;
  const scheduleRefresh = (editor: vscode.TextEditor | undefined): void => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => safeRefresh(editor), DEBOUNCE_MS);
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => safeRefresh(editor)),
    vscode.workspace.onDidChangeTextDocument((event) => {
      // The scheme check is the load-bearing half. Without it, appending to the
      // output channel counts as a document change and schedules the refresh
      // that appends the next line.
      if (!isRealDocument(event.document)) return;
      const editor = vscode.window.activeTextEditor;
      if (editor && event.document === editor.document) scheduleRefresh(editor);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('promptspend')) safeRefresh(vscode.window.activeTextEditor);
    }),

    vscode.languages.registerHoverProvider(
      // Was `{ scheme: '*' }`, which offered hovers over output panes and diff
      // views as readily as over source.
      [...REAL_DOCUMENT_SCHEMES].map((scheme) => ({ scheme })),
      {
        async provideHover(document, position) {
          const current = settings();
          if (!isRealDocument(document) || !shouldAnnotate(document.languageId, current)) return undefined;

          const { matches, state } = await service.scan(document.getText(), scanOptions(document, current));
          if (state.status !== 'ready') return undefined;

          const offset = document.offsetAt(position);
          const hit = matches.find((m) => offset >= m.start && offset <= m.end);
          if (!hit) return undefined;

          const markdown = new vscode.MarkdownString(
            hoverMarkdown(hit, state.catalog, ceilingFor(document.getText(), hit, matches)),
          );
          // The content is built from catalog data by present.ts and contains
          // no HTML; trusting it is what lets the links through.
          markdown.isTrusted = true;
          markdown.supportThemeIcons = true;
          return new vscode.Hover(
            markdown,
            new vscode.Range(document.positionAt(hit.start), document.positionAt(hit.end)),
          );
        },
      },
    ),

    vscode.commands.registerCommand('promptspend.openSite', () => {
      void vscode.env.openExternal(vscode.Uri.parse('https://promptspend.com/data'));
    }),

    vscode.commands.registerCommand('promptspend.estimateSelection', () =>
      estimateSelectionCommand(service).catch((cause: unknown) => {
        reportFailure('estimateSelection', cause);
        void vscode.window.showErrorMessage(
          'PromptSpend could not cost the selection. See the PromptSpend log.',
        );
      }),
    ),

    vscode.commands.registerCommand('promptspend.showLog', () => log.show()),

    vscode.commands.registerCommand('promptspend.scanWorkspace', () =>
      vscode.window
        .withProgress(
          {
            location: vscode.ProgressLocation.Window,
            title: 'PromptSpend: scanning workspace',
            cancellable: true,
          },
          (_progress, token) => tree.scan(token),
        )
        .then(undefined, (cause: unknown) => reportFailure('scanWorkspace', cause)),
    ),

    // Someone whose catalog fetch failed should not have to close the window to
    // try again. The six-hour interval is right for the happy path and much too
    // long to wait out after a dropped connection.
    vscode.commands.registerCommand('promptspend.refresh', () => {
      service.reset();
      log.appendLine('[refresh] catalog cache cleared by request');
      safeRefresh(vscode.window.activeTextEditor);
    }),
  );

  log.appendLine(
    `[activate] PromptSpend v${__EXTENSION_VERSION__} ready. Catalog: ${CATALOG_URL}. ` +
      `Active editor: ${vscode.window.activeTextEditor?.document.languageId ?? 'none'}`,
  );
  safeRefresh(vscode.window.activeTextEditor);
}

/**
 * Cost the selected text against the models this file already uses.
 *
 * Taking the models from the file rather than asking is the whole point: the
 * question is almost always "what does this prompt cost on the models I am
 * already calling", and a picker in front of that is a step for nothing. When
 * the file names none, it falls back to asking.
 */
async function estimateSelectionCommand(service: PricingService): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showInformationMessage('PromptSpend: open a file and select some prompt text first.');
    return;
  }

  const selected = editor.document.getText(editor.selection);
  if (selected.trim().length === 0) {
    void vscode.window.showInformationMessage('PromptSpend: select the prompt text you want costed.');
    return;
  }

  const { matches, state } = await service.scan(editor.document.getText());
  if (state.status !== 'ready') {
    void vscode.window.showWarningMessage(`PromptSpend: ${state.reason}`);
    return;
  }

  const models = await chooseModels(
    matches.map((m) => m.model),
    state.catalog.primaryModels,
  );
  if (models.length === 0) return;

  const rows = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: 'PromptSpend: counting tokens' },
    () => estimateSelection(selected, models),
  );

  const picked = await vscode.window.showQuickPick(
    rows.map((row) => ({ ...estimateRowText(row), row })),
    {
      title: `Input cost of the selection — ${rows.length} model${rows.length === 1 ? '' : 's'}`,
      placeHolder: 'Cheapest first. Pick one to open it in the estimator with these token counts.',
      matchOnDescription: true,
    },
  );

  if (picked) {
    void vscode.env.openExternal(vscode.Uri.parse(estimatorLink(picked.row.model.id, picked.row.tokens)));
  }
}

/** Models found in the file, deduplicated; otherwise a picker over the catalog. */
async function chooseModels(found: readonly Model[], fallback: readonly Model[]): Promise<Model[]> {
  const unique = [...new Map(found.map((m) => [m.id, m])).values()];
  if (unique.length > 0) return unique;

  const picked = await vscode.window.showQuickPick(
    fallback.map((model) => ({ label: model.displayName, description: model.id, model })),
    { title: 'No model ids in this file — choose what to cost against', canPickMany: true },
  );
  return picked?.map((p) => p.model) ?? [];
}

function updateStatusBar(item: vscode.StatusBarItem, service: PricingService, settings: Settings): void {
  if (!settings.showStatusBar) {
    item.hide();
    return;
  }
  const { text, tooltip, warning } = statusBarText(service.peek());
  item.text = text;
  item.tooltip = tooltip;
  item.backgroundColor = warning ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
  item.show();
}

export function deactivate(): void {
  // Everything disposable went into `context.subscriptions`.
}
