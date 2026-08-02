# Architecture

TokenTally is a static site with a scheduled data pipeline. There is no server, no database and no
account system: the only moving part is a GitHub Action that regenerates one JSON file.

```
 ┌── daily, in CI ───────────────────────────────┐   ┌── in the browser ──────────────┐
 │ LiteLLM ─┐                                    │   │                               │
 │          ├─ allowlist ─ merge ─ validate ─ diff│──▶│ pricing.json ─ Catalog ─ engine│─▶ views
 │ OpenRouter┘     ▲                             │   │                     ▲         │
 │ overrides ──────┘                             │   │            tokenizer┘         │
 └───────────────────────────────────────────────┘   └───────────────────────────────┘
```

## The data pipeline (`scripts/`)

`sync-pricing.ts` is the only stateful thing in the project and it runs on a cron.

| Stage     | Module                     | What it guarantees                                                                                                                            |
| --------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Fetch     | `sync-pricing.ts`          | A failure of the cross-check source degrades the run; it does not fail it.                                                                    |
| Normalise | `lib/normalize.ts`         | Upstream keys become stable ids (`slugify`), per-token costs become per-million rates, and only families named in the allowlist are captured. |
| Merge     | `lib/merge.ts`             | The trust ladder: overrides beat the feed; the cross-check can only _flag_.                                                                   |
| Validate  | `src/lib/pricing/types.ts` | The merged catalog satisfies the same schema the app enforces at load. Failure aborts the write.                                              |
| Diff      | `lib/diff.ts`              | Human-readable changelog entries and a machine summary for the workflow.                                                                      |

Everything except the fetch is a pure function, which is why `scripts/lib/pipeline.test.ts` can exercise
the whole thing against fixtures with no network.

**Why family patterns.** `^gpt-5(\.\d+)?(-mini|-nano)?$` captures a model that does not exist yet. That is
the entire anti-staleness mechanism: new versions arrive on their own, flagged for review, instead of
waiting for someone to notice and edit a list.

**Why OpenRouter never wins.** It resells inference, so its prices legitimately differ from first-party
list prices. Treating it as a source would import that skew; treating it as a witness catches genuine
errors in the primary feed. On the first live run it flagged 11 of 70 models — every one a reseller-versus-list
difference, which is exactly the signal it is there to produce.

## The cost engine (`src/lib/engine/`)

Pure TypeScript, no React, and the most heavily tested code in the repository. It is where a silent error
would be most expensive, so it gets the deepest investment.

- **`money.ts`** — rates are converted to integer micro-dollars and per-request costs computed in integer
  pico-dollars, so `0.1 + 0.2` problems cannot reach the screen and the parts of a breakdown always sum to
  its total. Scaling to month and year is ordinary floating point, which has ~15 significant digits
  against values needing at most 9.
- **`cost.ts`** — `sessionTokens` encodes the compounding-history formula; `conversationCost` applies
  caching, batch discounts, reasoning multipliers and promotional windows, and returns the list of
  assumptions it used; `costAtScale` projects out to day, month, year, per-user and margin.
- **`insights.ts`** — turns a comparison into the plain-language diagnosis shown beside the cards.

Every assumption the engine makes travels with the result rather than being hidden inside it. The UI has
no way to display a number without also being able to display why it is that number.

## Tokenizing (`src/lib/tokenize/`)

A hybrid, because honesty is cheaper than false precision:

- **Exact** for OpenAI-family models. `js-tiktoken/lite` plus a single ranks file, dynamically imported so
  it never enters the initial bundle and is fetched only when someone pastes text.
- **Estimated** everywhere else, from published characters-per-token ratios held in the catalog per model,
  with CJK counted separately because it tokenizes two to three times more densely.

The method is part of the return value, and the UI shows it. A failed tokenizer load degrades to the
estimate rather than breaking the page.

## State (`src/state/`)

`useEstimator` owns the scenario and mirrors it into the query string, so any estimate is shareable by
copying the URL. Pasted prompt text is deliberately excluded from that mirror: prompts are often
proprietary and URLs leak into logs and chat history. Only the derived counts travel.

Each model is costed against **its own** tokenizer's view of the pasted text, which is why two cards can
disagree about how many tokens the same prompt is. That is a real effect, not a rounding artefact.

## Rendering

Four views behind a single state hook. No router: the app is small enough that view state is a variable,
and the shareable state lives in the query string. Styling is plain CSS with custom properties on two
independent axes (`data-theme`, `data-accent`) plus a canvas variant — no utility framework, because the
design system is token-driven and a translation layer would only add a build step.

## Testing strategy

| Suite              | Guards                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `engine/*.test.ts` | The maths, including compounding history, cache handling, promotional windows and negative margins.    |
| `tokenize.test.ts` | That the real tokenizer runs, that estimates stay within a sane margin of it, and that CJK costs more. |
| `pipeline.test.ts` | The trust ladder, both sanity thresholds, cold-start behaviour and changelog rendering.                |
| `palette.test.ts`  | Colour-vision separation, simulated rather than assumed.                                               |
| `catalog.test.ts`  | Schema validation, including the malformed cases the pipeline could produce.                           |
| `App.test.tsx`     | The views render, the URL round-trips, and the tour and palette work.                                  |

## Deliberate non-goals

No accounts, no analytics, no server-side rendering, no hosted API. Each one would add operational
surface without making a single number more accurate. The one exception planned is a small opt-in alerts
worker, which stores a push endpoint or an email address and the models being followed — and nothing else.
