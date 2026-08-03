#!/usr/bin/env node
/**
 * PromptSpend MCP server — stdio.
 *
 * Thin by design. All the pricing logic is the website's own engine, imported
 * rather than reimplemented, so a number this server reports and a number
 * promptspend.com shows cannot drift apart. That is not tidiness: a pricing tool
 * that disagrees with its own website is worse than no pricing tool, and a
 * reimplementation is how that happens.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { getCatalog, CatalogUnavailableError } from './catalog';
import { INSTRUCTIONS, SERVER_INFO, TOOLS } from './schema';
import { estimateCost, findCheaper, getPrice, type CheaperInput, type EstimateInput } from './tools';

export async function dispatch(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { catalog, generatedAt } = await getCatalog();
  switch (name) {
    case 'get_price':
      return getPrice(catalog, generatedAt, String(args.model_name ?? ''));
    case 'estimate_cost':
      return estimateCost(catalog, generatedAt, args as unknown as EstimateInput);
    case 'find_cheaper':
      return findCheaper(catalog, generatedAt, args as unknown as CheaperInput);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function main(): Promise<void> {
  const server = new Server(SERVER_INFO, {
    capabilities: { tools: {} },
    instructions: INSTRUCTIONS,
  });

  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await dispatch(name, (args ?? {}) as Record<string, unknown>);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      // An unreachable catalog is reported as a failure, never papered over with
      // a cached-but-old number. In an agent context a stale price is repeated
      // to the user with full confidence, which is the failure this project
      // exists to prevent.
      const message =
        error instanceof CatalogUnavailableError
          ? error.message
          : `promptspend: ${String(error instanceof Error ? error.message : error)}`;
      return { content: [{ type: 'text', text: message }], isError: true };
    }
  });

  await server.connect(new StdioServerTransport());
}

// Only run when executed directly, so the module can be imported by tests.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()!)) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
