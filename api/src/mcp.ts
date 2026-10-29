/**
 * `POST /mcp` — the same MCP server as `@promptspend/mcp`, hosted.
 *
 * The npm package needs a terminal and Node. This endpoint needs neither: a
 * Claude.ai or ChatGPT user pastes `https://promptspend.dev/mcp` as a custom
 * connector and is done. Same tools, same descriptions, same answers — the
 * manifest and the tool functions are imported from `mcp/src`, not copied, so
 * the two cannot drift apart any more than the API and the site can.
 *
 * Streamable HTTP, stateless, JSON responses only. Every tool is a read of one
 * public file, so there is nothing to stream and no session worth keeping:
 * no `Mcp-Session-Id` is issued, `GET` (the optional server-to-client stream)
 * is declined with 405 as the spec allows, and each POST stands alone.
 */
import { Catalog } from '../../src/lib/pricing/catalog';
import { INSTRUCTIONS, SERVER_INFO, TOOLS } from '../../mcp/src/schema';
import {
  estimateCost,
  findCheaper,
  getPrice,
  type CheaperInput,
  type EstimateInput,
} from '../../mcp/src/tools';
import { readCatalog } from './catalog';
import type { Env } from './env';
import { corsHeaders } from './http';

/** Newest first. A client asking for one of these gets it back; anything else gets the newest. */
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

interface RpcRequest {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

type RpcId = string | number | null;

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...corsHeaders(),
    // POST and DELETE on top of the read-only API's GET/HEAD; the MCP client
    // sends its protocol version as a header, which a browser must be allowed to.
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID',
    'Cache-Control': 'no-store',
    ...extra,
  };
}

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: headers({ 'Content-Type': 'application/json; charset=utf-8' }),
  });
}

function rpcError(id: RpcId, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

/** Answer one tools/call. Tool failures are results with isError, not protocol errors — the spec's split. */
async function callTool(params: unknown, env: Env, ctx: ExecutionContext) {
  const { name, arguments: rawArgs } = (params ?? {}) as { name?: unknown; arguments?: unknown };
  const args = (rawArgs && typeof rawArgs === 'object' ? rawArgs : {}) as Record<string, unknown>;
  if (typeof name !== 'string' || !TOOLS.some((t) => t.name === name)) return null;

  let read;
  try {
    read = await readCatalog(env, ctx);
  } catch {
    return {
      content: [
        {
          type: 'text',
          text: 'promptspend: the pricing catalog could not be read right now. Try again shortly.',
        },
      ],
      isError: true,
    };
  }

  const catalog = new Catalog(read.catalog);
  const generatedAt = read.catalog.generatedAt;
  let result: unknown;
  try {
    switch (name) {
      case 'get_price':
        result = getPrice(catalog, generatedAt, typeof args.model_name === 'string' ? args.model_name : '');
        break;
      case 'estimate_cost':
        result = estimateCost(catalog, generatedAt, args as unknown as EstimateInput);
        break;
      default:
        result = findCheaper(catalog, generatedAt, args as unknown as CheaperInput);
    }
  } catch (error) {
    return {
      content: [
        { type: 'text', text: `promptspend: ${error instanceof Error ? error.message : String(error)}` },
      ],
      isError: true,
    };
  }

  // Same rule as the npm server: a copy past its window is labelled, never passed off as current.
  const ageHours = (Date.now() - Date.parse(generatedAt)) / 3.6e6;
  if ((read.stale || ageHours > 48) && typeof result === 'object' && result !== null) {
    result = {
      ...result,
      catalog_status: {
        served_from: 'cached_or_delayed_copy',
        generated_at: generatedAt,
        warning:
          'The published catalog may be out of date. Say that the pricing sync may be delayed when relaying these rates.',
      },
    };
  }
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

/** One JSON-RPC message in, one response object out (or null for a notification). */
async function handle(message: RpcRequest, env: Env, ctx: ExecutionContext): Promise<object | null> {
  const isRequest = message.id !== undefined;
  const id: RpcId = typeof message.id === 'string' || typeof message.id === 'number' ? message.id : null;

  if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return isRequest ? rpcError(id, INVALID_REQUEST, 'Not a JSON-RPC 2.0 request.') : null;
  }
  // Notifications (no id) need no answer; `notifications/initialized` is the usual one.
  if (!isRequest) return null;

  switch (message.method) {
    case 'initialize': {
      const asked = (message.params as { protocolVersion?: unknown } | undefined)?.protocolVersion;
      const protocolVersion =
        typeof asked === 'string' && PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0];
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        },
      };
    }
    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };
    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
    case 'tools/call': {
      const result = await callTool(message.params, env, ctx);
      return result
        ? { jsonrpc: '2.0', id, result }
        : rpcError(id, INVALID_PARAMS, `Unknown tool. Available: ${TOOLS.map((t) => t.name).join(', ')}.`);
    }
    default:
      return rpcError(id, METHOD_NOT_FOUND, `Method not found: ${message.method}`);
  }
}

export async function mcpResponse(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: headers() });
  if (method !== 'POST') {
    // GET would open a server-to-client stream; this server never initiates
    // anything, so it declines, which the spec permits. DELETE ends a session,
    // and there are none.
    return new Response(
      JSON.stringify({ error: 'This MCP endpoint accepts POST only. Point an MCP client at this URL.' }),
      {
        status: 405,
        headers: headers({ 'Content-Type': 'application/json; charset=utf-8', Allow: 'POST, OPTIONS' }),
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply(rpcError(null, PARSE_ERROR, 'The request body is not valid JSON.'), 400);
  }

  if (Array.isArray(body)) {
    if (body.length === 0) return reply(rpcError(null, INVALID_REQUEST, 'Empty batch.'), 400);
    const answers = (await Promise.all(body.map((m) => handle((m ?? {}) as RpcRequest, env, ctx)))).filter(
      (a): a is object => a !== null,
    );
    return answers.length ? reply(answers) : new Response(null, { status: 202, headers: headers() });
  }

  const answer = await handle((body ?? {}) as RpcRequest, env, ctx);
  return answer ? reply(answer) : new Response(null, { status: 202, headers: headers() });
}
