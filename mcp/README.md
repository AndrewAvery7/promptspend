# @promptspend/mcp

[![PromptSpend MCP on mcprush](https://mcprush.com/badge/promptspend-mcp/score.svg)](https://mcprush.com/to/promptspend-mcp?ref=badge)

**LLM pricing for coding agents — every price carries its source and the date it
was last confirmed.**

There are already MCP servers that will tell you what a model costs. This one
tells you where the number came from, when it was last checked, and which numbers
two sources disagree about. And it will cost a described workload rather than
just quoting a rate, because the arithmetic between "$3 per million tokens" and
"$4,955 a month" is where nearly every estimate goes wrong.

```bash
claude mcp add promptspend -- npx -y @promptspend/mcp
```

No API key. No account. MIT.

---

## Why another pricing server

**Every price comes with its paperwork.**

```jsonc
// Real output, not an illustration: `get_price` for gpt-5 on 2026-08-03.
{
  "model": "gpt-5",
  "input_per_million_usd": 1.25,
  "output_per_million_usd": 10,
  "provenance": {
    "source": "vendor",
    "source_description": "Hand-verified against the provider's own published pricing page.",
    "last_verified": "2026-08-03",
    "disputed": false,
    "upstream_stale": false,
    "confidence": "Confirmed against the provider's own pricing page on 2026-08-03.",
    "verified_url": "https://developers.openai.com/api/docs/pricing",
  },
}
```

`last_verified` moves as rows are re-read, so the date here will age; the shape
will not. What is worth checking is that the block is present at all — a price
without one is a price you cannot audit.

That matters more to an agent than to a person. Someone reading a web page sees
the interface around the number and forms their own view of how much to trust it.
A model handed a bare figure has nothing, and will repeat it with whatever
confidence the phrasing implies. Given the date and the source it can say _"as of
1 August, per OpenAI's pricing page"_ instead of stating a number as though it
were timeless.

**And it says when it does not know.** Where two sources disagree and no human
has adjudicated, the response is marked `disputed: true` with both figures,
rather than quietly picking one:

```
DISPUTED — two sources disagree on this price and no human has adjudicated it.
The figure shown is the primary feed's number, last confirmed 2026-08-02.
Treat it as indicative and say so.
```

## The tool a price lookup cannot provide

`estimate_cost` runs [promptspend.com](https://promptspend.com)'s own cost
engine — imported, not reimplemented, so a number this server reports and a
number the website shows **cannot** drift apart. A test asserts it.

It accounts for the things hand-rolled estimates miss:

- **Conversation history compounds.** Turn _N_ re-sends turns 1…*N*−1 as input,
  so cost grows with the square of the turn count.
- **Cache _writes_ cost more than input** — 1.25× at both OpenAI and Anthropic.
  Counting only the cheaper reads reports a saving your invoice will not have.
- **Long-context tiers apply per request**, not per conversation.
- **Reasoning tokens are billable** even though you never see them.
- **Output is priced separately**, typically 3–5× input.

> _"What would a support assistant cost at 4,000 conversations a day on GPT-5
> versus DeepSeek V3.2?"_

## Context footprint

MCP tool definitions are loaded into your context on **every turn**, for as long
as the server is connected. A heavy server can add thousands of tokens to every
message, which is why the advice going round is to prefer a CLI for read-only
data.

A pricing server that quietly taxes every turn, to tell you about token costs,
would be an easy and deserved joke. So:

> **This server adds ~897 tokens per turn.** Three tools, short descriptions,
> budgeted at 1,200 and checked in CI by `npm run check:footprint`.

If that number ever stops being true, the build fails — the README figure is
asserted against the actual manifest, not typed once and trusted.

## Tools

| Tool            | What it answers                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `get_price`     | What does this model cost, and how much should I trust that? With `as_of`, what did it cost then? |
| `estimate_cost` | What will _my_ workload cost per month on each? With `usage`, what would these totals have cost?  |
| `find_cheaper`  | What could I test that is cheaper and not obviously worse?                                        |

**`get_price` with `as_of: "2026-09-15"`** returns the rate PromptSpend published
on that UTC day, read from the [price history](../docs/PRICE_HISTORY.md) — useful
for checking an old invoice. A day before PromptSpend began tracking the model is
answered "not tracked", never with the first rate seen, and a later **correction**
(PromptSpend had been reading the wrong page) is returned with the figure, so an
agent does not present a misreading as what the vendor charged.

**`estimate_cost` with `usage`** prices measured totals — say a month from a usage
export — instead of a described workload:
`{ "input": 1200000, "output": 300000, "cache_read": 4000000, "cache_write": 200000 }`,
where `input` excludes cache reads. A model without a published cache rate is
billed at its full input rate (and the response says so), and a model with a
long-context tier is flagged, because totals cannot show which requests crossed it.

`find_cheaper` returns **candidates to test, never a recommendation** — the
capability index behind it is an illustrative estimate, not a benchmark, and the
response says so.

## Install

**Claude Code**

```bash
claude mcp add promptspend -- npx -y @promptspend/mcp
```

**Cursor / Claude Desktop / Windsurf** — in `mcp.json`:

```json
{ "mcpServers": { "promptspend": { "command": "npx", "args": ["-y", "@promptspend/mcp"] } } }
```

**No install — hosted** at `https://promptspend.dev/mcp`. Same tools, same answers, imported from this
package rather than copied. In Claude.ai or ChatGPT, add it as a custom connector with that URL; in
Claude Code:

```bash
claude mcp add --transport http promptspend https://promptspend.dev/mcp
```

The hosted server receives your tool arguments (a model name, a workload's token counts) to answer
them, and stores none of them; it needs no key or account. Like the rest of the pricing API at
promptspend.dev, it has Cloudflare's request logging switched on: each entry records the time, the
address (`/mcp`), request headers and connection details such as an IP address, kept for up to seven
days. PromptSpend's code never logs the arguments themselves. Run the npm package instead if a
workload description should never leave your machine.

**Or as an Agent Skill**, which costs context only when a price question comes up rather than on every
turn: see [skills/](../skills/README.md).

## What it will not do

- **It will not pass off a stale price as current.** The catalog is fetched,
  never bundled. A retained copy may be used for at most 24 hours when the live
  file cannot be reached, and every affected tool response carries an explicit
  `catalog_status` warning written for the agent to relay. Past that bounded
  grace period, the tools return an error rather than an old number.
- **It has no benchmarks, latency or endpoint data.** Other servers do. Three
  tools is a deliberate choice about your context budget.
- **It has no telemetry.** Neither the npm package nor the hosted endpoint sends
  analytics or usage reports, and neither needs a key or an account. The hosted
  endpoint's request logging is described under Install.

## Scope of the prices

Standard-tier, global-endpoint list prices in USD. Not modelled: regional and
data-residency premiums, priority tiers, server-side tool-call fees, fine-tuning,
and negotiated or committed-use discounts.

---

The same catalog is also in free native apps for
[iPhone and iPad](https://apps.apple.com/app/id6800386428) and
[Android](https://play.google.com/store/apps/details?id=com.promptspend.app).

Part of [PromptSpend](https://github.com/AndrewAvery7/promptspend) — MIT.
Found a wrong price? That is the most serious class of bug this project can have.
[Open an issue.](https://github.com/AndrewAvery7/promptspend/issues)
