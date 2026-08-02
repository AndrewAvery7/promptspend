# Changelog

Notable changes to the application. Changes to the **data** — prices moving,
models arriving, rows being flagged — are recorded separately and automatically
in [docs/pricing-changelog.md](docs/pricing-changelog.md), because they happen
on their own schedule and are not releases.

## Unreleased

Nothing yet.

## 0.3.0 - 2026-08-02

Price alerts, in both the forms `0.2.0` described as planned. The Data & Alerts
view previously carried two cards reading "PLANNED — NOT BUILT YET"; they are
now working features, and the rule that put those labels there — never render a
control that cannot do what it appears to offer — is what governs their
behaviour when a deployment has no API configured.

This adds a server to a project that did not have one. That is a real change to
what the site is, so the privacy and security documents were rewritten rather
than appended to.

### Added

- **Browser push.** A notification when a price moves, for the whole catalog or
  just the models you follow. Nothing personal is stored: a push subscription is
  an opaque URL the browser issues.
- **Email alerts**, weekly digest or instant, with double opt-in, RFC 8058
  one-click unsubscribe, and preference management from a signed link.
- **The alerts API** (`worker/`) — a Cloudflare Worker on D1 and KV, deployed
  separately from the site with its own tests and its own package.
- **RFC 8291 push encryption, written out** rather than imported. The mainstream
  library targets Node's crypto module and will not run unmodified on Workers,
  and a dependency that can read every notification body is one worth not
  having. Verified byte for byte against the worked example in RFC 8291 §5 —
  the only test here measured against an external authority instead of our own
  expectations, because a round-trip test passes just as happily when both
  halves share a misreading of the spec.
- **A generated Content Security Policy.** The API origin now appears in
  `connect-src`, so the policy is built from the same configured value the
  client reads. A hand-maintained meta tag would have drifted the first time
  either moved, producing a site that silently could not reach its own backend.
- **A weekly digest that sends even in a quiet week**, because a digest which
  only arrives when something happened is indistinguishable from one that has
  quietly broken.
- Installable-app manifest and icons — on iOS, web push only works for a site
  added to the Home Screen, so this is part of the feature rather than polish.

### Changed

- **README and SECURITY.md now describe a project with a backend.** Both stated
  "no server that receives anything", which stopped being true. Rule two of this
  project is that a claim must be true of the code; correcting the claim is the
  fix.
- Notification is triggered by a push to `main` that changes the published
  catalog, not by the sync job. A change that trips a sanity rule goes to a pull
  request first, so notifying from the sync job would have announced numbers
  that were still unmerged — and missed the ones a human reviewed and merged.
- `BASE_PATH` handling no longer treats an empty string as unset. GitHub Actions
  passes an undefined variable as `""`, which `??` does not catch, and which
  would have built every asset path relative to nothing.

### Security

- Push endpoints are restricted to the hosts that actually issue them. Without
  that allowlist the endpoint field is a server-side request forgery primitive:
  an attacker registers an internal URL and the worker POSTs to it, from
  Cloudflare's network, on every price change.
- Email link tokens are scoped to one purpose each. An unsubscribe link travels
  through forwards, archives and mail scanners; if it also authorised preference
  changes, every one of those copies would be a credential.
- `GET /v1/email/unsubscribe` asks rather than acts, because scanners prefetch
  links. One-click unsubscribe from a mail client is unaffected — RFC 8058 sends
  a POST.
- `/v1/notify` is authenticated by an HMAC over the exact body plus a timestamp,
  so a captured call is useless after five minutes and useless for any other
  payload.
- Deliveries are claimed by primary key before anything is sent, so two
  concurrent fan-outs cannot both notify the same subscriber.

## 0.2.0 - 2026-08-02

A pre-publication audit of `0.1.0` produced 29 findings. Twenty-seven were real
and are fixed here; one was a misreading of a vendor pricing table and is
documented rather than acted on; one is delivered in part with the remainder
named. The theme running through all of it: a calculator's failure mode is not
being late, it is being **confidently wrong**, so every place the code was more
certain than its evidence now says what it actually knows.

### Added

- **Long-context tiers.** OpenAI bills the entire request at 2× input and 1.5×
  output above 272K input tokens. Modelled per request rather than per
  conversation, so a long chat can cross the threshold partway through and the
  turns either side are priced differently — which is what actually happens.
- **Cache writes.** Both OpenAI and Anthropic charge 1.25× the input rate to
  write a cache entry. Counting only the cheaper reads reports a saving the
  invoice will not contain, so writes are billed and savings are reported net.
- **Scenario warnings.** A request that will not fit the model's context window,
  or a response past its output ceiling, is now flagged instead of being priced
  as though it would work.
- **A health manifest** at `public/data/sync-status.json`, written on every run
  whether it succeeded or not: attempted and succeeded timestamps, per-source
  status and revision, row counts and a catalog fingerprint. The UI reads it to
  show **prices last changed** and **sources last checked** as two separate
  facts.
- **Source links everywhere.** Every catalog row links to the vendor page its
  number came from; hand-verified rows carry `verifiedUrl` and a date.
- **An error boundary**, so a rendering failure shows an explanation and a way
  back rather than a white page.
- **`src/lib/contrast.test.ts`**, which reads `tokens.css` and fails the build if
  any accent, on any theme and canvas, drops below 4.5:1 on a surface it can
  appear on.
- **A bundle budget** (`npm run check:budget`): the initial payload must stay
  under 100 KB gzip and the tokenizer must remain a separate lazy chunk.
- `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue and pull-request templates,
  Dependabot, and `.editorconfig`.

### Fixed

- **A permitted URL could blank the application.** `costPico` threw a
  `RangeError` above the safe-integer range, during render, with nothing to
  catch it — from parameters the URL decoder itself accepted. It now finishes in
  `BigInt` past that range, and pricing per turn keeps the arithmetic exact at
  the decoder's limits anyway.
- **Sharing a pasted prompt shared the wrong numbers.** The URL carried whatever
  the sliders last said while the screen showed the pasted counts, and the toast
  claimed it restored every input. Derived counts are now written back into the
  scenario, `px=` records which fields came from text, and the restored page says
  so. The prompt text still never enters a URL.
- **The sync diff compared two fields.** A run that changed a cache rate, a
  context window, a tokenizer or a review flag reported "no changes", and the
  workflow discarded the file it had just produced. Every field is now compared,
  split into price / metadata / review-state, with a content hash.
- **One bad fetch could have emptied the catalog.** A truncated upstream response
  would have removed most models as a _clean_ diff — committed to `main` and
  deployed without review. Nothing published is deleted now: a model missing
  upstream is kept and marked `stale`, and retirement is a deliberate edit.
- **Deployment did not depend on CI.** Both workflows started independently on a
  push, so a commit could deploy with failing tests. They now share one reusable
  verify workflow, and deploy publishes the artifact that workflow produced.
- **The headline "price spread" compared unlike things** — the priciest _output_
  rate over the cheapest _input_ rate. Both sides are now the blended rate, and
  both numbers are printed so the multiple can be checked.
- **Mobile had document-level horizontal overflow** from `min-width: auto` on
  flex and grid children. Zero overflow now from 320px up.
- **The value map was pointer-only.** Every point is a real focusable button with
  Enter/Space handling, and the catalog table can select a model directly.
- Focus is restored when the command palette closes; the guided tour no longer
  steals arrow keys from sliders and honours `prefers-reduced-motion` in
  JavaScript as well as CSS; `title`-only help is replaced with real disclosures.
- CSV export escapes properly and neutralises spreadsheet formulas.
- The initial commit's author metadata was rewritten to the public noreply
  identity before any remote existed.

### Changed

- **Caching is off by default**, and where a provider publishes no cached rate,
  cached tokens are billed at the **full** input rate rather than an invented 90%
  discount. The control moved out of a collapsed "Advanced" section onto the
  panel.
- **Unscored models are no longer plotted** on the value map at a default of 70.
  They are not plotted at all, and the caption says how many that is.
- **`gpt-5.6` is marked as the alias for `gpt-5.6-sol`** that OpenAI documents it
  to be, so one purchasable model is no longer presented as two.
- **Alert controls that did nothing are gone.** Browser push and email digest are
  described as planned; the email field that could not subscribe anyone was
  removed.
- The flagged-row copy now describes the merge rule the pipeline actually uses.
- Fonts are self-hosted, so the page makes **no third-party requests at all**; a
  CSP and referrer policy are declared, and production sourcemaps are off.
- Every GitHub Action is pinned to a commit SHA, with Dependabot to keep the
  pins current.
- Catalog schema bumped to **v2** (`cacheWrite`, `longContext`, `aliasOf`,
  `provenance.verifiedUrl`, `lastChanged`, `stale`), and validation deepened to
  enums, date formats, integer bounds and cross-field sanity.
- 242 tests, up from 120, with a regression test for every defect above.
  Coverage thresholds are enforced in CI at 90% on the engine and the pipeline.

### Known gaps

- No browser end-to-end suite, no automated accessibility pass, no
  visual-regression snapshots. The responsive and touch-target guarantees were
  verified by hand at 320, 360, 390, 430, 768, 1024 and 1280 px rather than by a
  test that keeps them true. Playwright plus axe is the next investment.
- Regional and data-residency premiums, fast/priority tiers, server-side tool
  fees and negotiated discounts are not modelled. The boundary is stated on
  screen, in the CSV export and in the README rather than left implicit.

## 0.1.0 - 2026-08-01

First working build.

### Added

- The cost engine: compounding conversation history, per-model tokenizers,
  promotional pricing windows, batch discounts, reasoning multipliers, and
  integer money arithmetic so the parts of a breakdown always sum to the total.
- The daily pricing pipeline: family-level capture patterns, an explicit trust
  ladder, cross-source disagreement flagging, and a public changelog.
- Four views — Estimate, Compare, Learn, Data & Alerts — with a guided tour, a
  command palette, light and dark themes, and a colour-vision-validated chart
  palette.
- 120 tests across the engine, tokenizer, pipeline, palette and components.
