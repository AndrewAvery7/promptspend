# TokenTally pre-publication audit

**Code quality, security, correctness, product information, and UI/UX review**  
**Audit date:** August 1, 2026  
**Repository:** `token-tally` · branch `main` · reviewed commit `90fe7c13ff03bdcd5bd6f12ce096c821d158904b`  
**Audit mode:** Read-only review. No application source, configuration, pricing data, or Git history was changed.

## Executive verdict

**Recommendation: do not publish or promote TokenTally yet.** The project has a strong engineering foundation, but its central promise is trustworthy cost estimation and the current build can publish or display materially wrong numbers. Three critical defects, eleven high-severity defects, and fifteen medium-severity defects were confirmed.

The highest-risk findings are:

- Two current OpenAI model prices are materially below official list prices. GPT-5.6 Luna is shown at `$0.20 / $1.20` per million input/output tokens rather than the official `$1 / $6`; GPT-5.6 Terra is shown at `$2 / $12` rather than `$2.50 / $15`.
- The daily sync only recognizes added/removed models and base input/output changes. Changes to cache rates, promotional prices, context windows, model status, capabilities, provenance, or review flags can be silently discarded by CI.
- A partial upstream response or allowlist regression can remove most of the catalog and be auto-committed without human review.
- Sharing after pasted text produces a URL for the old slider workload while telling the user it restores every input.
- A URL using values explicitly accepted by the decoder can crash the application to a blank screen.
- The default estimate silently assumes a 60% cache-hit share, applies an invented 90% discount when no model rate exists, and never charges cache writes. This can make the headline cost substantially optimistic.
- Mobile Estimate has document-level horizontal overflow, while the Compare chart becomes too compressed to read. The chart's 70 clickable points are not keyboard accessible.
- Git history contains a personal author name and email in the initial commit. That metadata will be public even though the current local Git identity is correctly configured to the GitHub handle and noreply address.

TokenTally should be considered a promising beta after the release-blocking items in the remediation plan are completed and independently re-tested.

## What is already strong

- `npm run verify` passes: typecheck, lint, format check, all 120 tests across nine files, and a production build.
- The existing covered scope reports 93.62% statement and line coverage, 83.05% branch coverage, and 98.18% function coverage.
- `npm audit` reported zero known vulnerabilities across 415 installed dependencies. Registry signature verification passed for 340 packages; 86 packages also had attestations.
- No credentials, private keys, tracked `.env` files, personal filesystem paths, or application-source email addresses were found in tracked files or the one-commit patch history.
- No `dangerouslySetInnerHTML`, `eval`, `new Function`, raw `innerHTML`, or similar unsafe rendering pattern is used.
- Pasted prompt text stays in the browser. No code path transmits it to an application server or analytics service.
- The cost engine is separated from rendering, uses integer pico-dollar arithmetic within its supported range, and has useful focused unit tests.
- Runtime catalog loading validates the JSON before constructing the catalog, and URL model IDs are syntactically constrained and capped at four.
- The tokenizer is lazy-loaded, keeping its large payload out of the initial application bundle.
- The interface has a coherent visual system, clear primary task flow, useful cost breakdown cards, dark mode, reduced-motion CSS, and an explicit data-trust narrative.

These strengths are worth preserving. The recommended work is primarily about making the product's trust claims true under failure, edge, and mobile conditions.

## Audit scope and method

The review covered all tracked first-party source, tests, configuration, workflows, documentation, data allowlists/overrides, and the generated pricing catalog. The dependency lock was checked through npm's advisory and signature services.

Verification performed:

- Repository and Git-history inventory, including public-repository privacy and secret-pattern scans.
- Line-by-line review of the React application, state model, pricing catalog, tokenization layer, cost engine, sync/merge/diff pipeline, workflows, tests, CSS, and documentation.
- `npm run verify`, a production build, and an additional coverage run.
- `npm audit --json`, `npm audit signatures`, and a current-major dependency check.
- Live desktop and 390 × 844 mobile review in the locally served app.
- Live interaction testing of pasted text, URL sharing/restoration, extreme URL inputs, Compare, Data & Alerts, Learn, command palette focus, and responsive layouts.
- DOM-backed accessibility measurements: focusability of chart marks, heading structure, title-only help, touch-target dimensions, computed text sizes, and horizontal overflow.
- Current spot-checks against official provider documentation for key/default and flagged models.

Limitations:

- The future GitHub Pages deployment, repository settings, branch protection, DNS, response headers, and production analytics could not be tested because the repository has not been published.
- This was not a vendor-by-vendor re-verification of all 70 catalog rows. It was a code/pipeline audit plus a risk-based current-price sample. The sample found material errors, so a complete vendor reconciliation is a release requirement.
- No destructive exploit testing was appropriate: TokenTally is a local static client with no application backend, accounts, or stored customer data in scope.
- The project-specific Graphify graph does not yet exist, and the global graph was stale/sparse for TokenTally. Current source was therefore treated as authoritative.

## Severity model

| Severity | Meaning                                                                                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical | Can materially falsify the product's core result or automatically publish destructive data. Block release.                                                       |
| High     | Reachable user harm, blank-screen failure, public privacy leak, inaccessible primary flow, or release-control failure. Block release unless explicitly accepted. |
| Medium   | Important trust, accessibility, performance, maintainability, or product-quality gap. Schedule before calling the offering production-grade.                     |

## Findings summary

| ID    | Severity | Area                 | Finding                                                                                                                                    |
| ----- | -------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| TT-01 | Critical | Pricing data         | GPT-5.6 Luna and Terra prices disagree materially with current official OpenAI prices.                                                     |
| TT-02 | Critical | Sync pipeline        | Change detection ignores most model and provider fields, allowing important changes and new review flags to disappear.                     |
| TT-03 | Critical | Sync pipeline        | A partial upstream catalog can mass-remove models and auto-push without a shrink or deletion review gate.                                  |
| TT-04 | High     | Supply chain         | The source is a mutable `main` file, has no timeout, and can publish with its independent cross-check unavailable.                         |
| TT-05 | High     | Freshness            | “Synced” and `lastVerified` dates do not advance when sources are stable, so the UI date is not proof of the latest successful run.        |
| TT-06 | High     | Sharing              | Pasted-text estimates share stale slider counts while promising to restore every input.                                                    |
| TT-07 | High     | Reliability          | Valid decoder limits can overflow exact cost arithmetic and blank the application.                                                         |
| TT-08 | High     | Cost model           | Default caching is optimistic, hidden, unsupported-model caching is invented, and cache writes are not billed.                             |
| TT-09 | High     | Cost model           | Long-context tiers, regional premiums, tool charges, and other model-specific modifiers are absent.                                        |
| TT-10 | High     | Release control      | GitHub Pages deployment runs only the build and can publish when CI tests, lint, or catalog validation fail.                               |
| TT-11 | High     | Public privacy       | The existing commit exposes a personal author name and email in immutable public history.                                                  |
| TT-12 | High     | Product honesty      | Push/email controls are nonfunctional, and the UI claims releases are published although no release automation exists.                     |
| TT-13 | High     | Mobile               | Estimate produces page-level horizontal scrolling at 390 px; some primary panels render wider than the viewport.                           |
| TT-14 | High     | Accessibility        | All 70 Compare plot points are pointer-only; none can receive keyboard focus.                                                              |
| TT-15 | Medium   | Validation           | Catalog validation omits many fields, enum checks, provider integrity checks, and cross-field constraints.                                 |
| TT-16 | Medium   | Traceability         | Provider source URLs are stored but never shown; “every number shows its work” is not actionable.                                          |
| TT-17 | Medium   | Content accuracy     | “More conservative source” is false for some flagged rows; the system always keeps LiteLLM unless overridden.                              |
| TT-18 | Medium   | Metric integrity     | The “1500× decision” divides the most expensive output rate by the cheapest input rate—unlike quantities.                                  |
| TT-19 | Medium   | Data visualization   | The capability axis is an unvalidated illustrative score; 26 models silently default to exactly 70.                                        |
| TT-20 | Medium   | Catalog hygiene      | Alias and model variants can be duplicated, and legacy status is not shown in the primary model picker.                                    |
| TT-21 | Medium   | Export security      | CSV values are not robustly escaped or formula-neutralized and omit the assumptions needed to reproduce the result.                        |
| TT-22 | Medium   | Token accuracy       | “Exact” means raw-text tokenizer count, not exact billable API input including message/tool framing.                                       |
| TT-23 | Medium   | Educational accuracy | “The API is stateless” and universal resend language are too absolute for current stateful/continuation APIs.                              |
| TT-24 | Medium   | Focus and help       | Modal focus is not restored; tour focus is unmanaged; title-only help is unavailable to keyboard/touch users.                              |
| TT-25 | Medium   | Visual accessibility | Multiple touch targets are below 44 px, some text is below 12 px, and two alternate accents fail normal-text AA contrast.                  |
| TT-26 | Medium   | Prompt performance   | Exact-count cache keys retain every pasted text revision and tokenization runs without debounce.                                           |
| TT-27 | Medium   | Payload/privacy      | The tokenizer is 1.64 MB gzip, production sourcemaps add about 3.98 MB, and Google Fonts contradict a strict “no tracking” interpretation. |
| TT-28 | Medium   | Test strategy        | Coverage excludes components/state/sync orchestration, has no thresholds, and there are no browser, accessibility, or performance gates.   |
| TT-29 | Medium   | Repository hardening | Actions use mutable tags; security policy, dependency automation, and several documentation claims need launch cleanup.                    |

## Detailed findings

### TT-01 — Current official pricing errors

**Evidence:** `public/data/pricing.json:1258-1266` lists GPT-5.6 Luna at `$0.20` input and `$1.20` output per million. `public/data/pricing.json:1311-1319` lists GPT-5.6 Terra at `$2` and `$12`.

Current official OpenAI pages list [GPT-5.6 Luna at $1 input / $6 output](https://developers.openai.com/api/docs/models/gpt-5.6-luna) and [GPT-5.6 Terra at $2.50 input / $15 output](https://developers.openai.com/api/docs/models/gpt-5.6-terra). Luna is therefore understated by 80%; Terra is understated by 20%. Both catalog records are flagged because LiteLLM and OpenRouter disagree, yet both third-party values are below the vendor rate.

**Impact:** TokenTally can understate a production budget by 5× for Luna. This directly breaks the core trust proposition.

**Required fix:** Reconcile all 70 models against first-party vendor documentation before launch. Add vendor overrides for verified current rates, include a verified URL and timestamp at model level, and prevent flagged models from presenting a single definitive estimate until vendor-confirmed. Add regression fixtures for these exact models.

### TT-02 — The sync diff ignores most meaningful changes

**Evidence:** `scripts/lib/diff.ts:18-58` compares model addition/removal plus only `pricing.input` and `pricing.output`. `scripts/sync-pricing.ts:132-156` writes the catalog, but GitHub workflow outputs and commits depend on `diff.isEmpty`.

Changes to `cachedInput`, `cacheWrite`, batch discount, introductory pricing, context window, max output, status, tokenizer, display name, capabilities, capability index, provenance, review notes, provider metadata, `generatedAt`, and `lastVerified` are not changes to the workflow. A newly created `needsReview` flag can therefore result in `changed=false`, preventing both commit and review PR.

**Impact:** CI can claim “nothing changed” and discard data or review-state changes the sync just produced.

**Required fix:** Diff the complete normalized catalog or compare a canonical serialized hash. Separate material-price changes, metadata changes, review-state changes, and verification-only changes in the changelog. Ensure `needs_review=true` always creates a review artifact even if base rates are unchanged. Add tests for every price and metadata field.

### TT-03 — Mass removal can auto-publish

**Evidence:** `scripts/lib/merge.ts:47-54` constructs the next catalog only from currently matched LiteLLM records plus overrides. `scripts/lib/diff.ts:31-33` records removals but does not classify them as review-worthy. `.github/workflows/sync-pricing.yml:38-45` auto-pushes any changed run with no review reason.

Only five models are presently protected by hand overrides. A truncated LiteLLM response, upstream schema change, or family-regex error could remove most of the remaining 65 models. The catalog would still be non-empty, schema validation could pass, and the deletion could go directly to `main`.

**Required fix:** Fail closed on source-size anomalies. Require review for any removal, provider disappearance, count drop above a small threshold, or source count outside a learned range. Preserve previous records as `unverified`/`stale` until a vendor-confirmed retirement rather than deleting them on one missing upstream observation.

### TT-04 — Source and network failures are not release-safe

**Evidence:** `scripts/sync-pricing.ts:31-33` downloads the mutable LiteLLM `main` branch file and the OpenRouter API. `scripts/sync-pricing.ts:57-60` has no timeout, abort signal, content-length limit, or content-type check. `scripts/sync-pricing.ts:77-84` treats an unavailable independent cross-check as a warning and proceeds.

The global review flag also couples unrelated data: while any model remains cross-source flagged, an otherwise clean price change creates a review PR for the entire catalog; conversely, a review-only metadata change is invisible under TT-02.

**Required fix:** Add bounded fetches, retry/backoff, maximum payload size, schema/version checks, source telemetry, and a degraded-run status. A degraded run should never auto-publish. Pin or record the LiteLLM commit SHA/digest and include it in provenance. Decouple per-model review state from whether unrelated clean updates can be published.

### TT-05 — The freshness badge is not a last-successful-sync timestamp

**Evidence:** Every run generates new timestamps (`scripts/sync-pricing.ts:65`; `scripts/lib/merge.ts:45,131-134,150`), but TT-02 ignores those timestamps. `.github/workflows/sync-pricing.yml:34-36` commits nothing when base prices are stable. The UI nevertheless labels the persisted catalog date “prices synced” and “prices never stale.”

**Impact:** A displayed date proves only the last committed material price change, not that today's job ran successfully. Stable prices can make the date age even while jobs pass; a broken scheduler can look the same.

**Required fix:** Publish a small health manifest every successful run, containing attempted/succeeded timestamps, source status, source revision/digest, model count, flagged count, and catalog content hash. Label the UI “prices last changed” and “sources last checked” separately.

### TT-06 — Pasted prompts cannot be shared faithfully

**Evidence:** `src/state/useEstimator.ts:59-120` keeps pasted text and per-model exact counts outside the scenario. `src/lib/url/scenario.ts:69-84` encodes only slider token values. `src/components/EstimateView.tsx:440-451` copies that URL and announces that it restores every input. `docs/ARCHITECTURE.md:70-74` says derived counts travel, but no derived count is serialized.

**Live reproduction:** Switching System prompt to Paste text and entering a prompt changed the displayed field from `800 tok` to approximately `94 tok`, and costs changed. The URL remained `sys=800`. Clicking Share reported “Scenario link copied — it restores every input.” Reloading that URL restored Slider mode at 800 tokens.

**Required fix:** Preserve privacy by never putting prompt text in the URL. Either encode a model-ID-to-derived-count map and paste-mode metadata, convert to a clearly labeled fixed-count scenario, or disable sharing with a precise explanation. Add an end-to-end test that compares every restored card value after pasted text.

### TT-07 — Accepted URL values can blank the app

**Evidence:** `src/lib/url/scenario.ts:37-46` accepts up to 200,000 system/user/output tokens, 200 turns, and 100 million conversations/day. Compounding history can produce billions of tokens. `src/lib/engine/money.ts:40-50` throws when the exact pico-dollar product exceeds JavaScript's safe integer. No React error boundary contains this render failure.

**Live reproduction:** Navigating to a valid TokenTally URL with `gpt-5.6-sol`, `sys=200000`, `usr=200000`, `out=200000`, `t=200`, and high permitted scale values produced an empty DOM snapshot—a blank application. Returning to the normal URL restored the app.

**Required fix:** Derive safe limits from worst-case arithmetic, or move high-range cost arithmetic to `bigint`/decimal math. Validate total context and total billed tokens before calculation. Add a friendly error boundary and tests at every maximum and one-over-maximum boundary.

### TT-08 — Caching makes the default estimate optimistic

**Evidence:** `src/lib/url/scenario.ts:23-34` defaults cache share to 60%. The control is under collapsed Advanced assumptions (`src/components/EstimateView.tsx:280-332`). `src/lib/engine/cost.ts:120-138` assumes a cached rate of 10% of input when the model has no published cached-input rate. `cacheWrite` exists in the schema/merge path but is never billed by the engine. The current catalog has cached-input data for 60 models and cache-write data for none.

Official providers now often charge cache writes. Anthropic documents 1.25× base input for 5-minute writes and 2× for 1-hour writes, with 0.1× reads ([official pricing](https://platform.claude.com/docs/en/about-claude/pricing)). OpenAI's GPT-5.6 guidance likewise states 1.25× cache writes.

**Impact:** A first-time visitor sees major “savings” before choosing or confirming that the workload is cacheable, reaches the minimum cache size, repeats within the TTL, or uses a supported model.

**Required fix:** Default to no caching. Model cache writes, reads/hits, minimum token thresholds, TTL, and provider support separately. Never invent a discount for an unsupported/unknown model. Show a range or “not modeled” state when data is incomplete.

### TT-09 — Important bill modifiers are omitted

Official GPT-5.4 and GPT-5.6 documentation states that prompts above 272K input tokens are billed at 2× input and 1.5× output for the entire request; TokenTally applies one flat rate. The official [GPT-5.4 model page](https://developers.openai.com/api/docs/models/gpt-5.4) also documents a 10% regional-processing uplift and additional charges for some server-side tools. Anthropic documents a 10% US-only inference premium, cache writes, and batch modifiers. Similar provider-specific tiers exist elsewhere.

TokenTally also does not validate input plus requested output against each model's context/max-output combination, so it can price an impossible request without warning.

**Required fix:** Introduce explicit price rules rather than only scalar rates: thresholds, regions/platform routes, cache writes/reads, batch/flex/priority, tools, reasoning, modalities, and promotional windows. Warn or block impossible scenarios.

### TT-10 — Deployment is not gated on verification

**Evidence:** `.github/workflows/ci.yml:23-45` runs the full verification and catalog validation. `.github/workflows/deploy.yml:17-41` is a separate push workflow that runs only `npm ci` and `npm run build` before publishing.

Both workflows start independently on a push to `main`. A commit can therefore deploy even when lint, tests, format, or catalog validation fail.

**Required fix:** Make deployment depend on a reusable verified workflow or run `npm run verify` plus catalog validation in the deployment job. Protect `main` and the Pages environment with required checks.

### TT-11 — Personal data is already in Git history

**Evidence:** The only existing commit is authored as a personal name and personal-domain email. The current repository-local Git identity is correctly set to `AndrewAvery7` and `204509720+AndrewAvery7@users.noreply.github.com`, but configuration does not rewrite existing objects.

**Required fix before creating the remote:** Amend/rewrite the initial commit author and committer to the GitHub handle/noreply identity, then re-run a full-history identity and secret scan. Do this before the hash is shared or any remote is created.

### TT-12 — Alert controls and release claims over-promise

**Evidence:** `src/components/DataView.tsx:40-83` renders enabled Browser push and Email digest controls. They only show toasts saying the feature will ship later. `src/components/DataView.tsx:86-97` says notable changes are published as releases, but no release workflow or release-generating code exists. The top ticker advertises RSS, push, and email together.

The file-commit Atom link may become useful once the repository is public, but it is not a purpose-built price-change feed, and the other two calls to action are stubs.

**Required fix:** Before launch, remove or visibly mark planned controls as unavailable; do not accept an email into a form that cannot subscribe it. Remove the release claim or implement releases. Later, generate a product-owned feed from `diffToFeedItems`, which is currently unused.

### TT-13 — Mobile Estimate overflows horizontally

**Live evidence at 390 × 844:** The page's scroll width was 437 px. Scale, results, insight, and action panels measured about 438 px wide inside a 375 px content area. A document-level horizontal scrollbar was visible. The header also uses horizontal scrolling, placing utility controls offscreen.

**Impact:** Users can accidentally pan sideways, text and controls are clipped, and the primary estimate flow feels like a desktop canvas squeezed into a phone.

**Required fix:** Remove fixed/minimum child widths, enforce `min-width:0` throughout grids/flex children, collapse scale fields to one column, and make the app shell mobile-first. Replace the scrolling desktop header with a compact mobile navigation pattern. Add 320, 360, 390, 430, 768, and 1024 px screenshot tests.

### TT-14 — The Compare chart's primary interaction is pointer-only

**Evidence:** `src/components/CompareView.tsx:160-177` attaches click/hover handlers directly to SVG circles without `tabIndex`, button semantics, or keyboard handlers. Live DOM inspection found 70 circles and zero focusable circles. Table rows cannot toggle model selection.

At 390 px, the 860-unit chart is rendered about 301 px wide; its 11 px viewBox labels become visually tiny. The chart database guidance used for this review explicitly warns against scatter plots as a mobile-primary pattern and requires a keyboard/data-table alternative.

**Required fix:** Make each point a focusable SVG button-like target with accessible name and Enter/Space handling, or provide a synchronized accessible list/table selection control. On mobile, use a ranked/filterable list or a larger horizontally scrollable chart with visible zoom, not a compressed poster.

### TT-15 — Catalog validation is too shallow

`src/lib/pricing/types.ts:83-145` validates required base rates and a few structural fields, but does not fully validate provider objects/duplicates/URLs/country, runtime enums, optional prices, discount ranges, promotional dates, tokenizer discriminants/ratios/encodings, capability booleans, release/verification dates, integer bounds, max-output relationships, or review-note consistency.

**Required fix:** Use a complete runtime schema (for example Zod, Valibot, or a hand-written exhaustive validator) with strict objects and cross-field refinements. Validate raw source payloads separately from the normalized public schema.

### TT-16 — “Every number shows its work” has no source links

Provider `pricingUrl` values are stored in `data/models-allowlist.json` and published in the catalog, but no React component uses them. Compare shows only `vendor` or `litellm` plus a date. Users cannot click through to verify a number or see the upstream record/version used.

**Required fix:** Add a source drawer per model with vendor URL, upstream source URL/revision, list-price type, region/platform, last checked, last changed, review state, and calculation assumptions.

### TT-17 — “More conservative source” is not the merge rule

`src/components/DataView.tsx:159-163` says flagged models are shown with the more conservative source. `scripts/lib/merge.ts:73-85` never selects the higher price; OpenRouter only adds a warning while LiteLLM remains the value unless a vendor override exists. DeepSeek R1, for example, is displayed at lower LiteLLM rates even though the review note contains higher OpenRouter rates.

**Required fix:** Change the copy to describe the actual rule, or explicitly select/compute a conservative bound and label it as such. Prefer “range: source A–source B; vendor verification pending” for unresolved rows.

### TT-18 — The headline spread compares unlike rates

`src/lib/pricing/catalog.ts:72-86` computes the headline by dividing the priciest model's output rate by the cheapest model's input rate. The Compare chart uses a 75/25 blended rate instead, and the Estimate cards use the actual workload.

**Impact:** “Price is a 1500× decision” sounds like a model-to-model or workload comparison but is actually an extreme cross-category ratio.

**Required fix:** Use like-for-like blended rates or a named workload preset. Label the metric precisely, and provide the two numbers and formula.

### TT-19 — Capability data is not decision-grade

`src/components/CompareView.tsx:39-60` assigns every model with no `capabilityIndex` a score of 70. Forty-four of 70 models have a provided illustrative value; the remaining 26 form an artificial line. The override file openly calls the scores placeholders.

**Required fix:** Remove the axis until it is backed by cited, task-specific benchmarks and freshness dates. A better first release is a price/context/status/capability-filter table. If quality data is added, let users select a task and show uncertainty/source, not one universal intelligence number.

### TT-20 — Alias duplication and retirement context are unclear

The catalog contains both `gpt-5.6` and `gpt-5.6-sol` with the same price/context even though official OpenAI guidance says the alias routes to Sol. This inflates counts and presents one purchasable option as two models. Five catalog models are marked legacy, but the Estimate picker does not display model status.

**Required fix:** Model canonical offerings separately from aliases/snapshots/routes. Deduplicate the primary UI, expose aliases in details, and hide retired models by default behind an explicit filter and warning.

### TT-21 — CSV export is unsafe and incomplete

`src/components/EstimateView.tsx:497-538` wraps only the display name in quotes without escaping embedded quotes, leaves provider IDs unquoted, and does not neutralize spreadsheet formulas beginning with `=`, `+`, `-`, or `@`. Catalog display names are partly upstream-controlled. The export also omits cache/reasoning/batch assumptions, field modes, selected scale, pricing date/source, tokenizer method, and review flags.

**Required fix:** Use a tested CSV encoder, double embedded quotes, formula-neutralize untrusted text, and include a complete reproducibility section or companion JSON export.

### TT-22 — “Exact” is exact raw text, not exact billing

`src/lib/tokenize/index.ts:82-107` calls `encoder.encode(text).length`. That is exact for the selected tokenizer over that string, but an API request may also bill role/message framing, tool definitions, structured inputs, images, and provider-specific overhead.

**Required fix:** Change the label to “exact raw-text tokens” and explain excluded framing. Where official request-token counters exist, offer provider-specific counting or an overhead input.

### TT-23 — Multi-turn education is too absolute

`src/content/learn.ts:60-70` says the API is stateless and that the entire history must be resent. Some modern APIs support server-side continuation/state and persisted reasoning. Cost may still include prior context, but the transport and billing behavior are provider/API-specific.

**Required fix:** Say that many chat flows reprocess or bill prior context, whether the client resends it or references stored conversation state; users should verify the API's billing semantics. Keep the quadratic-history model as an explicit conservative/manual-history scenario.

### TT-24 — Focus and help behavior needs an accessibility pass

- `src/components/CommandPalette.tsx:30-63` focuses the search field on open but does not preserve/restore the triggering element or make background content inert. Live testing showed focus returned to `<body>` after Escape.
- `src/components/GuidedTour.tsx:64-81` scrolls smoothly and listens globally for Left/Right arrows without checking the focused control. It has no dialog semantics or focus management and can hijack keys used by sliders/inputs.
- Help `?` and review `CHECK` explanations are title-only spans (`src/components/EstimateView.tsx:107-177` and related locations), which are inaccessible on touch and not keyboard focusable.

**Required fix:** Use proven dialog/focus primitives, restore focus, trap/inert modal backgrounds, condition arrow shortcuts on appropriate targets, honor reduced motion in JavaScript, and replace `title` with accessible disclosure buttons/tooltips.

### TT-25 — Small targets, tiny text, and alternate accent contrast

At mobile size, live measurements found 10 visible interactive elements below 44 px in one Compare viewport, including 38 px appearance buttons and 39 px table headers. Computed UI text reached 9.92 px. The CSS contains many `0.58rem`–`0.70rem` labels.

Contrast calculations against white:

- Default cobalt `#2456e6`: 5.92:1 — passes normal text.
- Emerald `#059669`: 3.77:1 — fails 4.5:1 normal-text AA.
- Teal `#0891b2`: 3.68:1 — fails 4.5:1 normal-text AA.
- Violet `#6d28d9`: 7.10:1 — passes.

**Required fix:** Enforce 44 × 44 px targets, a 12 px absolute floor for secondary text and preferably 16 px body, and automated contrast checks for every theme/accent/canvas combination.

### TT-26 — Pasted text revisions accumulate and re-tokenize

`src/state/useEstimator.ts:59-98` keys exact counts by `modelId|field|full text` and never evicts old keys. Every edit can retain another full prompt string for the browser session. Tokenization work is started from an effect on each change without debounce. `src/components/LearnView.tsx:65-86` similarly recounts all samples on each keystroke.

**Required fix:** Cache only the current text or use a bounded hash-keyed LRU; debounce/defer typing; cancel superseded work; tokenize in a Web Worker for large prompts; publish a local-memory privacy note; and set a maximum paste size.

### TT-27 — Payload and privacy claims need calibration

The production build produced an initial JS chunk of about 69 KB gzip and a lazy tokenizer chunk of about 1.64 MB gzip (3.42 MB raw). `vite.config.ts:18` also emits approximately 3.98 MB of source maps. `index.html:25-29` contacts Google Fonts, so IP/user-agent data reaches a third party despite “no tracking” language.

**Required fix:** Self-host fonts, add a strict Content Security Policy and referrer policy where hosting permits, disable public production sourcemaps unless deliberately published, establish bundle budgets, and consider a smaller tokenizer strategy or worker. “No accounts or analytics; prompts stay local” is a more precise privacy statement.

### TT-28 — Test coverage misses the riskiest surfaces

The coverage run is healthy for `src/lib/**/*.ts` and `scripts/lib/**/*.ts`, but `vite.config.ts:35-38` excludes React components, state orchestration, and the top-level sync script and defines no thresholds. CI does not run coverage. There are no browser E2E, automated accessibility, visual-regression, Core Web Vitals, bundle-budget, degraded-source, mass-removal, metadata-diff, paste-share-restoration, or max-URL tests.

**Required fix:** Add unit cases for every confirmed defect, Playwright flows at desktop/mobile, axe checks, screenshots at required widths, coverage thresholds on risk-bearing code, and a pipeline fixture matrix covering outages and malformed/partial upstream data.

### TT-29 — Repository hardening and documentation cleanup

- GitHub Actions use mutable tags such as `actions/checkout@v4` and `peter-evans/create-pull-request@v7`; pin full commit SHAs and use Dependabot/Renovate to update them.
- Add `SECURITY.md` with supported versions and private disclosure instructions, plus dependency update automation and branch/environment protection guidance.
- README setup uses `npm install` instead of deterministic `npm ci` for a lockfile-based repository.
- `src/styles/tokens.css:11` points to a nonexistent `src/lib/__tests__/palette.test.ts`; the test is `src/lib/palette.test.ts`.
- “Prices never stale,” “synced daily,” “every number shows its work,” and “two independent sources” should be revised until the pipeline and UI evidence support them.
- Multiple direct/dev dependencies have newer major releases. This is not a vulnerability finding; plan a deliberate React/Vite/Vitest/ESLint migration rather than a launch-day bulk upgrade.

## Security assessment

### Current posture

TokenTally's static, account-free architecture sharply limits traditional web-application risk. There is no application backend, authentication, payment handling, user database, cookie-based session, or API key in the browser. Prompt text remains local. The current dependency audit is clean.

### Security work required before publication

1. Rewrite the existing commit identity (TT-11) and repeat full-history scans.
2. Treat pricing feeds as untrusted supply-chain input: fail closed, pin/record revisions, bound downloads, and expand schema validation (TT-02 through TT-04, TT-15).
3. Gate deployment on all required checks and protect `main`/Pages (TT-10).
4. Fix CSV formula injection and escaping (TT-21).
5. Pin Actions by SHA and automate dependency updates (TT-29).
6. Self-host fonts and define a CSP/referrer policy; document exactly what “no tracking” means (TT-27).
7. Add an error boundary so malformed data or arithmetic cannot turn into an opaque blank page (TT-07).

### Positive checks completed

- `npm audit`: 0 critical, high, moderate, low, or informational vulnerabilities.
- Registry verification: 340 signed packages; 86 packages with attestations.
- Tracked-secret scan: no common cloud/API key/private-key patterns.
- Tracked `.env` scan: none.
- Application-source email scan: only a placeholder address; dependency metadata and workflow bot address were expected.
- Dangerous rendering/code execution scan: none found.

## User-perspective review

### What works well

The value proposition is immediately understandable: choose models, describe one interaction, scale it, and compare bills. Results are visually prominent and present monthly, yearly, conversation, user, and margin views. The Learn section makes cost mechanics approachable. Local tokenization and the no-account approach are excellent trust and adoption choices.

### Where trust breaks for a user

- A user cannot tell which assumptions were silently enabled before seeing a number.
- A “CHECK” badge says sources disagree but still presents one precise number without a vendor link or uncertainty range.
- “Synced” looks like current verification even when it is only the last committed price-changing run.
- “Share” says the scenario is preserved when pasted-text estimates are not.
- Enabled push/email controls invite action and then reveal they are demos.
- Legacy/alias entries and an unexplained capability score make selection look more authoritative than the underlying data.
- Mobile overflow and tiny comparison labels make the product least usable in the quick, on-the-go context where a calculator should excel.

## What a world-class TokenTally should add

### 1. Make every estimate auditable

For each card, expose a concise “How this was calculated” drawer containing:

- Provider, deployment route, region, currency, price effective date, vendor URL, and upstream revision.
- Raw-text count versus estimated framing/tool/reasoning tokens.
- Input, output, cache write, cache read, batch, long-context, regional, and tool/modality charges.
- Assumptions that were used, assumptions that could not be modeled, and an uncertainty range.
- A copyable formula and a reproducible JSON export.

### 2. Replace false precision with scenario ranges

Add low/expected/high controls for response length, turns, cache-hit rate, reasoning overhead, and daily traffic. Show a sensitivity/tornado chart identifying which assumption drives variance. A finance decision benefits more from a defensible range than a six-decimal point estimate built on unknown caching.

### 3. Add workload presets and routing

Offer editable presets such as customer-support chat, code assistant, document extraction, RAG answer, batch classification, and agent/tool workflow. Add mixed routing—for example, 80% inexpensive model, 15% stronger model, 5% frontier fallback—because production systems rarely send every request to one model.

### 4. Model actual provider billing

Use a rule-based price schema that can express:

- Threshold/tier pricing and long-context multipliers.
- Cache writes, cache reads, TTLs, minimum cacheable tokens, and provider support.
- Batch/flex/priority, regional/data-residency premiums, and negotiated discounts.
- Reasoning tokens, tool calls, image/audio/video inputs, fine-tuning, and fixed per-request fees.
- Promotions with effective start/end dates and automatic expiry.

### 5. Make comparison evidence-based

Replace the universal capability index with task-specific, cited evaluation data or omit it. Let users filter by provider, status, context, max output, modalities, tool support, region, and verified/flagged state. Deduplicate aliases and hide retired models by default. Allow table rows—not only plot dots—to add a model.

### 6. Add operational workflows

- Import actual provider usage exports and compare estimated versus billed cost.
- Save scenarios locally with clear privacy controls; share derived data without prompt text.
- Show historical price charts and notify on selected models through a real feed/push/email implementation.
- Provide a CLI/API/embed option after the web estimator is trustworthy.
- Support currency conversion, tax handling, team/enterprise discounts, and export templates for finance reviews.

### 7. Deliver a first-class mobile and accessible experience

- Use a compact mobile header or bottom navigation; remove page-level horizontal scrolling.
- Make every interactive target at least 44 × 44 px and every primary flow keyboard/screen-reader complete.
- Convert chart interaction into accessible controls and a mobile ranking view.
- Increase small labels, preserve visible focus, restore modal/tour focus, and test every accent/theme combination.
- Respect reduced motion in both CSS and JavaScript.

### 8. Improve launch confidence

Add browser tests, accessibility checks, visual snapshots, performance budgets, security/dependency automation, a status manifest, and a public methodology page. Publish a short privacy page that states what is stored locally, what network requests occur, and that prompt contents are never transmitted.

## Recommended roadmap

### Release gate — complete before the first public push

1. Correct the two confirmed OpenAI rates and reconcile every catalog row with first-party vendor sources.
2. Replace partial diff logic with complete catalog change detection; make all review-state changes actionable.
3. Add source outage, timeout, content-size, mass-removal, and provider-disappearance gates.
4. Separate “last checked” from “last changed” and publish a run-health manifest.
5. Set cache default to zero; model support, writes, reads, TTL, and thresholds honestly.
6. Add tiered/long-context/region rules or clearly limit the supported estimator range.
7. Fix paste sharing and the permitted-URL blank-screen crash; add an error boundary.
8. Gate Pages deployment on the complete verification suite and catalog validation.
9. Rewrite the existing commit's author/committer metadata to the public noreply identity and re-scan history.
10. Remove or clearly disable unimplemented alerts and release claims.
11. Fix mobile horizontal overflow and keyboard access to Compare; remediate focus/help/touch/contrast issues.
12. Add regression tests for each item above and run the complete release checklist from a clean clone.

### Next 30 days — production-quality beta

1. Build the per-model audit drawer and source links.
2. Replace or evidence the capability axis; add filtering, status, aliases, and table selection.
3. Produce complete JSON/CSV exports with safe encoding and all assumptions.
4. Add workload presets, mixed routing, sensitivity ranges, and context/output validity warnings.
5. Add Playwright, axe, responsive screenshot, coverage-threshold, and bundle-budget gates.
6. Self-host fonts, disable unnecessary sourcemaps, pin Actions, add `SECURITY.md`, and enable dependency automation.
7. Publish methodology, privacy, data-source, and browser-support documentation.

### Later — world-class differentiation

1. Actual-versus-estimated bill import and reconciliation.
2. Historical pricing timelines and implemented alerts.
3. Region/platform/currency/enterprise-discount modeling.
4. Provider-neutral API, CLI, and embeddable calculator.
5. Task-specific quality/evaluation integration with transparent sources and uncertainty.

## Release acceptance checklist

- [ ] All 70 current catalog rows reconciled to a first-party source, or clearly marked unresolved and excluded from definitive estimates.
- [ ] No unresolved model is represented by one precise “trusted” price.
- [ ] Complete catalog changes create a commit or review artifact; no silent field loss.
- [ ] Source outage, truncation, unexpected shrink, and mass deletion cannot auto-publish.
- [ ] Freshness UI distinguishes last checked, last changed, and degraded status.
- [ ] Paste → share → reload preserves displayed estimates without exposing prompt text.
- [ ] Every permitted URL renders a bounded result or a friendly validation error.
- [ ] Default estimate includes no unconfirmed discount.
- [ ] Long-context, cache-write, region, and other unsupported modifiers are modeled or explicitly excluded.
- [ ] Pages deployment cannot succeed if any required verification fails.
- [ ] Git history contains only the public GitHub handle/noreply identity and no secrets/private paths.
- [ ] No enabled control is a placeholder.
- [ ] 320–430 px layouts have no document-level horizontal overflow.
- [ ] All primary flows pass keyboard and screen-reader testing; chart selection has a non-pointer route.
- [ ] All themes/accents meet WCAG AA contrast and 44 px target requirements.
- [ ] Safe, reproducible exports include assumptions and provenance.
- [ ] Browser E2E, accessibility, visual, pipeline-failure, and boundary tests run in CI.
- [ ] A clean clone passes `npm ci`, `npm run verify`, catalog validation, production build, and a launch smoke test.

## Verification record

| Check                               | Result                                                |
| ----------------------------------- | ----------------------------------------------------- |
| Git worktree before report creation | Clean                                                 |
| TypeScript typecheck                | Passed                                                |
| ESLint                              | Passed                                                |
| Prettier check                      | Passed                                                |
| Unit/component tests                | 120 passed; 9 test files                              |
| Production build                    | Passed with tokenizer chunk-size warning              |
| Initial application JS              | ~213.99 KB raw / 69.02 KB gzip                        |
| Lazy tokenizer chunk                | ~3.42 MB raw / 1.64 MB gzip                           |
| Production sourcemaps               | ~3.98 MB total                                        |
| Covered-scope statements/lines      | 93.62% / 93.62%                                       |
| Covered-scope branches/functions    | 83.05% / 98.18%                                       |
| npm vulnerability audit             | 0 known vulnerabilities                               |
| npm registry signatures             | 340 verified; 86 attestations                         |
| Tracked secret/private-path scan    | No matches                                            |
| Existing commit identity            | Personal author metadata present; must rewrite        |
| Desktop live smoke test             | Core views render; no initial console errors observed |
| Paste/share fidelity                | Failed; stale slider values restored                  |
| Extreme permitted URL               | Failed; blank application                             |
| Mobile 390 × 844                    | Failed; document horizontal overflow                  |
| Compare keyboard access             | Failed; 0 of 70 chart points focusable                |
| Alert controls                      | Failed; push/email are milestone toasts only          |

## Final release decision

TokenTally is **not ready for a public GitHub release in its current state**. The codebase is organized, testable, and visually promising, but correctness and trust controls around pricing—the product's central asset—are not yet strong enough for users to act on its figures.

After the release-gate work is complete, repeat the audit from a clean clone, validate every price against first-party sources, test the generated GitHub Pages site, inspect its network/security headers, and confirm the public Git history contains only the intended identity.
