/**
 * The tool manifest — and the thing the footprint budget measures.
 *
 * Every word here is loaded into the model's context on every single turn, for
 * as long as the server is connected. That is the cost this server is trying not
 * to impose, so descriptions are written to be the shortest text that still
 * prevents misuse, not the most thorough.
 *
 * Kept in its own module so `tools/check-footprint.ts` can measure exactly what
 * ships without booting a server or reaching the network.
 */

export const TOOLS = [
  {
    name: 'get_price',
    description:
      'Current list price for one LLM, with the source and the date it was last confirmed. Returns disputed=true when two sources disagree.',
    inputSchema: {
      type: 'object',
      properties: {
        model_name: { type: 'string', description: 'Model id or name, e.g. gpt-5 or "Claude Opus 5".' },
      },
      required: ['model_name'],
    },
  },
  {
    name: 'estimate_cost',
    description:
      'What a described workload actually costs per month on each model. Accounts for conversation history compounding, cache writes, long-context tiers and reasoning tokens. Use this instead of multiplying prices by hand.',
    inputSchema: {
      type: 'object',
      properties: {
        models: {
          type: 'array',
          items: { type: 'string' },
          description: 'Models to compare, up to about 8.',
        },
        system_tokens: { type: 'number', description: 'System prompt size. Default 800.' },
        user_tokens: { type: 'number', description: 'Typical user message. Default 150.' },
        output_tokens: { type: 'number', description: 'Typical reply. Default 350.' },
        turns: { type: 'number', description: 'Turns per conversation. Default 4.' },
        conversations_per_day: { type: 'number', description: 'Default 1000.' },
        cached_input_share: { type: 'number', description: '0-1. Default 0.' },
        reasoning_multiplier: { type: 'number', description: 'Bill output at this multiple. Default 1.' },
        use_batch_api: { type: 'boolean', description: 'Apply batch discounts. Default false.' },
      },
      required: ['models'],
    },
  },
  {
    name: 'find_cheaper',
    description:
      'Cheaper models that score at or above the given one on capability, costed on the same workload. Returns candidates to test, not a recommendation.',
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'The model currently in use.' },
        min_capability: { type: 'number', description: '0-100. Defaults to the given model’s score.' },
        system_tokens: { type: 'number' },
        user_tokens: { type: 'number' },
        output_tokens: { type: 'number' },
        turns: { type: 'number' },
        conversations_per_day: { type: 'number' },
      },
      required: ['model'],
    },
  },
] as const;

export const SERVER_INFO = {
  name: 'promptspend',
  // Kept in step with package.json by a test, because nothing else does it.
  // 0.1.2 shipped reporting 0.1.1 from both `--version` and the MCP handshake:
  // the package version was bumped and this literal was not, and every gate
  // passed because none of them compared the two. A server that misreports its
  // own version is the same defect this project exists to catch, one level up.
  version: '0.1.6',
} as const;

export const INSTRUCTIONS =
  'LLM pricing that shows its work. Every price carries its source and the date it was ' +
  'last confirmed; disputed prices are marked rather than hidden. When relaying a price, ' +
  'state the confirmation date — these numbers move.';
