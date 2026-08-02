# TokenTally

**Know the tab before you build.** Estimate, compare and understand what an AI feature will cost — with
pricing that syncs itself every day, so the numbers are never a year out of date.

[**→ Open TokenTally**](https://andrewavery7.github.io/token-tally/) · free · open source · no accounts,
no tracking

---

## Why this exists

Every LLM cost calculator on the web has the same failure mode: it is a snapshot. Someone builds it,
hard-codes a dozen model prices, and within a few months the entire premise is wrong — the models it
compares have been superseded and the prices it quotes no longer exist.

TokenTally is built the other way round. **The pricing pipeline is the product**; the calculator is what
sits on top of it. Every morning a GitHub Action re-fetches the catalog from independent sources, merges
them under an explicit trust order, runs sanity checks, and either commits the result or opens a pull
request for a human. Capture patterns are family-level, so a brand-new model version is picked up
automatically without anyone touching code.

## What it does

- **Estimate** — describe one interaction (paste your real prompt or move the sliders), set your scale,
  and see the monthly, yearly, per-user and margin numbers for up to four models side by side.
- **Compare** — every tracked model on a price-versus-capability value map, plus a sortable catalog with
  the source and verification date for every row.
- **Learn** — seven short interactive lessons on tokens, why output costs more, compounding chat history,
  hidden reasoning tokens, caching and batching, and how the data pipeline works.
- **Data & Alerts** — full provenance for every number, what is currently flagged, and how to subscribe
  to pricing changes.

## Things it does that most calculators get wrong

|                                   |                                                                                                                                                                                               |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Output is priced separately**   | Output typically costs 3–5× input. Averaging the two, as many calculators do, understates most real workloads.                                                                                |
| **Chat history compounds**        | Turn _N_ re-sends turns 1…*N*−1 as input, so conversation cost grows with the square of the turn count.                                                                                       |
| **Tokenizers differ per family**  | The same pasted text is counted with each model's own tokenizer — exactly (js-tiktoken, run in your browser) for OpenAI-family models and with a clearly labelled calibrated ratio elsewhere. |
| **Caching is modelled honestly**  | The published cached-input rate is used where a provider has one; where none exists, the assumed discount is stated on screen.                                                                |
| **Reasoning tokens are billable** | A multiplier for hidden thinking tokens, because the visible answer is not what you pay for.                                                                                                  |
| **Promotional pricing expires**   | Introductory rates apply only inside their window, and the engine takes a date.                                                                                                               |
| **Assumptions are visible**       | Every non-published number used in a calculation is listed under the results, not buried.                                                                                                     |

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
4. **Sanity rules** — schema validation, non-negative rates, an implausibility check, and a hold on any
   price that moved more than 50% in a single day.

A clean diff is committed and deployed automatically. Anything flagged becomes a pull request. Either way
the change lands in [`docs/pricing-changelog.md`](docs/pricing-changelog.md).

## Use the data yourself

The catalog is a plain, versioned JSON file with a stable shape — treat it as a small public dataset:

```
https://andrewavery7.github.io/token-tally/data/pricing.json
```

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-08-01T23:19:38.000Z",
  "providers": [{ "id": "deepseek", "name": "DeepSeek", "country": "CN" }],
  "models": [
    {
      "id": "deepseek-deepseek-v3.2",
      "providerId": "deepseek",
      "displayName": "DeepSeek V3.2",
      "pricing": { "input": 0.28, "output": 0.4 }, // USD per 1M tokens
      "tokenizer": { "kind": "approx", "charsPerToken": 3.4, "cjkCharsPerToken": 1.7 },
      "provenance": { "source": "litellm", "lastVerified": "2026-08-01" },
    },
  ],
}
```

## Running it locally

```bash
npm install
npm run dev            # http://localhost:5173
```

```bash
npm run verify         # typecheck + lint + tests + build, exactly what CI runs
npm run sync:pricing:dry   # see what today's sync would change, without writing
```

## Project layout

```
src/lib/engine/     the cost engine — pure functions, no React, heavily tested
src/lib/tokenize/   exact tokenizer (lazy-loaded) + calibrated ratios
src/lib/pricing/    catalog schema, validation, lookups
src/components/     the four views
scripts/            the daily sync pipeline (scripts/lib is unit-tested)
data/               capture patterns and hand-verified overrides
public/data/        the published catalog the app reads
```

## Design and accessibility

Cobalt on a cool-paper canvas, with a distinct set of _money_ colours that never change with branding:
green means savings, red means this option costs more. The input/output chart pair is validated for
colour-vision deficiency **in CI** — `src/lib/palette.test.ts` simulates protanopia and deuteranopia and
fails the build if the two marks stop being distinguishable. Light and dark themes, keyboard navigation
throughout, `prefers-reduced-motion` respected, and a `Ctrl`/`Cmd`+`K` command palette.

## Contributing

Adding a model is usually a one-line change. See [CONTRIBUTING.md](CONTRIBUTING.md), or open a
[model request](../../issues/new?template=model-request.yml) and someone will pick it up.

## Honest limitations

- Token counts for non-OpenAI families are **estimates** from calibrated ratios, labelled as such
  everywhere they appear. Those providers do not ship a browser-runnable tokenizer.
- The capability axis on the value map is an **illustrative placeholder**, not a benchmark score. It is
  labelled that way on the chart.
- Prices are list prices in USD. Enterprise agreements, committed-use discounts and regional pricing are
  not modelled.
- Exact counting downloads a ~3 MB tokenizer chunk, and only when you paste text for an OpenAI-family
  model. Nothing else on the site is anywhere near that size.

## Licence

MIT — see [LICENSE](LICENSE).
