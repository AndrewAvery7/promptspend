# @promptspend/mcp

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

> **This server adds ~700 tokens per turn.** Three tools, short descriptions,
> budgeted at 900 and checked in CI by `npm run check:footprint`.

If that number ever stops being true, the build fails — the README figure is
asserted against the actual manifest, not typed once and trusted.

## Tools

| Tool            | What it answers                                              |
| --------------- | ------------------------------------------------------------ |
| `get_price`     | What does this model cost, and how much should I trust that? |
| `estimate_cost` | What will _my_ workload actually cost per month on each?     |
| `find_cheaper`  | What could I test that is cheaper and not obviously worse?   |

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

## What it will not do

- **It will not serve you a stale price.** The catalog is fetched, never bundled,
  because a bundled one is only as current as the last publish. If it cannot be
  reached, the tools return an error rather than an old number — in an agent
  context a stale figure gets relayed with full confidence, which is the exact
  failure this project exists to prevent.
- **It has no benchmarks, latency or endpoint data.** Other servers do. Three
  tools is a deliberate choice about your context budget.
- **It does not track you.** No key, no account, no logging of who calls it —
  the same promise as [the API](https://promptspend.dev) it reads.

## Scope of the prices

Standard-tier, global-endpoint list prices in USD. Not modelled: regional and
data-residency premiums, priority tiers, server-side tool-call fees, fine-tuning,
and negotiated or committed-use discounts.

---

Part of [PromptSpend](https://github.com/AndrewAvery7/promptspend) — MIT.
Found a wrong price? That is the most serious class of bug this project can have.
[Open an issue.](https://github.com/AndrewAvery7/promptspend/issues)
