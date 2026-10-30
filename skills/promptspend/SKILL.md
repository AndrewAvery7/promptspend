---
name: promptspend
description: LLM API list prices with their source and last-confirmed date, past prices, and cost estimates that account for conversation history, caching, long-context tiers and reasoning tokens. Use when asked what a model costs, what it cost on a past date, what a workload or a month's usage would cost, or for a cheaper model.
---

# PromptSpend pricing

PromptSpend publishes LLM API list prices where every rate carries its source and
the date it was last confirmed, re-checked daily. These tools return the same
answers as the PromptSpend MCP server, without loading its tool definitions into
every turn: call them only when a price question comes up.

## How to call

One HTTP POST to the hosted server, no key and no account. Put the tool name and
its arguments in the body:

```bash
curl -s https://promptspend.dev/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_price","arguments":{"model_name":"gpt-5"}}}'
```

On Windows PowerShell, where `curl` is not curl:

```powershell
$body = '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_price","arguments":{"model_name":"gpt-5"}}}'
(Invoke-RestMethod https://promptspend.dev/mcp -Method Post -ContentType 'application/json' -Headers @{ Accept = 'application/json, text/event-stream' } -Body $body).result.content[0].text
```

The answer is JSON inside `result.content[0].text`. `result.isError: true` means
the tool could not answer; relay its text rather than guessing.

## Tools

**`get_price`** `{ "model_name": "gpt-5" }` — today's list price in USD per
million tokens, with its source and last-confirmed date. Add
`"as_of": "2026-09-15"` for the rate PromptSpend published on that day.

**`estimate_cost`** `{ "models": ["gpt-5", "claude-sonnet-5"] }` — monthly cost
of a workload on each model. Describe it with `system_tokens`, `user_tokens`,
`output_tokens`, `turns`, `conversations_per_day`, `cached_input_share` (0-1),
`reasoning_multiplier` and `use_batch_api`. Or price measured totals instead,
such as a month from a usage export:
`"usage": { "input": 1200000, "output": 300000, "cache_read": 4000000, "cache_write": 200000 }`,
where `input` excludes cache reads.

**`find_cheaper`** `{ "model": "gpt-5" }` — cheaper models that score at or above
it on PromptSpend's capability index, costed on the same workload. Optional
`min_capability` (0-100) and the same workload fields.

## Relaying the answers

- **State the last-confirmed date with every price.** These numbers move.
- When a result says `disputed`, a `warning` or a later `correction`, say so;
  do not present the figure as settled.
- Use `estimate_cost` rather than multiplying a rate by a token count yourself.
  Conversation history is re-sent every turn, and caching, long-context tiers
  and reasoning tokens change the bill in ways a single multiplication misses.
- `find_cheaper` returns models to test, not a recommendation: the capability
  index is an illustrative estimate, not a benchmark.
- Rates are standard-tier list prices. They exclude regional premiums, priority
  tiers, tool-call fees and negotiated discounts.

Model ids: <https://promptspend.dev/v1/models>. Full price history (CC BY 4.0, credit PromptSpend):
<https://promptspend.com/data/price-history.csv>.
