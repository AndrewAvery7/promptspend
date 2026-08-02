<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.png">
    <img src="assets/logo.png" alt="PromptSpend" width="540">
  </picture>
</p>

<p align="center">
  <b>Know the tab before you build.</b><br>
  Estimate, compare and understand what an AI feature will cost &mdash; from a catalog that re-checks itself every morning, so the numbers are never a year out of date.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/models-69-2456E6.svg" alt="69 models tracked">
  <img src="https://img.shields.io/badge/providers-12-2456E6.svg" alt="12 providers">
  <img src="https://img.shields.io/badge/tests-425-blue.svg" alt="425 tests">
  <img src="https://img.shields.io/badge/initial%20payload-74%20KB%20gzip-blue.svg" alt="74 KB gzip initial payload">
  <a href="https://github.com/AndrewAvery7/promptspend/actions/workflows/ci.yml"><img src="https://github.com/AndrewAvery7/promptspend/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/AndrewAvery7/promptspend/actions/workflows/sync-pricing.yml"><img src="https://github.com/AndrewAvery7/promptspend/actions/workflows/sync-pricing.yml/badge.svg" alt="Sync pricing"></a>
</p>

<p align="center">
  <a href="https://andrewavery7.github.io/promptspend/"><b>&rarr; Open PromptSpend</b></a>
  &nbsp;·&nbsp; free &nbsp;·&nbsp; open source &nbsp;·&nbsp; no accounts, no tracking
</p>

---

## Why this exists

Every LLM cost calculator on the web has the same failure mode: it is a snapshot. Someone builds it,
hard-codes a dozen model prices, and within a few months the entire premise is wrong — the models it
compares have been superseded and the prices it quotes no longer exist.

PromptSpend is built the other way round. **The pricing pipeline is the product**; the calculator is what
sits on top of it. Every morning a GitHub Action re-fetches the catalog from independent sources, merges
them under an explicit trust order, runs sanity checks, and either commits the result or opens a pull
request for a human. Capture patterns are family-level, so a brand-new model version is picked up
automatically without anyone touching code.

## What it does

- **Estimate** — describe one interaction (paste your real prompt or move the sliders), set your scale,
  and see the monthly, yearly, per-user and margin numbers for up to four models side by side.
- **Compare** — every tracked model on a price-versus-capability value map, plus a sortable catalog you
  can select from directly, with the source and verification date for every row.
- **Learn** — seven short interactive lessons on tokens, why output costs more, compounding chat history,
  hidden reasoning tokens, caching and batching, and how the data pipeline works.
- **Data & Alerts** — pipeline health, full provenance for every number with a link to the vendor page it
  came from, what is currently flagged, and four ways to hear about a price change: an Atom feed, the
  repository's own pull requests, browser push, and an email digest.

### Price alerts

Opt-in, and off unless a deployment is configured for them. Browser push stores nothing personal — a push
subscription is an opaque URL the browser issues. Email is double opt-in with one-click unsubscribe, and
stores your address, the models you follow, and the date you asked; nothing else. Either channel can watch
the whole catalog or just the models you pick.

The delivery service is a Cloudflare Worker in [`worker/`](worker), with the push payload encryption
written out against RFC 8291 and checked byte for byte against the RFC's own worked example.
[docs/ALERTS.md](docs/ALERTS.md) has the architecture, the cost model and the domain cutover.

## Things it does that most calculators get wrong

|                                    |                                                                                                                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Output is priced separately**    | Output typically costs 3–5× input. Averaging the two, as many calculators do, understates most real workloads.                                                                                 |
| **Chat history compounds**         | Turn _N_ re-sends turns 1…*N*−1 as input, so conversation cost grows with the square of the turn count.                                                                                        |
| **Tokenizers differ per family**   | The same pasted text is counted with each model's own tokenizer — exactly (js-tiktoken, run in your browser) for OpenAI-family models and with a clearly labelled calibrated ratio elsewhere.  |
| **Caching is not free**            | Cache _writes_ cost 1.25× input at both OpenAI and Anthropic. Counting only the cheaper reads reports a saving your invoice will not have, so writes are billed and caching is off by default. |
| **Long context costs more**        | Above 272K input tokens OpenAI bills the whole request at 2× input and 1.5× output. Tiers apply per request, so a conversation can cross over partway through.                                 |
| **Reasoning tokens are billable**  | A multiplier for hidden thinking tokens, because the visible answer is not what you pay for.                                                                                                   |
| **Promotional pricing expires**    | Introductory rates apply only inside their window, and the engine takes a date.                                                                                                                |
| **Assumptions are visible**        | Every non-published number used in a calculation is listed under the results, not buried — and so is what the prices do not cover.                                                             |
| **Impossible scenarios are named** | A request that will not fit the context window, or a response past the output ceiling, is flagged rather than priced as if it would work.                                                      |

## How the data stays current

```
                    ┌─────────────────────────┐
  LiteLLM catalog ──┤                         │
                    │   allowlist → merge →   │──→ public/data/pricing.json ──→ the app
  OpenRouter API ───┤   validate → diff       │
                    └───────────┬─────────────┘
  data/pricing-overrides.json ──┘            └──→ docs/pricing-changelog.md
       (hand-verified, wins)
```

**The trust ladder**, in order:

1. **Hand-verified vendor rates** (`data/pricing-overrides.json`) — win every conflict.
2. **The LiteLLM community catalog** — the automated daily feed; thousands of models, updated within days
   of a release.
3. **The OpenRouter API** — an independent cross-check, never a source of record. Reseller pricing differs
   from first-party list pricing, so a disagreement of more than 20% _flags_ the model rather than
   changing it.
4. **Sanity rules** — schema validation, non-negative rates, implausibility checks, a hold on any price
   that moved more than 50% in a single day, a floor on how many rows a source may return, and a cap on
   how much the catalog may shrink in one run.

A clean diff is committed and deployed automatically. A **newly** raised flag becomes a pull request — a
long-standing disagreement does not re-open one every morning. A run that loses a source or trips a size
guard is **degraded**: it publishes nothing, records why in `public/data/sync-status.json`, and fails
loudly. Either way the change lands in [`docs/pricing-changelog.md`](docs/pricing-changelog.md).

**Nothing disappears on one bad morning.** A model missing from the feed is kept and marked `stale`, not
deleted; retiring one for good is a deliberate edit to `data/models-allowlist.json`.

### Two dates, not one

The site shows **prices last changed** and **sources last checked** separately, because they answer
different questions. A quiet week in the market makes the first date age while everything works
perfectly; a broken scheduler looks exactly the same if you only publish one date. The second comes from
a health manifest written on every run, successful or not:

```
https://andrewavery7.github.io/promptspend/data/sync-status.json
```

## Use the data yourself

There is a free, keyless, CORS-open API at **[promptspend.dev](https://promptspend.dev)** — no account, no
rate limit, no logging of who calls it:

```bash
curl https://promptspend.dev/v1/prices          # flat rows: the numbers only
curl https://promptspend.dev/v1/models/gpt-5    # one model, in full
curl https://promptspend.dev/v1/prices.csv      # the same rows, for a spreadsheet
```

Filters: `?provider=`, `?status=`, `?aliases=include`. Every response carries
`X-PromptSpend-Generated-At`, and OpenAPI 3.1 lives at
[`/openapi.json`](https://promptspend.dev/openapi.json). See [docs/API.md](docs/API.md).

Or read the file the API reads. The catalog is plain, versioned JSON with a stable shape:

```
https://promptspend.com/data/pricing.json
```

```jsonc
{
  "schemaVersion": 2,
  "generatedAt": "2026-08-02T02:27:22.781Z",
  "providers": [{ "id": "openai", "name": "OpenAI", "country": "US", "pricingUrl": "https://…" }],
  "models": [
    {
      "id": "gpt-5.6-terra",
      "providerId": "openai",
      "displayName": "GPT-5.6 Terra",
      "status": "current", // current | legacy | deprecated
      "contextWindow": 1050000,
      "pricing": {
        "input": 2, // USD per 1M tokens
        "output": 12,
        "cachedInput": 0.2,
        "cacheWrite": 2.5, // writing costs *more* than sending
        "batchDiscount": 0.5,
        "longContext": { "thresholdTokens": 272000, "input": 4, "output": 18 },
      },
      "tokenizer": { "kind": "tiktoken", "encoding": "o200k_base" },
      "provenance": {
        "source": "vendor", // vendor | litellm | openrouter
        "lastVerified": "2026-08-01", // when it was checked
        "lastChanged": "2026-08-01", // when the number last moved
        "verifiedUrl": "https://developers.openai.com/api/docs/pricing",
      },
    },
  ],
}
```

Optional fields worth knowing: `aliasOf` marks an id that routes to another model (so it is not counted
twice), `provenance.stale` marks a row upstream has stopped listing, and `provenance.needsReview` plus
`reviewNote` carry an unresolved disagreement and both numbers involved.

## Running it locally

```bash
npm ci                 # `ci`, not `install` — this repo has a lockfile and CI honours it
npm run dev            # http://localhost:5173
```

```bash
npm run verify             # exactly what CI runs, and what the deploy gate runs
npm run sync:pricing:dry   # see what today's sync would change, without writing
```

`verify` is typecheck, lint, format check, tests with coverage thresholds, a production build, catalog
schema validation, and the bundle budget. The deploy workflow calls the same reusable workflow CI does
and publishes the artifact it produced, so a commit that fails any of them cannot reach the live site.

## Project layout

```
src/lib/engine/     the cost engine — pure functions, no React, heavily tested
src/lib/tokenize/   exact tokenizer (lazy-loaded) + calibrated ratios
src/lib/pricing/    catalog schema, validation, lookups
src/lib/alerts/     browser-side push and alerts API client
src/components/     the four views
src/lib/seo/        the generated pages: slugs, page model, HTML renderer
scripts/            the daily sync pipeline (scripts/lib is unit-tested)
data/               capture patterns and hand-verified overrides
public/data/        the published catalog the app reads
public/sw.js        service worker — push display only, no offline cache
worker/             the alerts API (Cloudflare Worker, own package and tests)
api/                the public pricing API on promptspend.dev (own package and tests)
```

Beyond the calculator, the build writes 159 crawlable pages — one per model, one per provider, and a
curated set of head-to-heads — from the same catalog and the same cost engine. See
[docs/PAGES.md](docs/PAGES.md).

## Design and accessibility

Cobalt on a cool-paper canvas, with a distinct set of _money_ colours that never change with branding:
green means savings, red means this option costs more. The input/output chart pair is validated for
colour-vision deficiency **in CI** — `src/lib/palette.test.ts` simulates protanopia and deuteranopia and
fails the build if the two marks stop being distinguishable.

`src/lib/contrast.test.ts` reads `tokens.css` directly and fails the build if any accent, on any theme and
any canvas, drops below 4.5:1 against a surface it can appear on. Every interactive target is at least
24×24 (44×44 on touch), no text renders below 12px, and there is no horizontal page scroll from 320px up.
Keyboard navigation throughout — including every point on the value map, which is a real button — focus is
returned when a dialog closes, `prefers-reduced-motion` is respected in JavaScript as well as CSS, and
there is a `Ctrl`/`Cmd`+`K` command palette.

## Documentation

| Document                                               | What is in it                                                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)           | How the pipeline, the engine and the state layer work, and **why** each is shaped that way               |
| [docs/TESTING.md](docs/TESTING.md)                     | What the 425 tests cover, the uneven coverage thresholds, and what the suite deliberately does not cover |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)     | "The estimate does not match my bill", flagged prices, missing models, running it locally                |
| [docs/PAGES.md](docs/PAGES.md)                         | The 159 generated pages: what is built, why the comparison set is curated, and the IndexNow pipeline     |
| [docs/API.md](docs/API.md)                             | The public pricing API on `promptspend.dev` — endpoints, why it fetches rather than bundles, going live  |
| [docs/DOMAINS.md](docs/DOMAINS.md)                     | What each hostname serves and why, plus the cutover runbook and rollback                                 |
| [docs/pricing-changelog.md](docs/pricing-changelog.md) | Every price change the daily sync has published, written by the pipeline itself                          |
| [CHANGELOG.md](CHANGELOG.md)                           | Changes to the application, as opposed to the data                                                       |
| [CONTRIBUTING.md](CONTRIBUTING.md)                     | Adding a model, the house style, and the rules that are not negotiable                                   |
| [SECURITY.md](SECURITY.md)                             | What is in scope — including a wrong price, which is treated as the most serious class of bug            |

## Contributing

Adding a model is usually a one-line change. See [CONTRIBUTING.md](CONTRIBUTING.md), or open a
[model request](../../issues/new?template=model-request.yml) and someone will pick it up.

Not a code change? **info@promptspend.com**. Security reports go to
**security@promptspend.com** or GitHub's private vulnerability reporting — see [SECURITY.md](SECURITY.md).

The three rules that are not up for negotiation, because breaking any of them turns an estimator into a
guess with good typography:

1. **Never invent a rate.** If a provider does not publish a number, charge full price and say so.
2. **A claim on screen must be true of the code.** When behaviour and copy disagree, fixing the copy is a
   legitimate fix; leaving both is not.
3. **No enabled control that does nothing.** Describe a planned feature — do not simulate it.

## Honest limitations

The point of this section is that it is longer than it needs to be. An estimator that hides its edges is
just a confident guess.

- **Scope of the prices.** Standard-tier, global-endpoint list prices in USD. Not modelled: regional and
  data-residency premiums (OpenAI and Anthropic both charge 1.1×), fast/priority tiers, server-side tool
  call fees, fine-tuning, and negotiated or committed-use discounts. The site says this under every
  estimate, not only here.
- **"Exact" means exact raw text.** The tokenizer counts the string you give it. A real request also bills
  message framing, tool definitions and any images. Treat an exact count as a floor.
- **Token counts for non-OpenAI families are estimates** from calibrated characters-per-token ratios,
  labelled as such everywhere they appear. Those providers do not ship a browser-runnable tokenizer.
- **The capability axis on the value map is illustrative**, not a benchmark. Models without an estimate
  are not plotted at all rather than being given a default, and the chart says how many that is.
- **Caching is off by default** and the estimate charges cache writes where a provider publishes a rate.
  Where one does not, cached tokens are billed at the full input rate rather than at an invented discount.
- **Long-context tiers are modelled where they are published** (per request, not per conversation). Where
  a provider has a tier we have not recorded, the estimate says so instead of quietly using the flat rate.
- **Exact counting downloads a ~3 MB tokenizer chunk**, and only when you paste text for an OpenAI-family
  model. The initial page is under 100 KB gzipped, and CI fails if that stops being true.

## Privacy, precisely

**The estimator itself sends nothing anywhere.** No accounts, no analytics, no cookies. Fonts are
self-hosted. Pasted prompt text is tokenised in your browser, deliberately excluded from the shareable
URL, held in a bounded in-memory cache, and gone when you close the tab. `localStorage` holds two things:
whether you dismissed the welcome banner, and your theme choice.

**Price alerts are the one exception, and only if you opt in.** They are a feature you have to switch on,
and they are the only reason this project has a server at all
(a Cloudflare Worker — [docs/ALERTS.md](docs/ALERTS.md)). Precisely what changes:

- The Content Security Policy opens `connect-src` for that one API origin, and — only where Turnstile is
  configured — `script-src` and `frame-src` for `challenges.cloudflare.com`. Nothing else, ever. That
  `connect-src` line is what stops a compromised dependency exfiltrating a pasted prompt, so it is
  generated from one configured value rather than hand-maintained.
- **Browser push stores nothing personal.** A push subscription is an opaque URL the browser issues. No
  address, no name, nothing that identifies you.
- **Email stores your address**, the models you follow, and the date you asked. That is the whole record.
  No name, no raw IP (consent is recorded as a salted hash), no opens, no clicks, no third-party
  processor. Double opt-in, one-click unsubscribe, and unconfirmed addresses are deleted within a week.
- The alerts form never sees anything you paste into the estimator. Those are different parts of the page
  and the prompt text never leaves the browser.

A deployment with no API configured — which is what this repository builds by default — keeps a strictly
self-only policy and says on screen that alerts are not switched on, rather than rendering a form that
cannot work.

## Security

See [SECURITY.md](SECURITY.md). Wrong prices are treated as the most serious class of bug this project
can have, and are explicitly in scope for a report.

## Licence

MIT — see [LICENSE](LICENSE). The self-hosted typefaces (Space Grotesk, IBM Plex Sans, JetBrains Mono)
are SIL Open Font License 1.1.
