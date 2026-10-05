# Price history dataset

`price-history.csv` is every rate PromptSpend has published for an LLM API,
one row per rate that appeared, moved, was restated or went away, from the
first catalog (2026-08-02 UTC) onwards. It is the table form of
[`pricing-changelog.md`](pricing-changelog.md), and it reproduces that
changelog's model additions and rate changes exactly.

**Archived on Zenodo:** version 2026-10-05 is
[doi:10.5281/zenodo.23170741](https://doi.org/10.5281/zenodo.23170741) (380
rows, 82 models, 12 providers, 2026-08-02 to 2026-10-03).

It is built by replaying every version of `public/data/pricing.json` on the
`main` branch, in order, through the same comparison the daily sync uses to
write the changelog:

```sh
npm run export:price-history                  # history up to origin/main
npm run export:price-history -- --ref v0.7.0  # history up to a tag
```

Every row names the commit that published it, so any figure can be checked
against the full catalog as it stood that day:
`git show <commit>:public/data/pricing.json`.

## Columns

| Column                 | Meaning                                                                                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `date`                 | UTC date (`YYYY-MM-DD`) of the commit that published the change. The daily sync runs at about 11:00 UTC.                                                                                           |
| `commit`               | Full SHA of that commit in `github.com/AndrewAvery7/promptspend`.                                                                                                                                  |
| `model_id`             | PromptSpend's stable model id, e.g. `claude-sonnet-5`, `deepseek-deepseek-v4-flash`.                                                                                                               |
| `model_name`           | Display name at the time of the change.                                                                                                                                                            |
| `provider_id`          | Provider id, e.g. `anthropic`, `openai`, `deepseek`.                                                                                                                                               |
| `provider_name`        | Provider display name.                                                                                                                                                                             |
| `change`               | What happened — see below.                                                                                                                                                                         |
| `field`                | Which rate. Dotted for nested tiers: `longContext.input`, `intro.until`.                                                                                                                           |
| `old_value`            | The value before the change. **Empty means the rate was not recorded** on that side — not zero, and not free.                                                                                      |
| `new_value`            | The value after the change. Empty means not recorded after it.                                                                                                                                     |
| `unit`                 | `USD per 1M tokens` for every token rate; `USD per 1M tokens per hour` for cache storage; `multiplier` for `batchDiscount` (0.5 = half price); `tokens` for a threshold; `date` for `intro.until`. |
| `source`               | Where the published value came from: `vendor` (read by hand or by the daily check from the vendor's own page), `litellm` or `openrouter` (aggregator catalogs).                                    |
| `source_url`           | The vendor page the value was verified against, when it was. Empty for aggregator-sourced rows.                                                                                                    |
| `provider_pricing_url` | The provider's main pricing page at the time.                                                                                                                                                      |

### Fields

`input`, `output` — base rates. `cachedInput` — a cache read (hit).
`cacheWrite` — writing a prompt cache (the 5-minute tier where a vendor has
several). `cacheStoragePerMillionTokenHour` — a separate cache-residency
charge. `batchDiscount` — multiplier for the batch API. `intro.*` — a
promotional rate and the date it ends. `longContext.*` — the rates that
replace the base ones once a request's input passes `thresholdTokens`.

### `change`

| Value        | Meaning                                                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listed`     | The model entered the catalog. One row per rate it arrived with.                                                                                           |
| `price`      | A rate already recorded took a different value.                                                                                                            |
| `correction` | A rate took a different value **in the same commit its source changed** — PromptSpend reading a better page, not the vendor repricing.                     |
| `coverage`   | A rate PromptSpend was not recording appeared (or one stopped being recorded) on a model that stayed. Nobody's bill moved; the coverage did.               |
| `delisted`   | The model left the catalog. One row per rate it carried. Rare: since 2026-09-29 retired models are archived with `status: deprecated` rather than removed. |

For a study of vendor repricing, filter to `change = price`.

## What this data is, and is not

It is a record of **what PromptSpend published**, with the provenance needed
to judge each figure. It is not an independent record of what vendors charged,
and four things follow from that:

1. **`listed` is not a launch date.** It is the day PromptSpend started
   tracking the model. The 70 models in the first catalog all carry
   2026-08-02 (the initial commit landed at 22:02 on 2026-08-01, US Central).
2. **Aggregator rows inherit aggregator errors.** Rows with `source` `litellm`
   or `openrouter` are what those catalogs said that morning; PromptSpend
   flags disagreements between them for review rather than resolving them
   silently, but an unflagged aggregator figure has not been read off the
   vendor's page.
3. **PromptSpend's own mistakes are in the record, and so are their fixes.**
   History is never rewritten. The known case: on 2026-08-16 (`ee9939c`)
   `claude-sonnet-5` was recorded as a flat $2 / $10 when Anthropic was
   charging $3 / $15 with a promotional $2 / $10 until 2026-08-31; it was
   restored on 2026-08-22 (`1d3cd68`). Those two dates are not Anthropic
   repricing. The move to $2 / $10 on 2026-09-01 is.
4. **Not every rate is compared.** Promotional cache rates
   (`intro.cachedInput`, `intro.cacheWrite`) and regional or tiered tables
   that the catalog does not model are outside the comparison, so changes to
   them do not appear.

Non-price changes — names, context windows, review flags, status — are in the
changelog but not in this file.

## Licence and citation

The data (`price-history.csv`) is dedicated to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Prices are
facts; you may use them for anything without asking. Citation is still
appreciated — cite the archived version you used by its DOI (the 2026-10-05
version is `10.5281/zenodo.23170741`). The code that generates the
file is MIT, like the rest of the repository.
