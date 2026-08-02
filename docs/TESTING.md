# Testing

```bash
npm run verify        # everything CI runs, and everything the deploy gate runs
npm test              # just the suite
npm run test:watch    # while working
npm run test:coverage # with thresholds enforced
```

`verify` is one gate: typecheck, lint, format check, tests with coverage
thresholds, a production build, catalog schema validation, and the bundle
budget. CI and the Pages deploy both call the same reusable workflow, so there
is exactly one definition of "verified" and no way to publish past it.

## What the suite covers

242 tests across 11 files. The distribution is deliberately uneven — depth
follows the cost of being wrong, not the size of the file.

| Suite                               | Tests | Guards                                                                                                                                                                                      |
| ----------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/engine/cost.test.ts`       | 38    | Compounding history, per-turn long-context tiers, cache reads and writes, promotional windows, reasoning multipliers, margins, break-even, and the scenarios that cannot physically run.    |
| `scripts/lib/pipeline.test.ts`      | 52    | The whole pipeline against fixtures: the trust ladder, both sanity thresholds, cold start, stale retention, flag-once semantics, full-field diffing, the content hash, changelog rendering. |
| `src/App.test.tsx`                  | 26    | The views render, the URL round-trips, the tour and palette work — plus a named regression test for every defect the pre-publication audit found.                                           |
| `src/lib/pricing/catalog.test.ts`   | 22    | Schema validation including every malformed case the pipeline could produce, alias handling, and the two freshness dates.                                                                   |
| `src/lib/contrast.test.ts`          | 21    | Every accent × theme × canvas combination against every surface it can appear on.                                                                                                           |
| `src/lib/url/scenario.test.ts`      | 17    | URL round-tripping, clamping, and that prompt text never appears in a link.                                                                                                                 |
| `src/lib/engine/money.test.ts`      | 10    | Integer exactness across the realistic range, and graceful degradation past it.                                                                                                             |
| `src/lib/tokenize/tokenize.test.ts` | 10    | That the real tokenizer runs, that estimates stay within a sane margin of it, and that CJK costs more.                                                                                      |
| `src/lib/palette.test.ts`           | 10    | Colour-vision separation of the chart pair, simulated rather than assumed.                                                                                                                  |
| `src/lib/engine/format.test.ts`     | 9     | Money, token and rate formatting at the boundaries.                                                                                                                                         |
| `src/lib/engine/csv.test.ts`        | 8     | Quoting, escaping, and formula neutralisation for the export.                                                                                                                               |

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
phone or whether a button is large enough to press. Those guarantees —
no horizontal overflow from 320px, 24 × 24 minimum targets, no text below 12px —
were verified by hand in a real browser at 320, 360, 390, 430, 768, 1024 and
1280 px, and are **not** currently held by a test.

Playwright plus axe would fix that and is the next investment. Until it exists,
treat any layout or accessibility change as something to check in a browser
rather than something CI will catch.

## CI

`.github/workflows/verify.yml` runs on Node 22 on `ubuntu-latest`, called by
`ci.yml` on every push and pull request and by `deploy.yml` before it publishes.
The deploy job downloads the artifact the verify job built, rather than building
its own, so what ships is byte-for-byte what passed.

`sync-pricing.yml` is separate and runs on a cron. It exercises the pipeline
against the live sources every morning, which is a useful early warning that an
upstream feed has changed shape — a degraded run fails loudly rather than
publishing.

## Line endings

`.gitattributes` normalises everything to LF. Without it, a Windows clone with
the default `core.autocrlf` gets CRLF throughout and `format:check` fails on
every file locally while passing in CI — a gate that only fails on a
contributor's machine is worse than no gate.
