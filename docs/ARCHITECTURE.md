# Architecture

PromptSpend is a scheduled data pipeline that publishes one JSON file, a static site that reads it, and
four other packages that read it too. The pipeline is the product; everything else is a consumer.

```
 ┌── daily, in CI ───────────────────────────────┐   ┌── in the browser ──────────────┐
 │ LiteLLM ─┐                                    │   │                               │
 │          ├─ allowlist ─ merge ─ validate ─ diff│─┬▶│ pricing.json ─ Catalog ─ engine│─▶ views
 │ OpenRouter┘     ▲                             │ │ │                     ▲         │
 │ overrides ──────┘                             │ │ │            tokenizer┘         │
 └───────────────────────────────────────────────┘ │ └───────────────────────────────┘
                                                   ├──▶ api/      promptspend.dev, keyless JSON and CSV
                                                   ├──▶ mcp/      @promptspend/mcp, for coding agents
                                                   └──▶ vscode/   the editor extension
```

**There is a server now, and this document said there was not for three releases after it landed.** The
sentence that used to open this file — _"no server, no database and no account system"_ — was true when
written and stopped being true when opt-in price alerts shipped. `worker/` is a Cloudflare Worker on D1
holding a push endpoint or an email address and the models being followed; `api/` is a second, stateless
Worker serving the catalog to anyone who asks. Rule two of this project is that a claim must be true of
the code, and README.md was corrected at the time. This file and SECURITY.md were missed, which is the
ordinary way a document goes wrong: nobody re-reads the paragraph they are not editing.

Neither Worker is in the path of the estimator. Close the alerts form and the site is still a static page
that sends nothing anywhere. There is still no account system.

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

**Why nothing is deleted.** A model missing from the feed is kept, marked `stale`, demoted from
`current` to `legacy`, and flagged — because
one truncated upstream response should not be able to empty the catalog, and because the resulting
deletion would have looked like a clean diff and been committed and deployed without anyone seeing it.
Retiring a model for good means adding its id to `retired` in the allowlist: a deliberate, reviewable edit.

**Why two dates.** `lastVerified` moves every run; `lastChanged` moves only when a number does. The UI
shows both because "prices are stable" and "the job stopped running" are indistinguishable from a single
date, and the second one is the failure worth catching.

**`lastChanged` is optional, and absent is a real answer.** It is written only when `pricingChanged`
— the same comparison the changelog uses, exported from `scripts/lib/diff.ts` so the two cannot form a
second opinion — says that model's rates moved. A row published without it keeps none: there is
deliberately no `?? today` fallback in `mergeCatalog`, and none in `Catalog.pricesLastChanged()`, which
returns `null` rather than reaching for `generatedAt`. A model that has just appeared gets no date
either — nothing moved, something arrived, and `diff.added` is where that belongs.

**"Moved" is narrower than "differs".** `pricingChanged` distinguishes three events that all produce a
diff, because only one of them is a vendor repricing:

- **move** — both readings exist and differ. Stamped.
- **coverage** — one side is absent. We gained or lost a field we were not recording. Not a stamp, not a
  feed item, not `price_changed=true`; the changelog labels these **Coverage** rather than **Price**.
- **correction** — the number moved in the same run `provenance.source` or `verifiedUrl` did. We changed
  where we were reading, so the difference says nothing about the vendor. `mergeCatalog` reports these in
  `MergeResult.corrections` and leaves the date alone.

This cost the project once already, in the form the previous fix did not anticipate. Switching x.ai from
its model list to its pricing page backfilled a long-context tier and restated a cached-input rate from
0.5 to 0.3; both models were stamped, and `PRICES CHANGED 2026-08-06` appeared on the results panel with
no vendor having touched a rate. The earlier fix had already written down the diagnosis — "all 43 are a
field going from absent to a value, a rate gaining coverage, not a vendor changing one" — but encoded it
only in the repaired data, never in the comparison. Suppressing corrections can hide a genuine same-day
move; that trade is deliberate, and the next run catches it.

Both of those fallbacks existed, and together they put a fabricated `2026-08-02` on all 70 models — with
twelve claiming a change one day _after_ their own `lastVerified`, which says the number moved after the
last time anyone looked at it. Two invariants came out of it:

- **A generator fix does not repair what it already published.** `lastChanged` is carried forward
  untouched when rates hold, so correcting the stamping logic would have preserved every bad date
  indefinitely. The published catalog had to be repaired separately.
- **`validate:catalog` now fails the build when `lastChanged > lastVerified`**, naming the offending ids.
  The schema validator cannot catch this — both fields are individually valid dates, and only their
  relationship is impossible.

### Something watches the promise

Every gate above asks whether the code is correct. `.github/workflows/freshness.yml` asks the only
question a visitor has: is the published catalog actually current? It fetches
`promptspend.com/data/pricing.json` daily at 15:00 UTC — four hours after the sync, so a slow run is not
mistaken for a stale one — and alerts if `generatedAt` is more than two days old.

**It reads the live site rather than the file in git, and that is the whole design.** Between a price
moving upstream and a visitor seeing it there are four places to fail: the sync errors or its sources go
degraded; the sync raises a review flag and the pull request sits unmerged; the deploy fails after a green
sync; or Pages serves a stale artifact. Checking the repository copy catches only the first. Fetching what
the site serves catches all four, because it asks the question from where the answer matters.

Two days rather than one because the sync runs daily, so one missed morning is a transient and two is a
fault. It opens a single issue with a triage order, reuses that issue instead of filing a duplicate every
morning, closes it on recovery, and fails the run so the alert also arrives as email.

This exists because on 2026-08-04 the sync failed at the pull-request step — Actions had read-only
permissions, so it pushed a branch and could not open the PR — and nothing surfaced it. The site quietly
served a day-old catalog until somebody happened to look at the Actions tab. A project whose premise is
"the numbers are never a year out of date" needs something that notices when they are.

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

## The other four packages

Four packages outside the site read the same catalog, and three of them import the same code. That is the
most important structural fact in this repository: none of them holds a rate table, a tokenizer or a copy
of the cost formula, so none of them can quietly disagree with the calculator.

| Package   | What it is                                                             | What it imports from `src/lib/`                       |
| --------- | ---------------------------------------------------------------------- | ----------------------------------------------------- |
| `api/`    | `promptspend.dev` — keyless JSON and CSV over the catalog, on a Worker | `pricing/` — the schema and its validator             |
| `mcp/`    | `@promptspend/mcp` — three tools for coding agents                     | `pricing/`, `engine/`, `select/`                      |
| `vscode/` | the editor extension — prices on the line that names the model         | `pricing/`, `engine/`, `select/`, `tokenize/`, `url/` |
| `worker/` | the alerts API — the one stateful service                              | nothing; it watches the published file                |

`mcp/` and `vscode/` reach the shared code through a `@/*` → `../src/*` mapping in their `tsconfig.json`
plus a matching alias in their esbuild step. **Both halves are load-bearing**, and it is worth knowing why
before touching either: `tsc` does not rewrite the paths it type-checks, so a build with the mapping and
without the alias compiles cleanly and then fails to resolve at runtime. `api/` skips the mechanism and
imports by relative path, which is equivalent and reads worse.

`mcp/src/tools.test.ts` asserts that `estimate_cost` returns what the site's engine returns for the same
scenario. That test is why the paragraph above is a guarantee rather than an intention.

**The no-bundled-prices rule is repeated in all four**, because the temptation is different in each and
the failure is identical. An extension sitting in the Marketplace for three months with rates baked into
it, or an npm package doing the same, is the purest possible version of the problem this project exists to
prevent. Each fetches the published catalog, holds it briefly, serves a labelled stale copy for a bounded
grace period, and then shows nothing rather than showing a number it cannot stand behind.

The one thing `vscode/` cannot borrow is the catalog's own ids. Roughly half of them carry the upstream
feed's routing prefix — `gemini-gemini-2.5-flash`, `xai-grok-4.5`, `zai-glm-5` — and nobody writes those
in source code. `vscode/src/vendor-ids.ts` strips the known prefixes, and a test fails the build when the
catalog grows a family nobody has classified. The alternative failure was silent: matching OpenAI and
Anthropic, missing every other provider, and looking exactly like working.

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

The table above covers the site. Four more suites sit in `api/`, `mcp/`, `vscode/` and `worker/`, each
with its own runner and CI job; `docs/TESTING.md` has the breakdown and holds the total to what the
runners actually report rather than to what anyone remembers.

**What closed, and what did not.** This section used to name three gaps — no browser suite, no automated
axe pass, no visual-regression snapshots — and call Playwright plus axe the obvious next investment. Both
landed: 112 browser tests at four viewports, and an axe pass at WCAG 2.1 A and AA that immediately found
two real defects, each a scrollable region no keyboard could reach.

Screenshot diffing is still absent, and now deliberately rather than pending. A visual suite has a real
running cost — every intended change becomes a diff to review and a baseline to re-approve, across four
viewports and two themes — worth paying once the design stops moving, and it has been moving weekly. See
`docs/DEFERRED.md`.

## Rendering non-goals

No router, no state library, no utility CSS framework. The app has one shared scenario object and four
views; each of those would be ceremony. Styling is plain CSS custom properties on `data-theme` /
`data-accent` / `data-canvas`, which a utility framework cannot express as cleanly.

## Deliberate non-goals

No accounts, no analytics, no tracking. Those hold, and they are the ones that matter.

Three entries that used to sit in this list have since been built, and recording that is more useful than
quietly deleting them: the opt-in alerts worker, the hosted API, and static pre-rendering — 159 crawlable
pages generated from the catalog after every deploy. Each was argued against here on the grounds that it
adds operational surface without making a single number more accurate. That is still the right test. Two
of them passed it for a reason the original entry did not anticipate: an API and a set of crawlable pages
put the same numbers in front of things that will never load a React app, and the alerts worker is the
only way a price change reaches somebody who is not already looking at the site.

What has not changed is that none of them sits in the estimator's path.

## What is deliberately not modelled

The estimator prices standard-tier, global-endpoint list usage. Regional and data-residency premiums,
fast/priority tiers, server-side tool call fees, fine-tuning and negotiated discounts are out of scope —
not because they do not matter, but because a rule-based price schema that expresses all of them is a
larger piece of work than the one this codebase currently is. The boundary is stated on screen under every
estimate and in the CSV export, so nobody has to guess where the model stops.
