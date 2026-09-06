---
slug: 2026-08-price-movement-report
title: August 2026 Price Movement Report
description: Every LLM price change our sync recorded in August 2026, led by DeepSeek's overnight repricing of V4 Flash and V4 Pro — sourced from our public changelog.
published: 2026-09-01
---

This is the first entry in a series we'll publish on the first of every
month: what actually moved in LLM pricing over the previous month, sourced
entirely from [`docs/pricing-changelog.md`](https://github.com/AndrewAvery7/promptspend/blob/main/docs/pricing-changelog.md)
— the append-only log our daily sync writes every time it touches a price,
a model, or a provenance field. Nothing below is estimated; every figure is
a line that log already published, on the day it published it.

August was also this catalog's first month of operation, which matters for
reading the numbers honestly: a chunk of what follows is the pipeline
turning on, not the market moving. We've separated the two.

## The largest move: DeepSeek repriced V4 overnight

On **2026-08-16**, DeepSeek's V4 Flash and V4 Pro both jumped to new rates in
a single sync run, confirmed against the vendor's own published pricing
(not just a peer source disagreeing):

- `deepseek-deepseek-v4-flash` output: $0.28 → $1.32 per million tokens (**+371%**, the largest single move of the month)
- `deepseek-deepseek-v4-flash` input: $0.14 → $0.44 per million tokens (+214%)
- `deepseek-deepseek-v4-pro` output: $0.87 → $3.96 per million tokens (+355%)
- `deepseek-deepseek-v4-pro` input: $0.435 → $1.32 per million tokens (+203%)

V4 Flash's output rate nearly quadrupled in one day. The sync flagged both
models `needsReview` the same day the automated feed disagreed with the new vendor number by
78–79%, then cleared the flag on 2026-08-20 once the vendor override was
confirmed as the real, current rate — not a feed error. If you were costing
a workload against V4 Flash or V4 Pro in the first half of August, re-run
the numbers; the second half of the month is a different price entirely.

## The second-largest: GPT-5.6 got cheaper

On **2026-08-23**, GPT-5.6's own rate (not one of its `-luna`, `-sol`, or
`-terra` variants) dropped:

- Input: $5 → $4 per million tokens (**−20%**)
- Output: $30 → $20 per million tokens (**−33%**)
- Cached input: $0.50 → $0.40 per million tokens (−20%)

That $10-per-million drop on output is the largest absolute dollar swing of
any single field this month — bigger in raw dollars than DeepSeek's move,
even though it's smaller as a percentage. Whether "largest" means biggest
percentage or biggest dollar amount is genuinely a judgment call; we're
naming both winners rather than picking the one that makes a better
headline.

## A price move that wasn't: Claude Sonnet 5's own correction

Worth flagging plainly, because it looked like a price change and wasn't
one. On 2026-08-16, the same sync run that repriced DeepSeek also recorded
Sonnet 5's rate dropping from $3/$15 to $2/$10 per million tokens — but that
drop was a bug in our own pipeline, not Anthropic changing anything. An
introductory rate got written into the base price field, which silently
deleted its 2026-08-31 expiry date. Anthropic never charged a different
rate; our catalog would have started charging the higher list price to
nobody, forever, instead of on schedule.

We caught it four days later. The 2026-08-20 entry in the changelog restores
the $3/$15 list price with the $2/$10 introductory rate correctly tracked
against its real expiry, and says so in the log rather than quietly editing
the number. We're reporting it here for the same reason: a monthly report
that only ever describes vendors' mistakes and never our own isn't the kind
of source this catalog is trying to be.

## The rest of the month, by kind

Every changelog entry in August, tallied by the label the sync gave it:

- Review: 229 — a disagreement between sources noted, updated, or cleared; no price changed
- Added: 73 — a model entered the catalog (70 of these were 2026-08-01, the cold start; 3 — Gemini 3.7 Flash, Grok 4.6, Kimi K3 — were genuine additions later in the month)
- Price: 69 — a rate field changed, across 17 distinct models
- Coverage: 28 — a field the catalog wasn't tracking before now is (e.g. long-context or cache-storage rates)
- Metadata: 25 — a non-price fact changed, context window size mostly
- Provider: 5 — a provider-level field changed, e.g. a pricing-page URL
- Corrected: 1 — the 2026-08-03 manual fix described below

The one **Corrected** entry is a data-hygiene note, not a price event: on
2026-08-03 we stripped a `lastChanged` timestamp that every one of the
70 launch-day models had been carrying since the cold start, because that
date recorded when a migration ran, not when a vendor moved a rate. No
price, source, or verification date was touched.

## What's still disputed

As of publishing this report, **17 models** carry an open `needsReview`
flag — a live figure, not a snapshot, from our own health endpoint:

```bash
curl -s https://promptspend.dev/v1/health
```

A flag means at least two of our sources disagree on that model's price
right now, not that either is necessarily wrong. We publish the disputed
count rather than resolving it silently in one direction, because a
calculator that hides its disagreements is choosing a number for you
without telling you it had a choice to make.

## Reading this report

Every month, this page will lead with the largest confirmed price move,
report the full tally by change kind, and publish the current disputed
count — the same three things, in the same order, sourced from the same
public log. Some months there won't be a dramatic repricing to lead with;
when that's true, we'll say plainly that the month was quiet, because a
quiet month reported honestly is what makes the loud months credible.
