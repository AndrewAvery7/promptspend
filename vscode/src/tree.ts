/**
 * The workspace view: every model this repository calls, and where.
 *
 * The sweep reads files with `workspace.fs.readFile` rather than
 * `openTextDocument`. Opening a document is how you get a `languageId` from the
 * editor, but it also allocates a full text model per file — on a large
 * repository that is thousands of them, held until VS Code decides otherwise.
 * Reading bytes and inferring the language from the extension costs nothing and
 * is what `languageIdForPath` exists for.
 */
import * as vscode from 'vscode';
import { PricingService } from './service';
import { SCAN_GLOB, languageIdForPath, shouldAnnotate, type Settings } from './config';
import { commentSyntaxFor } from './comments';
import {
  buildInventory,
  lineStartsOf,
  type Inventory,
  type ModelUsage,
  type Reference,
  type ScannedFile,
} from './inventory';
import { effectivePricing } from '@/lib/engine/cost';
import { formatRate } from '@/lib/engine/format';

/**
 * Most files the sweep will read.
 *
 * A ceiling rather than a guess at what is reasonable: some repositories are
 * enormous, and a view that quietly reads for a minute is worse than one that
 * stops and says it stopped. Whatever is dropped is counted and shown.
 */
const FILE_CAP = 2000;

/** Files above this size are skipped; a model id is never in a megabyte blob. */
const MAX_FILE_BYTES = 1_000_000;

type Node = ModelNode | ReferenceNode | NoticeNode;
interface ModelNode {
  kind: 'model';
  usage: ModelUsage;
}
interface ReferenceNode {
  kind: 'reference';
  reference: Reference;
}
interface NoticeNode {
  kind: 'notice';
  label: string;
  tooltip?: string;
}

export class WorkspaceCostProvider implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  private inventory: Inventory | null = null;
  private notice: string | null = 'Run "PromptSpend: Scan workspace" to see what this repository calls.';

  constructor(
    private readonly service: PricingService,
    private readonly settings: () => Settings,
  ) {}

  /** Sweep the workspace and rebuild the tree. */
  async scan(token?: vscode.CancellationToken): Promise<void> {
    const current = this.settings();
    const state = this.service.peek();

    const found = await vscode.workspace.findFiles(SCAN_GLOB, '**/node_modules/**', FILE_CAP + 1, token);
    const capped = found.length > FILE_CAP;
    const files = capped ? found.slice(0, FILE_CAP) : found;

    const scanned: ScannedFile[] = [];
    for (const uri of files) {
      if (token?.isCancellationRequested) return;

      const languageId = languageIdForPath(uri.path);
      if (languageId === undefined || !shouldAnnotate(languageId, current)) continue;

      let text: string;
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        if (bytes.byteLength > MAX_FILE_BYTES) continue;
        text = new TextDecoder().decode(bytes);
      } catch {
        // A file that vanished mid-sweep, or one we cannot read. Skipping it is
        // right; failing the whole sweep for it is not.
        continue;
      }

      const { matches } = await this.service.scan(text, {
        comments: current.annotateComments ? undefined : commentSyntaxFor(languageId),
      });
      if (matches.length === 0) continue;

      scanned.push({
        path: vscode.workspace.asRelativePath(uri),
        matches,
        lineStarts: lineStartsOf(text),
      });
    }

    if (state.status !== 'ready' && this.service.peek().status !== 'ready') {
      this.inventory = null;
      this.notice = 'Prices are unavailable, so nothing is being shown rather than shown wrong.';
    } else {
      this.inventory = buildInventory(scanned, capped ? found.length - FILE_CAP : 0);
      this.notice = null;
    }
    this.changed.fire(undefined);
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'notice') {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
      item.tooltip = node.tooltip;
      item.iconPath = new vscode.ThemeIcon('info');
      return item;
    }

    if (node.kind === 'model') {
      const { model, references, fileCount } = node.usage;
      const item = new vscode.TreeItem(model.displayName, vscode.TreeItemCollapsibleState.Collapsed);
      const rates = effectivePricing(model.pricing, new Date());
      item.description =
        `${formatRate(rates.input)} / ${formatRate(rates.output)} per M · ` +
        `${references.length} reference${references.length === 1 ? '' : 's'} in ` +
        `${fileCount} file${fileCount === 1 ? '' : 's'}`;
      item.tooltip = new vscode.MarkdownString(
        `\`${model.id}\`\n\nConfirmed ${model.provenance.lastVerified}` +
          (model.provenance.needsReview ? '\n\n⚠ This price is disputed.' : ''),
      );
      item.iconPath = new vscode.ThemeIcon(model.provenance.needsReview ? 'warning' : 'symbol-constant');
      item.contextValue = 'promptspend.model';
      return item;
    }

    const { path, line, written } = node.reference;
    const item = new vscode.TreeItem(path, vscode.TreeItemCollapsibleState.None);
    item.description = `line ${line + 1} · ${written}`;
    item.resourceUri = vscode.Uri.file(path);
    item.iconPath = vscode.ThemeIcon.File;
    item.command = {
      command: 'vscode.open',
      title: 'Open',
      arguments: [
        vscode.Uri.joinPath(vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file('.'), path),
        { selection: new vscode.Range(line, 0, line, 0) },
      ],
    };
    return item;
  }

  getChildren(node?: Node): Node[] {
    if (node === undefined) return this.roots();
    if (node.kind === 'model')
      return node.usage.references.map((reference) => ({ kind: 'reference', reference }));
    return [];
  }

  private roots(): Node[] {
    if (this.notice !== null) return [{ kind: 'notice', label: this.notice }];
    if (!this.inventory) return [];

    const { usage, filesScanned, filesSkipped } = this.inventory;
    if (usage.length === 0) {
      return [{ kind: 'notice', label: `No model ids found in ${filesScanned} scanned file(s).` }];
    }

    const nodes: Node[] = usage.map((u) => ({ kind: 'model', usage: u }));

    // Named, never silent. A sweep that stopped early and does not say so makes
    // the tree look like the whole picture when it is a sample.
    if (filesSkipped > 0) {
      nodes.push({
        kind: 'notice',
        label: `Stopped at ${FILE_CAP} files — ${filesSkipped} more not scanned`,
        tooltip:
          `This workspace has more matching files than the sweep will read in one pass. ` +
          `What is above is therefore a floor, not a total.`,
      });
    }
    return nodes;
  }
}
