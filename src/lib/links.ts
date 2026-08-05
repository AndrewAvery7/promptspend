/**
 * Where the catalog can be installed from, in one place.
 *
 * These are shown by the app (`src/config.ts` re-exports them) and written into
 * `llms.txt` at build time by `src/lib/seo/llms.ts`. A marketplace URL that
 * differs between the two is one that is wrong in at least one of them, which
 * is the same reasoning that put `MCP_INSTALL_COMMAND` in a single constant.
 *
 * They live here rather than in `src/config.ts` because that module reads
 * `import.meta.env` for the alerts origin and the base path. `scripts/build-pages.ts`
 * runs under plain Node, where `import.meta.env` is undefined and the first
 * property access throws — so the generator cannot import the app's config, and
 * a shared module with no environment access is what both sides can hold.
 */

/** The MCP server on npm. */
export const MCP_PACKAGE_URL = 'https://www.npmjs.com/package/@promptspend/mcp';

/**
 * The extension, on both marketplaces.
 *
 * The Marketplace is the route VS Code itself uses. Open VSX carries the same
 * build for the editors that cannot reach it — Cursor, Windsurf, VSCodium —
 * which between them are a large share of the people who are metered per token.
 */
export const VSCODE_MARKETPLACE_URL =
  'https://marketplace.visualstudio.com/items?itemName=promptspend.promptspend';
export const OPEN_VSX_URL = 'https://open-vsx.org/extension/promptspend/promptspend';

/** What to type in a terminal, for people who would rather not click. */
export const VSCODE_INSTALL_COMMAND = 'code --install-extension promptspend.promptspend';

/**
 * The MCP install command, in one place because it is shown in three — the
 * landing view, the Data & Alerts panel, and `llms.txt`.
 */
export const MCP_INSTALL_COMMAND = 'claude mcp add promptspend -- npx -y @promptspend/mcp';
