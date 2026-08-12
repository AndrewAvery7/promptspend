# Testing

```bash
npm run verify        # everything CI runs, and everything the deploy gate runs
npm test              # just the suite
npm run test:watch    # while working
npm run test:coverage # with thresholds enforced
```

`verify` is one gate: typecheck, lint, format check, tests with coverage
thresholds, a production build, catalog schema validation, the bundle budget,
and the published test counts. CI and the Pages deploy both call the same
reusable workflow, so there is exactly one definition of "verified" and no way
to publish past it.

## What the suite covers

**797 tests in all**: 392 unit and integration tests in this package, 84 in
`worker/`, 39 in `api/`, 34 in `mcp/`, 136 in `vscode/`, and 112 browser tests
across four viewports. Those six figures are the whole suite and they sum to the
total. Two earlier revisions did not: one claimed 533, which was neither the sum
of its own list nor inclusive of `mcp/` at all; the next claimed 580, which was
correct when written and went stale the moment the VS Code extension landed with
its own 136 tests. A total that is not re-derived from a run is a number that
decays. The distribution is deliberately uneven: depth follows the cost of being
wrong, not the size of the file.

Those totals are no longer kept by hand. `npm run check:test-badge` asks every
suite what it contains, adds the answers up, and fails if the README badge, the
total above, or any per-suite figure on this page disagrees with it. The list
summing to the total is now a property of the build rather than something to
proofread — which is the whole reason it exists, since proofreading is exactly
what failed twice.

The per-file table below is checked too, and that is newer than the rest. It
used to carry a note saying it was **not** checked and drifted by one or two —
that it was a map of where the depth is rather than an inventory. Then two tests
were added on 2026-08-04, two of its rows went stale, and every check above still
passed: the totals were corrected, the badge agreed with the sum, and two rows
inside the table that produces that sum were quietly wrong.

So it is now an inventory. Three things fail the build: a row whose figure has
drifted, a row for a file that holds no tests, and a test file with no row at
all. The last is what makes this table's implicit claim — that these are the
whole package and they sum to the total — true by construction rather than by
anyone adding them up.

| Suite                                 | Tests | Guards                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/lib/pipeline.test.ts`        | 59    | The whole pipeline against fixtures: the trust ladder, both sanity thresholds, cold start, stale retention, flag-once semantics — including a standing flag whose _figures_ drift, which is what re-opened a pull request every morning — full-field diffing, coverage versus a price move versus a source correction, the content hash, changelog rendering. |
| `src/lib/contrast.test.ts`            | 49    | Every accent × theme × canvas combination against every surface it can appear on, plus the status colours on their own soft fills — the pairing the accent matrix does not reach.                                                                                                                                                                             |
| `src/lib/engine/cost.test.ts`         | 38    | Compounding history, per-turn long-context tiers, cache reads and writes, promotional windows, reasoning multipliers, margins, break-even, and the scenarios that cannot physically run.                                                                                                                                                                      |
| `src/App.test.tsx`                    | 29    | The views render, the URL round-trips, the tour and palette work — plus a named regression test for every defect the pre-publication audit found.                                                                                                                                                                                                             |
| `src/lib/pricing/catalog.test.ts`     | 31    | Schema validation including every malformed case the pipeline could produce, alias handling, the two freshness dates, and the four states the results-panel chip can report.                                                                                                                                                                                  |
| `src/components/SyncChip.test.tsx`    | 8     | The chip's wording and its refusal to imply freshness it cannot evidence, including the timezone trap in rendering an ISO date.                                                                                                                                                                                                                               |
| `src/components/AlertsPanel.test.tsx` | 20    | Subscribing, confirming, the arrival path an emailed preferences link takes, and both halves of the unsubscribe confirmation.                                                                                                                                                                                                                                 |
| `src/lib/seo/pages.test.ts`           | 17    | Which models get a page, worked costs against hand arithmetic, ranking, the two kinds of “cheaper”, and the rules that keep the comparison set curated.                                                                                                                                                                                                       |
| `src/lib/url/scenario.test.ts`        | 15    | URL round-tripping, clamping, and that prompt text never appears in a link.                                                                                                                                                                                                                                                                                   |
| `src/lib/seo/render.test.ts`          | 15    | Escaping a hostile display name out of both the markup and the JSON-LD, the policy hash matching what is emitted, no inline styles the policy would silently drop, and that the footer offers the API these pages tell readers to prefer.                                                                                                                     |
| `src/lib/select/cheaper.test.ts`      | 11    | Which alternatives count as genuinely cheaper: the capability bar, unscored models excluded rather than assumed to clear it, routing aliases and the target itself never offered, and an explanation rather than bare emptiness.                                                                                                                              |
| `src/lib/palette.test.ts`             | 10    | Colour-vision separation of the chart pair, simulated rather than assumed.                                                                                                                                                                                                                                                                                    |
| `src/lib/tokenize/tokenize.test.ts`   | 10    | That the real tokenizer runs, that estimates stay within a sane margin of it, and that CJK costs more.                                                                                                                                                                                                                                                        |
| `src/lib/engine/money.test.ts`        | 10    | Integer exactness across the realistic range, and graceful degradation past it.                                                                                                                                                                                                                                                                               |
| `src/lib/engine/format.test.ts`       | 9     | Money, token and rate formatting at the boundaries.                                                                                                                                                                                                                                                                                                           |
| `src/lib/seo/slug.test.ts`            | 8     | That a URL is a permanent identifier: the transformation, and the collision that must fail the build rather than overwrite a page.                                                                                                                                                                                                                            |
| `src/lib/seo/llms.test.ts`            | 8     | That `llms.txt` stays an index rather than a data dump: absolute URLs, cheapest first, the boundary of what a price means, the catalog timestamp so staleness is visible, and that it names the MCP server and the extension.                                                                                                                                 |
| `src/lib/engine/csv.test.ts`          | 8     | Quoting, escaping, and formula neutralisation for the export.                                                                                                                                                                                                                                                                                                 |
| `scripts/lib/indexnow.test.ts`        | 7     | The submission shape, the batch rules, and that a rejection is reported rather than thrown.                                                                                                                                                                                                                                                                   |
| `scripts/lib/notify.test.ts`          | 7     | Which catalog changes are worth interrupting somebody for, and which are not.                                                                                                                                                                                                                                                                                 |
| `src/lib/mobile/promptInput.test.ts`  | 8     | Native count/paste behavior, model-specific token estimates, the 200,000-character boundary, empty and multilingual text, comparison ranking, and proof that private prompt text never enters share output.                                                                                                                                                   |
| `src/lib/mobile/comparison.test.ts`   | 5     | Four-model selection defaults, add/remove behavior, duplicate prevention, maximum enforcement, and safe handling when catalog entries disappear.                                                                                                                                                                                                              |
| `src/lib/engine/share.test.ts`        | 4     | Readable estimate and comparison sharing, cheapest-model labeling, warnings, freshness context, and mail-safe line breaks.                                                                                                                                                                                                                                    |
| `src/lib/engine/insights.test.ts`     | 3     | Deterministic output, history, caching, margin, and price-spread explanations, including empty and single-model scenarios.                                                                                                                                                                                                                                    |

| `src/lib/seo/css.test.ts` | 3 | That the generated-page stylesheet defines every class the renderers emit, styles both colour schemes, and lets wide tables scroll inside their own container. |

Four more packages, each with its own runtime, lockfile and CI job, plus the
browser run:

| Package   | Tests | Guards                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `worker/` | 84    | The alerts API inside workerd against a real D1 — including the RFC 8291 push crypto, checked byte-for-byte against the worked example in the RFC itself.                                                                                                                                                                                                                                                       |
| `api/`    | 39    | The public pricing API: filters, ETags, CORS, CSV quoting, that a catalog failing validation is refused rather than passed through, and that an origin answering with HTML is reported as such rather than as a JSON syntax error.                                                                                                                                                                              |
| `mcp/`    | 34    | That no tool can return a price without provenance, that `estimate_cost` agrees with the site's own engine, that `get_price` quotes the rate actually in force and cannot drift from what `estimate_cost` bills, that the server reports the version it was published as, and that the real fetch path names what arrived when the catalog is not JSON.                                                         |
| `vscode/` | 136   | The editor extension: which lines in which languages name a model, hover, status-bar and inline rendering, that every surface quotes the rate in force rather than the standard one during a promotional window, the catalog fetch when the server is unreachable or answers malformed, selection estimates that name an impossible request rather than pricing it, and diagnostics that stay quiet by default. |
| Browser   | 112   | Layout and accessibility at 320/390/768/1280 in real Chromium — overflow, touch targets, text size, table scrolling, axe at WCAG 2.1 A/AA. See below.                                                                                                                                                                                                                                                           |

## Layout is checked in a real browser

`npm run test:e2e` runs Playwright against the **built** site at four viewports
— 320, 390, 768 and 1280 — with touch emulation on the first three, because the
44px target rules live behind `@media (pointer: coarse)` and without `hasTouch`
the run checks the desktop stylesheet on a narrow screen.

It exists because the unit suite runs in jsdom, which has no layout engine at
all. It cannot see a table pushing the page sideways at 320px, or a control too
small for a thumb — and both of those shipped.

| Check               | Catches                                                                           |
| ------------------- | --------------------------------------------------------------------------------- |
| Horizontal overflow | Anything widening the document, unless it sits in a container that scrolls itself |
| Touch targets       | Controls under 44x44, measured as the union of the control and its label          |
| Text size           | Anything rendering below 12px                                                     |
| Table scrolling     | A wide table scrolling the page instead of its own container                      |
| Accessibility       | axe at WCAG 2.1 A/AA: landmarks, roles, accessible names, heading order           |

Each returns the offending elements, not a boolean: "the page has horizontal
scroll" is not a bug report, "table.catalog is 512px wide in a 320px viewport"
is.

It runs against the built site rather than the dev server because the 159
generated pages only exist after `build:pages`, and one test loads a model page
with JavaScript disabled — those pages ship none, and that is the point.

On its first honest run it found four touch targets under 44px, three of them
caused by the same trap: a more specific selector elsewhere in the stylesheet
beating the rule meant to cover it, since a media query adds no specificity.

## Coverage thresholds are uneven on purpose

Enforced in CI, and the numbers are set to today's level so they can only go up:

| Scope               | Lines | Why                                                                                            |
| ------------------- | ----- | ---------------------------------------------------------------------------------------------- |
| `src/lib/engine/**` | 90%   | A silent arithmetic error is the most expensive bug this project can ship.                     |
| `scripts/lib/**`    | 90%   | This is what decides whether third-party data reaches users at all.                            |
| Everything else     | 70%   | Components and state, where a failure is visible on screen rather than hidden inside a number. |

## Two things the tests are structured around

**The pipeline is pure except for the fetch.** Normalise, merge, validate and
diff are all pure functions, which is why `pipeline.test.ts` can exercise the
entire thing against fixtures with no network and no clock. Fixtures live in the
test file, not on disk.

**Every audit finding has a test named after it.** The regression tests in
`App.test.tsx` are grouped as "honesty of the default estimate", "sharing a
pasted prompt", "keyboard and screen-reader access" and "claims the site makes
about itself". If one of them fails, something that was true has stopped being
true — that is more useful than a test called `renders correctly`.

Two of those are worth calling out, because they were live failures before they
were tests:

- **A permitted URL used to blank the page.** `costPico` threw during render from
  parameters the decoder itself accepted. The test drives the exact URL and
  asserts a cost card renders.
- **Sharing after pasting used to lie.** The URL carried the old slider values
  while the screen showed the pasted counts. The test pastes, then asserts the
  URL matches the screen and contains no fragment of the prompt.

## What the suite does not cover

The component tests run in **jsdom, which has no layout engine**. It cannot
measure an element, so it cannot tell you whether the page scrolls sideways on a
phone or whether a button is large enough to press.

Those particular guarantees are now held by the Playwright suite above, which is
why layout regressions get caught rather than shipped. Accessibility is held by
`tests/e2e/a11y.spec.ts` — axe at WCAG 2.1 A and AA, on every viewport, over
the four app views and four generated pages.

**Visual regression is the gap that remains.** Nothing diffs screenshots, so a
change that leaves the page accessible, correctly sized and semantically valid
while making it _ugly_ — a colour that no longer matches, a broken alignment,
an overlapping label — will not be caught by anything here. Treat a purely
visual change as something to look at.

## CI

`.github/workflows/verify.yml` runs on Node 22 on `ubuntu-latest`, called by
`ci.yml` on every push and pull request and by `deploy.yml` before it publishes.
The deploy job downloads the artifact the verify job built, rather than building
its own, so what ships is byte-for-byte what passed.

It carries six jobs — `verify`, `worker`, `e2e`, `api`, `mcp` and `vscode` — one
per package with a suite, each installing only what it needs. `vscode` is the
exception that installs twice: the extension type-checks against files in the
root package through its `@/*` mapping, so the site's dependencies have to be on
disk before the extension's own can be.

Three of the extension's gates do something the tests cannot, and each was
written after a fault the tests had passed:

| Gate               | What it catches                                                                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check:activation` | Drives a full refresh over a real document and fails if nothing is drawn. Every refresh used to be fired as `void refresh(…)`, so an exception left the screen unchanged and said nothing.                                       |
| `check:footprint`  | A 100 KB bundle budget, and it resolves each declared external. Inlining the tokenizer took the extension from 19.7 KB to 3,368 KB; a _missing_ external is worse, because exact counting then silently degrades to an estimate. |
| `check:package`    | Stages the real `vsce ls` file set into a temp directory and runs the encoder from there. It is the only check that sees packaging, module resolution and the tokenizer at once — which is what shipped broken.                  |

`ci.yml` also triggers on pushes to `pricing-sync/**`, and the reason is not
obvious. GitHub does not trigger workflows for events created with
`GITHUB_TOKEN`, so the review pull requests the sync opens arrive with only the
checks that run on their own schedule. Catalog validation — the check that
matters most on a pricing change — was the one not running.

`sync-pricing.yml` is separate and runs on a cron. It exercises the pipeline
against the live sources every morning, which is a useful early warning that an
upstream feed has changed shape — a degraded run fails loudly rather than
publishing. `notify-alerts.yml` fires on a push to `main` that changes the
published catalog.

`freshness.yml` is the odd one out: it tests nothing in this repository. It
fetches the catalog from the live site daily and raises an issue if it is more
than two days old. Every other job here asks whether the code is correct; that
one asks whether the promise is being kept, which no amount of passing tests can
answer.

## Line endings

`.gitattributes` normalises everything to LF. Without it, a Windows clone with
the default `core.autocrlf` gets CRLF throughout and `format:check` fails on
every file locally while passing in CI — a gate that only fails on a
contributor's machine is worse than no gate.
