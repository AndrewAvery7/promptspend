# Response to the pre-publication audit

**Reviewing:** `TokenTally_Audit_Report_2026-08-01.md` (29 findings, TT-01 … TT-29)
**Date:** 2 August 2026
**Repository state:** commits `d045870` (remediation) and `9c1f3bb` (line endings) on top of `cecf536`
**Verification:** clean clone → `npm ci` → `npm run verify` → **exit 0**, 242 tests

---

## Verdict in one paragraph

**27 of 29 findings are accepted and fixed. One — TT-01, the report's headline
critical — is factually wrong, and I can show why. One (TT-28) is accepted in
substance and delivered in part, with the deferred half named explicitly below.**

TT-01 matters beyond its own line, because it is the finding the audit's
executive verdict leads with and the reason it recommends against publishing.
The two prices it says are wrong are correct, and were correct before any of
this work started.

That said: the audit is a good piece of work. Twenty-six of its findings were
real, several were serious, and two of them (TT-06 and TT-07) I reproduced
live before fixing and again after. The one wrong finding also pointed at a
genuine adjacent defect the audit did not raise directly — see TT-01 below.

---

## The one rejected finding

### TT-01 — "GPT-5.6 Luna and Terra prices disagree materially with official OpenAI prices" — **REJECTED, factually incorrect**

**The claim.** Luna should be `$1 / $6` (we published `$0.20 / $1.20`, so we
understate by 80%); Terra should be `$2.50 / $15` (we published `$2 / $12`, so
we understate by 20%). The audit calls this critical, says it "directly breaks
the core trust proposition", and cites `developers.openai.com` model pages.

**What the vendor actually publishes.** I fetched the exact pages the audit
cites, plus the pricing index, on 2 August 2026. From the flagship standard
table at <https://developers.openai.com/api/docs/pricing>:

| Model           | Input | Cached input | Cache writes | Output |
| --------------- | ----- | ------------ | ------------ | ------ |
| `gpt-5.6-sol`   | $5.00 | $0.50        | $6.25        | $30.00 |
| `gpt-5.6-terra` | $2.00 | $0.20        | $2.50        | $12.00 |
| `gpt-5.6-luna`  | $0.20 | $0.02        | $0.25        | $1.20  |
| `gpt-5.4`       | $2.50 | $0.25        | —            | $15.00 |

The model pages agree: `gpt-5.6-luna` reads "Input $0.2 · Cached input $0.02 ·
Output $1.2", and `gpt-5.6-terra` reads "$2 / $0.2 / $12".

**Every published TokenTally figure matched, to the cent, before I touched
anything.** Reconciling the whole OpenAI and Anthropic range against the
vendors' own pages changed **zero base rates**.

**Where the audit's numbers come from.** Both are real numbers from the same
page, read off the wrong row:

- `$1 / $6` is **Terra's Batch price** (the Batch tab, same row) — exactly half
  of standard, as OpenAI's 50% batch discount implies.
- `$2.50 / $15` is **`gpt-5.4`'s standard price** — the row four lines below
  Terra in the flagship table.

So the finding is a misread of a tab and an adjacent row, not a pricing error.
It is worth saying plainly because the audit's recommendation not to publish
rests substantially on it.

**A note on the "5× understatement" framing.** Had Luna genuinely been
`$1 / $6`, the catalog's own cross-check would have caught it: OpenRouter
reported `$0.10 / $0.60` for Luna, and the merge flagged the row for exactly
that reason. The system was working; the flag was pointing at a reseller
discount, which is what it is designed to surface.

**What I did anyway, because the underlying recommendation is sound.** The
audit's remedy — "add vendor overrides for verified current rates, include a
verified URL and timestamp at model level" — is right regardless of whether the
numbers were wrong. So:

- Every OpenAI and Anthropic row is now `vendorVerified` with a `verifiedUrl`
  pointing at the page that was read and a `lastVerified` date.
- Those rows are no longer flagged by the cross-check, because a
  vendor-confirmed number does not need a witness. Flagged models dropped from
  11 to 9, and the two that cleared are precisely Luna and Terra.
- The UI links every row's source, so the next person to check this does not
  have to take anyone's word for it.

**And the real defect this exposed.** Reading those pages properly surfaced
something the audit raised only in passing, as part of TT-09: the same table
carries a **long-context tier** (2× input, 1.5× output above 272K tokens) and a
**cache-write rate** (1.25× input). Neither was modelled. Those are genuine
understatements of up to 100%, and they are now implemented — see below. The
finding was wrong; the exercise that produced it was not wasted.

---

## Accepted in substance, delivered in part

### TT-28 — Test strategy — **ACCEPTED, ~70% delivered**

Delivered: a regression test for every confirmed defect (test count 120 → 242);
coverage now includes components, state and the sync pipeline, not just `lib`;
thresholds enforced in CI at 90% for the engine and pipeline and 70% overall;
coverage runs as part of `verify` rather than on demand; a bundle-budget check
that fails the build if the initial payload passes 100 KB gzip or the tokenizer
stops being a separate lazy chunk.

**Not delivered: Playwright, axe, and visual-regression snapshots.** These need
browser binaries and a new CI job, and would roughly double the repository's
tooling surface. The responsive and touch-target guarantees were therefore
verified by hand in a real browser at 320, 360, 390, 430, 768, 1024 and 1280 px
— measurements are in the table below — rather than by a test that would keep
them true. That gap is now written down in `docs/ARCHITECTURE.md` under
"Known gap" rather than left for the next auditor to rediscover.

---

## The other 27, and what changed

### Critical / High

| ID    | Finding                                    | What was done                                                                                                                                                                                                                                                                                                                                                |
| ----- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TT-02 | Diff ignores most fields                   | Every field compared, split into price / metadata / review-state, plus an FNV-1a content hash. `generatedAt` and `lastVerified` excluded because they move every run by construction. A new review flag now always produces an artifact. 13 new tests, one per field class.                                                                                  |
| TT-03 | Mass removal can auto-publish              | The merge keeps every previously published model; one missing upstream marks it `stale` and flags it, never deletes it. Retirement is a deliberate edit to `retired` in the allowlist. Plus a source-size floor (500 rows) and a 10% catalog-shrink cap, either of which stops the run.                                                                      |
| TT-04 | Unbounded, unwitnessed fetches             | 20 s timeout with `AbortController`, 32 MB cap, content-type and shape checks, two retries with backoff, ETag recorded as the source revision. Losing the cross-check now marks the run **degraded**, and a degraded run publishes nothing and fails the job loudly.                                                                                         |
| TT-05 | "Synced" is not a last-successful-run date | `public/data/sync-status.json` written on every run, successful or not: attempted/succeeded timestamps, per-source status and revision, row counts, catalog hash. The UI shows **prices last changed** and **sources last checked** as two separate facts.                                                                                                   |
| TT-06 | Pasted prompts share stale slider counts   | The derived count is written back into the scenario, so the URL always matches the screen; `px=` records which fields came from text; the restored page says so. Reproduced live before (`sys=800` while showing 37 tok) and after (`sys=37&px=system`). Prompt text still never enters a URL.                                                               |
| TT-07 | Permitted URL blanks the app               | `costPico` finishes in `BigInt` past the exact range instead of throwing mid-render, and an `ErrorBoundary` sits behind it. Pricing per turn rather than in aggregate also keeps the arithmetic exact at the decoder's limits. The audit's exact URL now renders a card, applies the long-context tier, and warns the scenario cannot run.                   |
| TT-08 | Optimistic, invented caching               | Default cache share 0. The control moved out of collapsed "Advanced" onto the panel. No published cached rate ⇒ full input rate charged and stated, no invented 90%. Cache **writes** billed at the published rate; savings reported net of them.                                                                                                            |
| TT-09 | Missing bill modifiers                     | Long-context tiers implemented **per request** (so a conversation can cross over partway through) with first-party data for the GPT-5.x families. Context-window and max-output validation warns instead of pricing an impossible request. Regional premiums, fast tiers and tool fees are **explicitly excluded and stated on screen** — see "Scope" below. |
| TT-10 | Deploy not gated on CI                     | A reusable `verify.yml` that both CI and deploy call; deploy publishes the artifact that workflow produced, so what is verified is byte-for-byte what ships.                                                                                                                                                                                                 |
| TT-11 | Personal identity in Git history           | Initial commit rewritten to `AndrewAvery7 <…@users.noreply.github.com>`; tree hash unchanged (`13c404ca`), so only metadata moved. Full-history scan for the personal name, address and local paths: clean.                                                                                                                                                  |
| TT-12 | Non-functional alert controls              | The push button and the email form are gone, replaced by a description marked PLANNED — NOT BUILT YET. The "published as releases" claim is removed. The ticker no longer advertises push and email.                                                                                                                                                         |
| TT-13 | Mobile horizontal overflow                 | Root cause was `min-width: auto` on flex and grid children. Fixed there, plus `minmax(min(320px, 100%), 1fr)` grids and an always-wrapping header. **0 px overflow on all four views at every width tested.**                                                                                                                                                |
| TT-14 | Chart is pointer-only                      | Every point is a real `role="button"` with `tabIndex`, an accessible name, `aria-pressed`, Enter/Space handling and a 22 px invisible hit area. The catalog table gained a selection checkbox per row, so the chart is no longer the only way in.                                                                                                            |

### Medium

| ID    | Finding                          | What was done                                                                                                                                                                                                                                                                                                                           |
| ----- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TT-15 | Shallow validation               | Enums, ISO dates, integer bounds, provider integrity, tokenizer discriminants, `maxOutput ≤ contextWindow`, `cachedInput ≤ input`, `cacheWrite ≥ input`, long-context ≥ base, alias resolution, `needsReview` implies a note. Hand-written, keeping the zero-runtime-dependency stance.                                                 |
| TT-16 | Source URLs never shown          | Every catalog row links to the vendor page it came from; the CHECK badge links there too; the CSV export carries the URL per row.                                                                                                                                                                                                       |
| TT-17 | "More conservative source" false | Replaced with the rule the merge actually implements: the primary feed's number ships, the cross-check only raises a hand, both figures are in the note.                                                                                                                                                                                |
| TT-18 | Headline spread compares unlike  | Blended rate on both sides, and both numbers printed so the multiple can be checked against the table below it. Roughly 18× rather than 53× on the same data.                                                                                                                                                                           |
| TT-19 | Capability axis is fabricated    | Models without a curated estimate are no longer plotted at 70 — they are not plotted at all, and the caption says how many that is. The axis label and a help disclosure both say it is illustrative. (The value map itself is kept: it is a deliberate product decision, and removing it was not necessary to remove the fabrication.) |
| TT-20 | Alias duplication                | `gpt-5.6` marked `aliasOf: gpt-5.6-sol`, per OpenAI's own documentation. Aliases are excluded from the picker, the chart, the spread and the model count (70 → 69), and shown in the table with an `alias` badge. Legacy/deprecated/unlisted status now appears in the picker, and the table hides retired rows by default.             |
| TT-21 | Unsafe CSV                       | Dedicated encoder: RFC-style quoting, doubled quotes, formula neutralisation for `= + - @ TAB CR`. The export now carries assumptions, warnings, scope, provenance, tokenizer method and per-model rates. 8 tests.                                                                                                                      |
| TT-22 | "Exact" overstates               | Relabelled "exact raw-text" with the framing caveat stated in the tokenizer note, the field label, and Learn module 01.                                                                                                                                                                                                                 |
| TT-23 | "The API is stateless"           | Rewritten to distinguish transport from billing, note server-side continuation, and mark the quadratic model as the conservative resend case.                                                                                                                                                                                           |
| TT-24 | Focus and help                   | Palette restores focus to its opener and traps Tab; the tour restores focus, no longer steals arrow keys from inputs, and honours `prefers-reduced-motion` in JS; `title`-only help replaced with real disclosure buttons.                                                                                                              |
| TT-25 | Targets, text, contrast          | Emerald `#059669` → `#047857` (3.77 → 5.48:1) and teal `#0891b2` → `#0b6c85` (3.68 → 6.00:1). 24 × 24 minimum targets everywhere, 44 × 44 on coarse pointers, 12 px text floor. `src/lib/contrast.test.ts` reads `tokens.css` and fails the build for any accent/theme/canvas combination under 4.5:1.                                  |
| TT-26 | Prompt cache grows unbounded     | Bounded 60-entry cache keyed by hash rather than by the text itself, 250 ms debounce before the real tokenizer runs, superseded work abandoned, 200,000-character paste cap.                                                                                                                                                            |
| TT-27 | Payload and privacy              | Fonts self-hosted (`@fontsource`, latin subsets, 8 files) — the page now makes **no third-party requests at all**. CSP and referrer policy in `<meta>`, `connect-src 'self'`. Production sourcemaps off by default. Bundle budget in CI.                                                                                                |
| TT-29 | Repository hardening             | All six actions pinned to commit SHAs with Dependabot to keep them current; `SECURITY.md`; README uses `npm ci`; the `tokens.css` comment now points at the file that exists. Overclaiming copy revised throughout. Dependency majors deliberately **not** bulk-upgraded, as the audit recommends.                                      |

---

## Where I deviated from the audit's prescription

Three places, each deliberate:

1. **TT-19 — kept the value map.** The audit says remove the capability axis
   until it is benchmark-backed. I removed the _fabrication_ instead: unscored
   models are not plotted rather than being given a default. The chart is a
   deliberate product decision and the axis is labelled illustrative in three
   places. If it were the only view of the data I would agree with removing it;
   it sits directly above a sortable, selectable table of the same models.

2. **TT-09 — bounded rather than complete.** A full rule-based price schema
   covering regions, fast tiers, tool fees and fine-tuning is a larger piece of
   work than this codebase currently is. I implemented the two modifiers that
   change a normal bill by up to 100% (long context, cache writes) and stated
   the remaining boundary on screen, in the CSV export and in the README, so
   nobody has to guess where the model stops.

3. **TT-15 — no schema library.** Zod or Valibot would be the obvious answer,
   but the app deliberately ships with no runtime dependency beyond React. The
   validator is hand-written and now checks more than a generated schema would,
   because it encodes _sanity_ rules (a cached rate cannot exceed a fresh one; a
   cache write cannot be cheaper than input) rather than only shapes.

---

## Scope of the estimate, now stated on screen

> Standard-tier, global-endpoint list prices in USD. Regional/data-residency
> premiums, fast and priority tiers, server-side tool fees and negotiated
> discounts are not included.

This appears under every estimate, in the CSV export, in the Data & Alerts
trust ladder, and in the README's "Honest limitations". It is the single most
useful thing added, because it converts an unstated assumption into a stated
one.

---

## Verification

| Check                                              | Result                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| Clean clone → `npm ci` → `npm run verify`          | **exit 0**                                                       |
| Tests                                              | 242 passed, 11 files (was 120 / 9)                               |
| Coverage (thresholds enforced in CI)               | 86.5% overall; engine 97.6%, pipeline 98.1% (both gated at 90%)  |
| Typecheck / lint / format                          | Clean                                                            |
| Catalog validation                                 | 69 models + 1 alias, 12 providers, 9 flagged                     |
| Initial JS                                         | 74.4 KB gzip (budget 100 KB)                                     |
| Initial CSS                                        | 6.7 KB gzip (budget 40 KB)                                       |
| Tokenizer chunk                                    | 1.60 MB gzip, still lazy (budget 2 MB)                           |
| Production sourcemaps                              | Off                                                              |
| Third-party requests                               | None                                                             |
| Horizontal overflow, 320/360/390/430/768/1024/1280 | 0 px on all four views                                           |
| Interactive targets below 24 × 24                  | 0                                                                |
| Visible text below 12 px                           | 0                                                                |
| Accent contrast, all theme × accent × canvas       | ≥ 4.5:1, enforced by test                                        |
| Chart points focusable                             | All (was 0)                                                      |
| Audit's blank-screen URL                           | Renders, prices at the long-context tier, warns it cannot run    |
| Paste → share fidelity                             | URL matches screen; prompt text absent                           |
| Git history identity                               | `AndrewAvery7` noreply only; secret and personal-path scan clean |
| Live console on fresh load                         | No errors                                                        |

---

## What still stands between this and a public push

Nothing blocking, in my assessment. Two things worth doing early, neither of
which needs to precede the first push:

1. **Playwright + axe + responsive snapshots** (the deferred half of TT-28), so
   the mobile and accessibility guarantees are held by tests rather than by the
   measurements in the table above.
2. **Branch and environment protection** on GitHub once the repository exists —
   required status checks on `main`, and the `github-pages` environment gated on
   them. The workflows are already shaped for it; only the repository settings
   are missing, and they cannot be configured before the remote does.

The audit's own release-acceptance checklist is satisfied with one exception:
"browser E2E, accessibility, visual … tests run in CI", which is item 1 above
and is recorded as a known gap in the architecture document rather than left
implicit.
