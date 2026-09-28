---
slug: 2026-09-price-movement-report
title: September 2026 Price Movement Report
description: Every LLM price change our sync recorded in September 2026 — one genuine cut, to DeepSeek V4 Flash, a Sonnet 5 "cut" that changed nobody's bill, and a correction to our August report.
published: 2026-10-01
---

This is the second entry in the monthly series that started with the
[August 2026 Price Movement Report](https://promptspend.com/writing/2026-08-price-movement-report/):
what actually moved in LLM pricing over the previous month, sourced entirely
from [`docs/pricing-changelog.md`](https://github.com/AndrewAvery7/promptspend/blob/main/docs/pricing-changelog.md),
the append-only log our daily sync writes every time it touches a price, a
model, or a provenance field. Same three things, same order: the largest
confirmed move, the full tally by kind, and the live disputed count.

September was quiet, and we'll say so plainly. Seven price rows changed, on
two models, and only one of those two was a vendor charging a different
amount. Before any of that, though, we owe a correction to last month.

## A correction to the August report

The August report described itself as covering every change the sync recorded
in August. Its tally stopped at **27 August** and missed the month's last four
days. The log itself was complete; our count of it was not.

The four missing days included one set of price changes we should have
reported. On **2026-08-30**, three retired xAI models moved to a single new
rate:

- `xai-grok-3` and `xai-grok-4`: $3 / $15 → $1.25 / $2.50 per million tokens (output **−83%**)
- `xai-grok-4-1-fast`: $0.20 / $0.50 → $1.25 / $2.50 per million tokens (input **+525%**, output +400%)

This wasn't xAI repricing anything in August. xAI's own migration notice says
retired Grok models are billed at `grok-4.3`'s rate of $1.25 in / $2.50 out;
our catalog caught up with that on the 30th, and on 2 September we confirmed
it against xAI's retirement notice itself. But by the August report's own terms these belonged
in it, and they overturn two claims it made:

- Grok 3's and Grok 4's $12.50 drop on output is a bigger dollar swing than
  GPT-5.6's $10 cut, which we called the largest of the month.
- Grok 4.1 Fast's +525% on input is a bigger percentage than DeepSeek V4
  Flash's +371%, which we called the largest single move.

The corrected August tally, all four missing days included:

- Review: 255 (we reported 229)
- Price: 77 across 20 distinct models (we reported 69 across 17)
- Added: 76 (we reported 73) — 70 at the 2026-08-01 cold start, 6 genuine additions after it, not 3
- Coverage: 31 (we reported 28)
- Metadata: 26 (we reported 25)
- Provider: 5 and Corrected: 1, unchanged

We've added a note to the top of the August report pointing here, and left
its text as published. From this report on, the tally is taken on the first
of the month, from the whole month, not while the draft is being written.

## The largest move: DeepSeek cut V4 Flash

On **2026-09-16**, DeepSeek cut the rate on its cheap model, confirmed against
the vendor's own pricing page:

- `deepseek-deepseek-v4-flash` input: $0.44 → $0.30 per million tokens (**−32%**)
- `deepseek-deepseek-v4-flash` output: $1.32 → $1.20 per million tokens (−9%)
- `deepseek-deepseek-v4-flash` cached input: $0.014 → $0.006 per million tokens (−57%)

DeepSeek now calls the model `deepseek-flash` (DeepSeek-V4.1-Flash). Its page
says the old `deepseek-v4-flash` name is still accepted and billed at the new
price, so the catalog row keeps its id.

Read it against last month and this is a small give-back, not a reversal. The
2026-08-16 repricing took V4 Flash's output from $0.28 to $1.32; at $1.20 it
still costs about 4.3 times what it did at the start of August. V4 Pro didn't
move.

## A price change that changed nobody's bill: Claude Sonnet 5

On **2026-09-01**, the log shows Sonnet 5's price falling from $3 / $15 to
$2 / $10 per million tokens. Nobody was charged less. The August report told
you the $2 / $10 introductory rate would expire on 31 August and step up to
$3 / $15. Anthropic cancelled that step-up: its pricing page now says the
introductory rate is the standard price and the increase won't happen. The
catalog folded the intro rate into the base price and dropped the expired
intro block. You paid $2 / $10 on 31 August and you pay $2 / $10 now.

That's the whole Price count for September: four rows for Sonnet 5, three for
DeepSeek.

## The rest of the month, by kind

Every changelog entry in September, tallied by the label the sync gave it:

- Review: 269 — a disagreement between sources noted, updated, or cleared; no price changed
- Metadata: 17 — nine status changes, five context or output limits (Claude Sonnet 4.5's context window went from 200K to 1M tokens), three display names
- Coverage: 12 — a field the catalog wasn't tracking before now is, or one a vendor stopped publishing
- Price: 7 — across 2 models, described above
- Added: 5 — Claude Fable 5.1, GLM-5.2, Gemini 3.8 Flash, Grok 4.7, Claude Opus 5.5

No Provider or Corrected entries this month.

## Month over month

The comparison the series exists for, August (corrected) against September:

- Models added: 6 after launch, plus 70 at launch → **5**
- Models moved to legacy: 1 → **7**
- Models re-priced: 20 → **2**, only 1 of them by the vendor
- Changelog entries: 471 → **310**

"Legacy" means a model is no longer offered as current upstream; the catalog
keeps its page rather than deleting it. September's seven were Grok 3, Grok 4
and Grok 4.1 Fast (the retired models above), Mistral Medium 3, Kimi K2.5,
Gemini 3 Pro Preview and Kimi K2 Thinking. An eighth, Gemini 3.1 Flash-Lite
Preview, was marked legacy on 2026-09-23 and restored the next day.

August's re-pricing number is inflated by the pipeline's first days: 43 of
its 77 Price rows landed on 2026-08-02. September is the first month that
reads as the market rather than the machinery, and the market was calm.

## What's still disputed

When the August report went out, **17 models** carried an open `needsReview`
flag. As of this report it's **8**, from our own health endpoint:

```bash
curl -s https://promptspend.dev/v1/health
```

The count rose before it fell: it had reached 23 by 2 September, when 16 flags
were cleared in one pass by reading each vendor's own pricing page. Of the 8
still open, four are price disagreements between sources (DeepSeek R1, Mistral
Medium 3, Kimi K2.5, Grok 4.7) and four are models that dropped out of the
upstream feed and are waiting for someone to confirm the retirement (Claude
Opus 4.1, Gemini 3 Pro Preview, Kimi K2 Thinking, Grok 2). A flag means two
sources disagree right now, not that either is necessarily wrong.

## Reading this report

Next month's report goes out on 1 November, with the same three things in the
same order. September is what a quiet month looks like, and we'd rather
publish it than skip it.
