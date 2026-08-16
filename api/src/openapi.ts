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
    required: [
      'id',
      'providerId',
      'displayName',
      'status',
      'contextWindow',
      'pricing',
      'tokenizer',
      'capabilities',
      'provenance',
    ],
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
          cacheStoragePerMillionTokenHour: {
            type: 'number',
            description: 'Separate cache-residency charge; not included in token-only estimates.',
          },
          batchDiscount: { type: 'number', description: 'Multiplier, e.g. 0.5 for half price.' },
          intro: {
            type: 'object',
            required: ['input', 'output', 'until'],
            description: 'Promotional rates, valid through the named UTC date.',
            properties: {
              input: { type: 'number' },
              output: { type: 'number' },
              cachedInput: { type: 'number' },
              cacheWrite: { type: 'number' },
              until: { type: 'string', format: 'date' },
            },
          },
          longContext: {
            type: 'object',
            required: ['thresholdTokens', 'input', 'output'],
            description:
              'Rates that replace the base ones once a single request exceeds thresholdTokens. The whole request is billed at these rates, not just the excess.',
            properties: {
              thresholdTokens: { type: 'integer' },
              input: { type: 'number' },
              output: { type: 'number' },
              cachedInput: { type: 'number' },
              cacheWrite: { type: 'number' },
            },
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
          reviewNote: { type: 'string' },
          reviewCodes: { type: 'array', items: { type: 'string' } },
          stale: { type: 'boolean' },
          statusBeforeStale: {
            type: 'string',
            enum: ['current', 'legacy', 'deprecated'],
            description: 'Original status retained while an upstream-missing row is demoted.',
          },
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
      description:
        'Present when a retained copy is served, the catalog exceeds the 48-hour ceiling, or the sync manifest is degraded.',
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
  const commonErrors = {
    '405': { description: 'Only GET and HEAD are supported.' },
    '503': { description: 'The catalog could not be read or is outside the freshness contract.' },
  };
  const priceRow = {
    type: 'object',
    required: [
      'id',
      'provider',
      'displayName',
      'input',
      'output',
      'cachedInput',
      'cacheWrite',
      'cacheStoragePerMillionTokenHour',
      'contextWindow',
      'maxOutput',
      'status',
      'lastVerified',
      'promotionalUntil',
      'standardInput',
      'standardOutput',
    ],
    properties: {
      id: { type: 'string' },
      provider: { type: 'string' },
      displayName: { type: 'string' },
      input: { type: 'number' },
      output: { type: 'number' },
      cachedInput: { type: ['number', 'null'] },
      cacheWrite: { type: ['number', 'null'] },
      cacheStoragePerMillionTokenHour: { type: ['number', 'null'] },
      contextWindow: { type: 'integer' },
      maxOutput: { type: ['integer', 'null'] },
      status: { type: 'string' },
      lastVerified: { type: 'string', format: 'date' },
      promotionalUntil: { type: ['string', 'null'], format: 'date' },
      standardInput: { type: ['number', 'null'] },
      standardOutput: { type: ['number', 'null'] },
    },
  };

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
            '400': { description: 'A filter value is invalid.' },
            ...commonErrors,
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
            '400': { description: 'The model id is not valid URL encoding.' },
            ...commonErrors,
          },
        },
      },
      '/v1/providers': {
        get: {
          summary: 'Every provider, with a model count',
          operationId: 'listProviders',
          responses: {
            '200': {
              description: 'The providers.',
              headers: freshnessHeaders,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      generatedAt: { type: 'string', format: 'date-time' },
                      count: { type: 'integer' },
                      providers: { type: 'array', items: { type: 'object' } },
                    },
                  },
                },
              },
            },
            ...commonErrors,
          },
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
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      generatedAt: { type: 'string', format: 'date-time' },
                      unit: { type: 'string' },
                      count: { type: 'integer' },
                      prices: { type: 'array', items: priceRow },
                    },
                  },
                },
              },
            },
            '400': { description: 'A filter value is invalid.' },
            ...commonErrors,
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
            '400': { description: 'A filter value is invalid.' },
            ...commonErrors,
          },
        },
      },
      '/v1/health': {
        get: {
          summary: 'Whether this API can see a valid, current catalog',
          operationId: 'health',
          responses: {
            '200': { description: 'Healthy.' },
            ...commonErrors,
          },
        },
      },
    },
  };
}
