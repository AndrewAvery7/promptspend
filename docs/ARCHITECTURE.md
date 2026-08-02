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

| Stage     | Module                     | What it guarantees                                                                                                                                                       |
| --------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fetch     | `sync-pricing.ts`          | Bounded in time and size, shape-checked, retried. Losing a source, or getting a suspiciously small one, marks the run _degraded_ — and a degraded run publishes nothing. |
| Normalise | `lib/normalize.ts`         | Upstream keys become stable ids (`slugify`), per-token costs become per-million rates, and only families named in the allowlist are captured.                            |
| Merge     | `lib/merge.ts`             | The trust ladder: overrides beat the feed; the cross-check can only _flag_. Nothing published yesterday is deleted today.                                                |
| Validate  | `src/lib/pricing/types.ts` | The merged catalog satisfies the same schema the app enforces at load, down to enum values and cross-field sanity. Failure aborts the write.                             |
| Diff      | `lib/diff.ts`              | _Every_ field compared, split into price / metadata / review-state, plus a content hash. What the workflow commits is what the run produced.                             |
| Report    | `sync-pricing.ts`          | `public/data/sync-status.json` on every run, successful or not: source revisions, row counts, catalog hash, and why a degraded run stopped.                              |

Everything except the fetch is a pure function, which is why `scripts/lib/pipeline.test.ts` can exercise
the whole thing against fixtures with no network.

**Why family patterns.** `^gpt-5(\.\d+)?(-mini|-nano)?$` captures a model that does not exist yet. That is
the entire anti-staleness mechanism: new versions arrive on their own, flagged for review, instead of
waiting for someone to notice and edit a list.

**Why OpenRouter never wins.** It resells inference, so its prices legitimately differ from first-party
list prices. Treating it as a source would import that skew; treating it as a witness catches genuine
errors in the primary feed. On the first live run it flagged 11 of 70 models — every one a
reseller-versus-list difference, which is exactly the signal it is there to produce. Two of them (GPT-5.6
Terra and Luna) were later reconciled by hand against OpenAI's own pricing page, which confirmed the feed
and cleared the flag. That is the flag doing its job, not the feed being wrong.

**Why a flag is raised once.** A permanent disagreement must not open a pull request every morning, or the
genuinely new ones drown in it. `mergeCatalog` compares each reason against what the published catalog
already recorded and marks only the unrecorded ones `isNew`; the workflow gates on those.

**Why nothing is deleted.** A model missing from the feed is kept, marked `stale` and flagged — because
one truncated upstream response should not be able to empty the catalog, and because the resulting
deletion would have looked like a clean diff and been committed and deployed without anyone seeing it.
Retiring a model for good means adding its id to `retired` in the allowlist: a deliberate, reviewable edit.

**Why two dates.** `lastVerified` moves every run; `lastChanged` moves only when a number does. The UI
shows both because "prices are stable" and "the job stopped running" are indistinguishable from a single
date, and the second one is the failure worth catching.

## The cost engine (`src/lib/engine/`)

Pure TypeScript, no React, and the most heavily tested code in the repository. It is where a silent error
would be most expensive, so it gets the deepest investment.

- **`money.ts`** — rates are converted to integer micro-dollars and per-request costs computed in integer
  pico-dollars, so `0.1 + 0.2` problems cannot reach the screen and the parts of a breakdown always sum to
  its total. Past the exact range it finishes in `BigInt` rather than throwing: this code runs during
  render, and an exception there is a blank page. Scaling to month and year is ordinary floating point,
  which has ~15 significant digits against values needing at most 9.
- **`cost.ts`** — `sessionTokens` encodes the compounding-history formula; `conversationCost` prices the
  conversation **turn by turn**, applying caching, cache writes, batch discounts, reasoning multipliers,
  promotional windows and long-context tiers, and returns both the assumptions it made and any warnings
  about a scenario that could not run; `costAtScale` projects out to day, month, year, per-user and margin.
- **`csv.ts`** — quoting and formula neutralisation for the export. Display names come partly from an
  upstream feed, so a downloaded estimate must not be able to execute anything when it is opened.
- **`insights.ts`** — turns a comparison into the plain-language diagnosis shown beside the cards.

**Why per turn.** A long-context tier is a property of a single request. Pricing the conversation in
aggregate and applying one rate gets every turn wrong in one direction or the other, and — because the
aggregate is up to two hundred times larger than any single request — it was also what pushed the integer
arithmetic out of its exact range in the first place. Doing it properly fixed both.

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
proprietary and URLs leak into logs, referrer headers and chat history. Only the derived counts travel —
and for that to be true rather than aspirational, the hook writes the derived count back into the scenario
whenever a field is in paste mode, and records which fields those were in `pastedFields`. Without that
last step the link carried whatever the slider last said while the screen showed something else, and told
the reader it had restored their estimate.

Exact counts are cached because tokenising the same string twice is waste, but the cache is bounded and
keyed by a hash rather than by the text: keying by the text left a full copy of every keystroke's prompt
alive for the rest of the session.

Each model is costed against **its own** tokenizer's view of the pasted text, which is why two cards can
disagree about how many tokens the same prompt is. That is a real effect, not a rounding artefact.

## Rendering

Four views behind a single state hook. No router: the app is small enough that view state is a variable,
and the shareable state lives in the query string. Styling is plain CSS with custom properties on two
independent axes (`data-theme`, `data-accent`) plus a canvas variant — no utility framework, because the
design system is token-driven and a translation layer would only add a build step.

## Testing strategy

| Suite              | Guards                                                                                                                                                                                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine/*.test.ts` | The maths, including compounding history, cache handling, promotional windows and negative margins.                                                                                                                                                                                                       |
| `tokenize.test.ts` | That the real tokenizer runs, that estimates stay within a sane margin of it, and that CJK costs more.                                                                                                                                                                                                    |
| `pipeline.test.ts` | The trust ladder, both sanity thresholds, cold-start behaviour, stale retention, flag-once semantics, full-field diffing and changelog rendering.                                                                                                                                                         |
| `palette.test.ts`  | Colour-vision separation, simulated rather than assumed.                                                                                                                                                                                                                                                  |
| `catalog.test.ts`  | Schema validation, including the malformed cases the pipeline could produce.                                                                                                                                                                                                                              |
| `App.test.tsx`     | The views render, the URL round-trips, the tour and palette work, and every defect the pre-publication audit found stays fixed: caching off by default, paste-then-share fidelity, an extreme URL rendering rather than blanking, keyboard access to the chart, and no enabled control that does nothing. |
| `csv.test.ts`      | Quoting, escaping and formula neutralisation for the export.                                                                                                                                                                                                                                              |
| `contrast.test.ts` | Every accent on every theme and canvas, read from `tokens.css` itself.                                                                                                                                                                                                                                    |

Coverage thresholds are enforced in CI, and they are uneven on purpose: 90% on the engine and the pipeline
where a silent error is expensive, 70% overall. `npm run verify` is a single gate that both CI and the
deploy workflow call, so there is exactly one definition of "verified" and no way to publish past it.

**Known gap.** There is no browser-level end-to-end suite, no automated axe pass and no visual-regression
snapshots. The component tests run in jsdom, which has no layout engine, so the responsive and
touch-target guarantees in this document were verified by hand in a real browser at 320, 360, 390, 430,
768, 1024 and 1280 pixels rather than by a test. Playwright plus axe is the obvious next investment.

## Rendering non-goals

No router, no state library, no utility CSS framework. The app has one shared scenario object and four
views; each of those would be ceremony. Styling is plain CSS custom properties on `data-theme` /
`data-accent` / `data-canvas`, which a utility framework cannot express as cleanly.

## Deliberate non-goals

No accounts, no analytics, no server-side rendering, no hosted API. Each one would add operational
surface without making a single number more accurate. The one exception planned is a small opt-in alerts
worker, which would store a push endpoint or an email address and the models being followed — and nothing
else. Until it exists, the Data & Alerts page describes it as planned rather than rendering a control that
does nothing.

## What is deliberately not modelled

The estimator prices standard-tier, global-endpoint list usage. Regional and data-residency premiums,
fast/priority tiers, server-side tool call fees, fine-tuning and negotiated discounts are out of scope —
not because they do not matter, but because a rule-based price schema that expresses all of them is a
larger piece of work than the one this codebase currently is. The boundary is stated on screen under every
estimate and in the CSV export, so nobody has to guess where the model stops.
