/**
 * The developer hub at the .dev apex.
 *
 * `docs/DOMAINS.md` sets one rule for this domain: it never hosts a copy of the
 * .com content. Two hosts serving the same words compete with each other and
 * split whatever either earns. So this page documents the API and nothing else,
 * links across to the calculator, and canonicalises to itself.
 *
 * Same discipline as the generated pages on .com — no JavaScript, one
 * stylesheet served from this Worker, and a policy tight enough to say so.
 */

export const DOCS_CSS = `:root{color-scheme:light dark;--bg:#ebeff5;--surface:#fff;--ink:#15181d;--muted:#5f6b78;--border:#dce2eb;--accent:#2456e6;--code:#f4f6fa}
@media (prefers-color-scheme:dark){:root{--bg:#0b0e14;--surface:#121722;--ink:#e9ecf2;--muted:#93a0b4;--border:#27303f;--accent:#7c9dff;--code:#1a2130}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%}
.wrap{max-width:56rem;margin:0 auto;padding:2.5rem 1.25rem 4rem}
a{color:var(--accent)}
h1{font-size:clamp(1.8rem,1.2rem+2.4vw,2.6rem);line-height:1.1;margin:0 0 .5rem;letter-spacing:-.02em}
h2{font-size:1.25rem;margin:2.5rem 0 .75rem}
h3{font-size:1rem;margin:1.5rem 0 .35rem;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.lede{color:var(--muted);font-size:1.05rem;margin:0 0 2rem}
.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:1.1rem 1.25rem;margin:0 0 1rem}
pre{background:var(--code);border:1px solid var(--border);border-radius:10px;padding:.9rem 1rem;overflow-x:auto;font-size:.86rem;line-height:1.5;margin:.5rem 0}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em}
p code,li code,td code{background:var(--code);padding:.1rem .35rem;border-radius:4px}
.tablewrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:.92rem}
th,td{text-align:left;padding:.55rem .7rem;border-bottom:1px solid var(--border);vertical-align:top}
th{color:var(--muted);font-weight:600;white-space:nowrap}
tbody tr:last-child td{border-bottom:0}
.muted{color:var(--muted)}
.tight-top{margin-top:0}
.tight-bottom{margin-bottom:0}
ul{padding-left:1.15rem}
footer{margin-top:3rem;padding-top:1.25rem;border-top:1px solid var(--border);color:var(--muted);font-size:.88rem}
footer a{color:var(--muted)}
`;

const ENDPOINTS: [string, string][] = [
  ['GET /v1/models', 'Every model in full — rates, context window, tokenizer, capabilities, provenance.'],
  ['GET /v1/models/{id}', 'One model. 404 if the id is unknown.'],
  ['GET /v1/providers', 'Every provider, with how many models each publishes.'],
  [
    'GET /v1/prices',
    'Flat rows: id, provider, input, output, cache rates, context window. The numbers only.',
  ],
  ['GET /v1/prices.csv', 'The same rows as CSV, for a spreadsheet.'],
  ['GET /v1/health', 'Whether this API can currently read and validate the catalog.'],
  ['GET /openapi.json', 'OpenAPI 3.1 description of everything above.'],
  ['GET /llms.txt', 'The same, in the form an agent reads first.'],
];

export function docsPage(origin: string, siteOrigin: string): string {
  const rows = ENDPOINTS.map(
    ([endpoint, description]) =>
      `            <tr><td><code>${endpoint}</code></td><td class="muted">${description}</td></tr>`,
  ).join('\n');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PromptSpend Pricing API — free, keyless LLM price data</title>
    <meta name="description" content="A free, keyless, CORS-open JSON API for current LLM API prices, re-checked against the vendors every morning. OpenAPI described, MIT licensed." />
    <meta name="color-scheme" content="light dark" />
    <link rel="canonical" href="${origin}/" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="PromptSpend" />
    <meta property="og:url" content="${origin}/" />
    <meta property="og:title" content="PromptSpend Pricing API" />
    <meta property="og:description" content="Free, keyless JSON API for current LLM API prices. Re-checked every morning; every row shows its source." />
    <link rel="stylesheet" href="/style.css" />
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 26'%3E%3Crect x='1.5' y='1.5' width='23' height='23' rx='6' fill='none' stroke='%232456E6' stroke-width='2'/%3E%3Cpath d='M7 9.5h12M7 13.5h8M7 17.5h10' stroke='%232456E6' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E" />
  </head>
  <body>
    <div class="wrap">
      <main>
        <h1>PromptSpend Pricing API</h1>
        <p class="lede">
          Current published API prices for every language model this catalog tracks, as JSON. No key, no
          account, no rate limit,
          no logging of who calls it. Re-checked against every vendor each morning, and every row tells you
          where its number came from and when it was last confirmed.
        </p>

        <div class="card">
          <p class="tight-top"><strong>Try it</strong></p>
          <pre><code>curl ${origin}/v1/prices</code></pre>
          <p class="muted tight-bottom">
            Or from a browser, from any origin — CORS is open on every endpoint.
          </p>
        </div>

        <h2>Endpoints</h2>
        <div class="card tablewrap">
          <table>
            <thead><tr><th>Endpoint</th><th>Returns</th></tr></thead>
            <tbody>
${rows}
            </tbody>
          </table>
        </div>
        <p class="muted">
          <code>/v1/models</code>, <code>/v1/prices</code> and <code>/v1/prices.csv</code> all accept
          <code>?provider=</code>, <code>?status=</code> and <code>?aliases=include</code>.
          Routing aliases are excluded by default, so one purchasable model is never counted twice.
        </p>

        <h2>What a price means</h2>
        <ul>
          <li>All rates are <strong>USD per 1,000,000 tokens</strong>.</li>
          <li>Standard tier, global endpoint, list price. Regional and data-residency premiums, priority
              tiers, server-side tool fees and negotiated discounts are <em>not</em> included.</li>
          <li><code>longContext</code>, where present, replaces the base rates for a request above its
              threshold — the <em>whole</em> request, not just the excess.</li>
          <li><code>batchDiscount</code> is a multiplier: <code>0.5</code> means half price.</li>
          <li><code>capabilityIndex</code> is a rough estimate and is absent when unscored. Do not
              substitute a number for a missing one.</li>
        </ul>

        <h2>Freshness</h2>
        <p>
          Every response carries <code>X-PromptSpend-Generated-At</code>, and the JSON body repeats it as
          <code>generatedAt</code>. Responses are cached for five minutes at the edge. If the origin is
          unreachable, a retained copy is served with <code>X-PromptSpend-Stale: true</code> rather than an
          error — stale and labelled beats absent, but nothing here is ever undated.
        </p>
        <p>
          Per model, <code>provenance.lastVerified</code> is when the price was last confirmed against its
          source and <code>provenance.lastChanged</code> is when the published rate last actually moved.
          <code>provenance.needsReview</code> means two independent sources disagreed and a human has not
          adjudicated yet — treat those rows with suspicion, which is why they are flagged rather than
          hidden.
        </p>
        <p>
          <code>lastChanged</code> is <strong>absent</strong> until a rate is observed to move, and it is
          absent on every model today. That is deliberate. This catalog's recorded history begins on
          2026-08-01 and no vendor has moved a price since, so there is no date to report — and a field
          that quietly reported the last sync instead would say "changed today" every morning, which is
          the one failure a provenance API cannot afford. Treat its absence as "no change on record",
          never as "unknown freshness": <code>lastVerified</code> answers that question, and it is always
          present.
        </p>

        <h2>Example</h2>
        <pre><code>$ curl -s ${origin}/v1/models/claude-opus-5 | jq '{id, pricing, provenance}'
{
  "id": "claude-opus-5",
  "pricing": {
    "input": 5,
    "output": 25,
    "cachedInput": 0.5,
    "cacheWrite": 6.25,
    "batchDiscount": 0.5
  },
  "provenance": {
    "source": "vendor",
    "lastVerified": "2026-08-01",
    "verifiedUrl": "https://platform.claude.com/docs/en/about-claude/pricing"
  }
}</code></pre>

        <h2>Inside a coding agent</h2>
        <p>
          The same data, as an MCP server. Every price it returns carries the source and the date it
          was last confirmed, and disputed prices are marked rather than quietly resolved &mdash;
          which matters more to a model than to a person. Someone reading this page can see the
          interface around a number and judge it. A model handed a bare figure repeats it with
          whatever confidence the sentence implies.
        </p>
        <pre><code>$ claude mcp add promptspend -- npx -y @promptspend/mcp</code></pre>
        <p>
          Three tools, deliberately. <code>estimate_cost</code> is the one a price lookup cannot
          provide: it runs this site's own cost engine, so it accounts for conversation history
          compounding, cache writes costing more than input, long-context tiers and reasoning
          tokens &mdash; and cannot report a number that disagrees with
          <a href="${siteOrigin}/">the calculator</a>, because it is the same code.
        </p>
        <p>
          <strong>It adds about 700 tokens to your context per turn.</strong> Tool definitions load
          into every message for as long as a server is connected, so that figure is budgeted,
          checked in CI, and published here rather than left for you to discover.
          <a href="https://github.com/AndrewAvery7/promptspend/tree/main/mcp">Source and the measurement.</a>
        </p>

        <h2>Terms, such as they are</h2>
        <ul>
          <li>MIT licensed, like the project. Use it in anything, including commercially.</li>
          <li>Attribution is appreciated and not required. A link to
              <a href="${siteOrigin}/">promptspend.com</a> helps.</li>
          <li>No SLA. It is a Cloudflare Worker in front of a static file, which is about as reliable as
              free gets, but do not put it in a payment path.</li>
          <li><strong>These are list prices, not a quote.</strong> Check the vendor before you commit money
              to a number. Every row links to where it came from for exactly that reason.</li>
        </ul>

        <h2>Prefer a calculator?</h2>
        <p>
          <a href="${siteOrigin}/">promptspend.com</a> costs a real workload across every model in this
          catalog, and publishes a page per model at
          <a href="${siteOrigin}/models/">${siteOrigin.replace(/^https:\/\//, '')}/models/</a>.
        </p>
      </main>
      <footer>
        <p>
          <a href="${siteOrigin}/">Calculator</a> &middot;
          <a href="/openapi.json">OpenAPI</a> &middot;
          <a href="https://github.com/AndrewAvery7/promptspend">Source</a> &middot;
          <a href="mailto:info@promptspend.com">info@promptspend.com</a>
        </p>
      </footer>
    </div>
  </body>
</html>
`;
}

/** The agent-readable summary. Deliberately short: it is an index, not a manual. */
export function llmsTxt(origin: string, siteOrigin: string): string {
  return `# PromptSpend Pricing API

> Free, keyless, CORS-open JSON API for current large-language-model API prices.
> Re-checked against every vendor each morning. All rates are USD per 1,000,000
> tokens, standard tier, global endpoint, list price.

## Endpoints

- [All models](${origin}/v1/models): full catalog — rates, context window, tokenizer, capabilities, provenance
- [One model](${origin}/v1/models/claude-opus-5): a single entry by id
- [Providers](${origin}/v1/providers): every provider with a model count
- [Flat prices](${origin}/v1/prices): id, provider, input, output, cache rates, context window
- [Prices as CSV](${origin}/v1/prices.csv): the same rows, RFC 4180
- [Health](${origin}/v1/health): whether the catalog is readable and valid
- [OpenAPI 3.1](${origin}/openapi.json): machine-readable description of all of the above

## Filters

\`?provider=anthropic\`, \`?status=current\`, \`?aliases=include\`. Routing aliases are
excluded by default so one purchasable model is not counted twice.

## Caveats

- List prices only. Regional premiums, priority tiers, server-side tool fees and
  negotiated discounts are excluded.
- \`provenance.needsReview\` marks rows where two sources disagreed and no human has
  adjudicated. Do not present those as settled.
- \`capabilityIndex\` is a rough estimate and may be absent. Absent means unscored;
  do not substitute a number.
- No SLA, MIT licensed, attribution appreciated.

## MCP server

\`npx -y @promptspend/mcp\` exposes this catalog to Claude Code, Cursor and
Windsurf. Three tools; every price carries its source and confirmation date, and
disputed prices are marked. \`estimate_cost\` runs the calculator's own engine, so
it accounts for compounding conversation history, cache writes and long-context
tiers rather than returning a rate to multiply by hand. Adds ~700 tokens of
context per turn, measured and budgeted.

## Related

- [Calculator](${siteOrigin}/): cost a real workload across the whole catalog
- [Per-model pricing pages](${siteOrigin}/models/)
- [MCP server](https://github.com/AndrewAvery7/promptspend/tree/main/mcp)
- [Source](https://github.com/AndrewAvery7/promptspend)
`;
}
