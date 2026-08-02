# Contributing

Thanks for helping. The most valuable contributions here are usually small: a model that is missing, a
price that looks wrong, or a lesson that could be clearer.

## Add a model in one pull request

Models are captured by **family patterns**, not by name, so a new version of an already-tracked family
arrives automatically with the next daily sync. You only need to touch anything when a whole new family
or provider shows up.

1. Add the provider to `providers` in `data/models-allowlist.json` if it is not there.
2. Add a family entry:

```jsonc
{
  "id": "newprovider-flagship",
  "providerId": "newprovider",
  "include": ["^newprovider/flagship-\\d+(\\.\\d+)?$"], // version-agnostic on purpose
  "stripPrefix": "newprovider/",
  "tokenizer": { "kind": "approx", "charsPerToken": 3.6, "cjkCharsPerToken": 1.6 },
  "capabilities": { "reasoning": true, "vision": false },
}
```

3. Check what it captures without writing anything:

```bash
npm run sync:pricing:dry
```

If you are adding a hand-verified vendor rate to `data/pricing-overrides.json`, include `verifiedUrl` and
`lastVerified`. A vendor claim with no link to the page it came from is not verifiable, and unverifiable is
the state this project exists to get out of.

4. Optionally add a display name and a hand-verified price in `data/pricing-overrides.json`.

**Write patterns that survive the next release.** `^gpt-5(\.\d+)?$` keeps working when GPT-5.7 ships;
`^gpt-5\.6$` does not, and quietly re-creates the staleness problem this project exists to avoid.

## Correcting a price

Never edit `public/data/pricing.json` — the sync regenerates it. Put the correct value in
`data/pricing-overrides.json` with `"vendorVerified": true` and the date you checked it. Overrides beat
every automated source, and the UI shows the model as vendor-verified.

## Before you open a pull request

```bash
npm run verify
```

That runs the typecheck, the linter, the formatter check, the full test suite and a production build —
the same things CI runs.

## What the tests protect

- `src/lib/engine/*.test.ts` — the cost maths. Anything that changes a number a user sees belongs here
  first. Add the case, watch it fail, then make it pass.
- `scripts/lib/pipeline.test.ts` — the trust ladder and the sanity rules, against fixtures rather than the
  network.
- `src/lib/palette.test.ts` — the colour-vision guarantee. If you re-theme the charts, this tells you
  whether the result is still readable.
- `src/App.test.tsx` — that the views render, the scenario round-trips through the URL, and the tour and
  command palette work.

## House style

- The engine stays pure and free of React. If a calculation needs a component, it is in the wrong place.
- Label estimates as estimates. An unmarked number implies precision we may not have, and that is the one
  thing this project cannot get wrong.
- **Never invent a rate.** If a provider does not publish a number, charge the full price and say so. An
  assumed discount is flattering, and flattering is the failure mode of every calculator on the web.
- **A claim on screen must be true of the code.** If the copy says two sources are compared, two sources
  are compared; if it says a link restores the estimate, it restores the estimate. When behaviour and copy
  disagree, changing the copy is a legitimate fix — quietly leaving both is not.
- **No enabled control that does nothing.** Describe a planned feature; do not simulate it, and never
  accept an email address into a form that cannot subscribe it.
- Comments explain _why_, not _what_. The code already says what.
- New user-facing copy should read the way the rest of the site reads: plain sentences, no jargon without
  a definition, and no hype.
