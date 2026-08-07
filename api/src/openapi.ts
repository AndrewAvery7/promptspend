/**
 * The OpenAPI description, generated from the origin the request arrived on.
 *
 * Hard-coding the server URL would break the moment this Worker ran anywhere
 * else — a `workers.dev` preview, a staging hostname, `wrangler dev` on
 * localhost — and the failure is the worst kind: generated clients would
 * silently point at production.
 */
export function openApiDocument(origin: string): unknown {
  const model = {
    type: 'object',
    required: ['id', 'providerId', 'displayName', 'status', 'contextWindow', 'pricing', 'provenance'],
    properties: {
      id: { type: 'string', example: 'claude-opus-5' },
      providerId: { type: 'string', example: 'anthropic' },
      displayName: { type: 'string', example: 'Claude Opus 5' },
      status: { type: 'string', enum: ['current', 'legacy', 'deprecated'] },
      aliasOf: {
        type: 'string',
        description: 'Present when this id is a routing alias for another entry.',
      },
      contextWindow: { type: 'integer', example: 1_000_000 },
      maxOutput: { type: 'integer', example: 128_000 },
      releaseDate: { type: 'string', format: 'date' },
      capabilityIndex: {
        type: 'number',
        description: 'Rough 0–100 estimate. Absent means unscored; do not substitute a number.',
      },
      pricing: {
        type: 'object',
        required: ['input', 'output'],
        description: 'USD per 1,000,000 tokens.',
        properties: {
          input: { type: 'number', example: 5 },
          output: { type: 'number', example: 25 },
          cachedInput: { type: 'number' },
          cacheWrite: { type: 'number' },
          batchDiscount: { type: 'number', description: 'Multiplier, e.g. 0.5 for half price.' },
          intro: { type: 'object', description: 'Promotional rates, with the date they lapse.' },
          longContext: {
            type: 'object',
            description:
              'Rates that replace the base ones once a single request exceeds thresholdTokens. The whole request is billed at these rates, not just the excess.',
          },
        },
      },
      capabilities: {
        type: 'object',
        properties: { reasoning: { type: 'boolean' }, vision: { type: 'boolean' } },
      },
      tokenizer: {
        type: 'object',
        description: 'Either an exact tiktoken encoding or a characters-per-token estimate.',
      },
      provenance: {
        type: 'object',
        required: ['source', 'lastVerified'],
        properties: {
          source: { type: 'string', enum: ['vendor', 'litellm', 'openrouter'] },
          lastVerified: { type: 'string', format: 'date' },
          lastChanged: { type: 'string', format: 'date' },
          verifiedUrl: { type: 'string', format: 'uri' },
          needsReview: { type: 'boolean' },
          stale: { type: 'boolean' },
        },
      },
    },
  };

  const freshnessHeaders = {
    'X-PromptSpend-Generated-At': {
      schema: { type: 'string', format: 'date-time' },
      description: 'When the underlying catalog was generated.',
    },
    'X-PromptSpend-Stale': {
      schema: { type: 'string', enum: ['true'] },
      description: 'Present only when the origin was unreachable and a retained copy was served.',
    },
  };

  const listParams = [
    {
      name: 'provider',
      in: 'query',
      schema: { type: 'string' },
      description: 'Restrict to one provider id, e.g. `anthropic`.',
    },
    {
      name: 'status',
      in: 'query',
      schema: { type: 'string', enum: ['current', 'legacy', 'deprecated'] },
    },
    {
      name: 'aliases',
      in: 'query',
      schema: { type: 'string', enum: ['include', 'exclude'], default: 'exclude' },
      description: 'Routing aliases are excluded by default so one product is not counted twice.',
    },
  ];

  return {
    openapi: '3.1.0',
    info: {
      title: 'PromptSpend Pricing API',
      version: '1.0.0',
      summary: 'Current published API prices for large language models.',
      description: [
        'A read-only, unauthenticated, CORS-open view of the pricing catalog behind promptspend.com.',
        '',
        'The catalog is re-checked every morning against each vendor and two independent third-party',
        'sources; every row records which source it came from and when it was last confirmed. Prices are',
        'standard-tier, global-endpoint list prices in USD per 1,000,000 tokens. Regional premiums,',
        'priority tiers, server-side tool fees and negotiated discounts are not included.',
        '',
        'No key, no rate limit, no logging of who calls it. Attribution is appreciated, not required.',
      ].join('\n'),
      license: { name: 'MIT', url: 'https://github.com/AndrewAvery7/promptspend/blob/main/LICENSE' },
      contact: { name: 'PromptSpend', url: 'https://github.com/AndrewAvery7/promptspend' },
    },
    servers: [{ url: origin }],
    paths: {
      '/v1/models': {
        get: {
          summary: 'Every model, in full',
          operationId: 'listModels',
          parameters: listParams,
          responses: {
            '200': {
              description: 'The catalog.',
              headers: freshnessHeaders,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      generatedAt: { type: 'string', format: 'date-time' },
                      count: { type: 'integer' },
                      models: { type: 'array', items: model },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/v1/models/{id}': {
        get: {
          summary: 'One model',
          operationId: 'getModel',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'The model.',
              headers: freshnessHeaders,
              content: { 'application/json': { schema: model } },
            },
            '404': { description: 'No model with that id.' },
          },
        },
      },
      '/v1/providers': {
        get: {
          summary: 'Every provider, with a model count',
          operationId: 'listProviders',
          responses: { '200': { description: 'The providers.', headers: freshnessHeaders } },
        },
      },
      '/v1/prices': {
        get: {
          summary: 'Flat price rows — the numbers and nothing else',
          operationId: 'listPrices',
          parameters: listParams,
          responses: {
            '200': {
              description:
                'One row per model. `input` and `output` are the rates in force today: where a ' +
                'promotional rate applies it is quoted here, and `promotionalUntil`, ' +
                '`standardInput` and `standardOutput` say when it lapses and what follows. Those ' +
                'three are null otherwise. Use /v1/models for the full pricing object.',
              headers: freshnessHeaders,
            },
          },
        },
      },
      '/v1/prices.csv': {
        get: {
          summary: 'The same rows as CSV, for a spreadsheet',
          operationId: 'listPricesCsv',
          parameters: listParams,
          responses: {
            '200': {
              description:
                'CSV, RFC 4180. Same columns as /v1/prices, in the order listed there; the three ' +
                'promotional columns are appended last so a positional reader is unaffected.',
              content: { 'text/csv': { schema: { type: 'string' } } },
            },
          },
        },
      },
      '/v1/health': {
        get: {
          summary: 'Whether this API can see a valid, current catalog',
          operationId: 'health',
          responses: {
            '200': { description: 'Healthy.' },
            '503': { description: 'The catalog could not be read or did not validate.' },
          },
        },
      },
    },
  };
}
