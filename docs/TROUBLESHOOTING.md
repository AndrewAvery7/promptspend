# Troubleshooting

Most reports fall into one of two groups: "this number looks wrong" and "the
site is misbehaving". The first group is far more common, and usually has an
answer on this page.

---

## The estimate does not match my real bill

### Start here: read the assumptions

Every estimate lists **Assumptions in these numbers** directly under the
results. Nine times out of ten the gap is in that list. Work through it before
anything else:

- **Caching.** Off by default. If you turned it on, you told the estimate that
  60% of your input hits the cache — that is a claim about _your_ traffic, and
  if your prefix changes between requests (a timestamp near the top of a system
  prompt will do it) your real hit rate may be near zero.
- **Batch.** Halves most rates. Only applies if you are actually using the batch
  API.
- **Reasoning multiplier.** Defaults to 1×. If you are using a thinking model
  and have not raised it, the estimate is missing every hidden reasoning token,
  and those are billed at the output rate.
- **Promotional pricing.** If a model is inside an introductory window the
  estimate uses the promotional rate and says so — including the date it ends.

### The estimate is lower than my bill

In rough order of likelihood:

1. **Reasoning tokens.** A 200-token answer can arrive with several thousand
   billed output tokens behind it. Raise the multiplier to what your provider's
   usage field actually reports.
2. **Message framing.** An exact count is exact over _the text you pasted_. A
   real request also bills role and message framing, tool definitions, structured
   output schemas and any images. Treat the count as a floor.
3. **Something we do not model.** Regional and data-residency endpoints carry a
   10% premium at both OpenAI and Anthropic. Fast/priority tiers cost more.
   Server-side tools (web search, code interpreter, file search) are charged per
   call on top of tokens. None of these are included, and the scope line under
   every estimate says so.
4. **Longer conversations than you set.** Cost grows with the _square_ of the
   turn count, so being wrong about turns is much more expensive than being
   wrong about prompt length.

### The estimate is higher than my bill

1. **You are caching and did not tell it.** Turn the cache assumption on and set
   the share to your measured hit rate.
2. **You are using batch.** Tick the batch toggle.
3. **A long-context tier applied that should not have.** Check whether the
   estimate says "_N_ of _M_ turns exceed 272K input tokens". If your real
   requests stay under that, your turn count or prompt sizes are set too high.

---

## Two models disagree about the same prompt

That is real, and it is one of the things the site exists to show. Tokenizers
differ per family: the same paragraph is a different number of tokens on GPT-5
than on Claude, and the gap widens sharply for code and for Chinese or Japanese
text, where one character can be a whole token.

Each card is costed against **its own** model's view of the text. The count next
to the field label belongs to the first selected model — the one whose tokenizer
that label refers to.

**Exact vs estimated.** OpenAI-family models get an exact count from the real
tokenizer, run in your browser. Everyone else gets a calibrated
characters-per-token ratio, labelled `est`, because those providers do not ship
a tokenizer that can run client-side.

---

## A price is flagged CHECK — which number do I trust?

The badge means the two automated sources disagree by more than 20%. Select it
to see both figures.

The row ships at **the primary feed's number**. The cross-check raises a hand;
it never overwrites. In practice most flags are OpenRouter's reseller pricing
differing from a first-party list price, which is legitimate rather than an
error — but until someone confirms it against the vendor, you are being shown a
range and told which end you are looking at.

Rows marked `vendor ✓` were checked by hand against the vendor's own page and
link to it. Those are never flagged by the cross-check.

If you can confirm a flagged rate,
[open a model request](https://github.com/AndrewAvery7/promptspend/issues/new?template=model-request.yml)
with the vendor link — that is what turns a flag into a verified row.

---

## A model I use is missing

Either it is outside the capture patterns, or its provider is not tracked yet.
[Open a model request](https://github.com/AndrewAvery7/promptspend/issues/new?template=model-request.yml);
adding a family is usually a one-line change to `data/models-allowlist.json`.

Two things that look like missing models but are not:

- **Aliases.** `gpt-5.6` routes to `gpt-5.6-sol`, so it appears in the catalog
  table marked `alias` but not in the picker — selecting the same model twice is
  not a comparison.
- **Retired models.** Legacy, deprecated and unlisted rows are hidden from the
  Compare table by default. Tick "Show legacy, deprecated and unlisted models".

---

## The prices look stale

The header shows two dates, deliberately:

- **Prices last changed** — the day a published rate actually moved. On a quiet
  week this is _supposed_ to age.
- **Sources last checked** — the last time the pipeline ran cleanly. This is the
  one that indicates a problem if it stops moving.

The full picture is at
[`data/sync-status.json`](https://promptspend.com/data/sync-status.json):
attempted and succeeded timestamps, per-source status, row counts and a catalog
fingerprint. If a run was **degraded** — a source unavailable, a payload
suspiciously small, the catalog about to shrink — it publishes nothing, records
why in that file, and the Data & Alerts page says so on screen.

---

## The page will not load, or shows an error

**"Pricing data could not be loaded"** — the catalog file could not be fetched or
failed schema validation. If it persists it is a deployment problem, not
something you can fix locally; please open an issue.

**"Something in that scenario broke the calculator"** — a rendering failure the
error boundary caught. The scenario lives entirely in the query string, so
"Start a fresh scenario" clears it. Please open an issue **with the URL you
used**; that alone reproduces it.

**A blank page** should not happen. If it does, that is a serious bug — the
console output and the URL are exactly what a fix needs.

---

## Running it locally

```bash
npm ci                 # `ci`, not `install`
npm run dev
```

**`npm run format:check` fails on every file.** Your clone predates
`.gitattributes`, or your Git rewrote line endings. Re-clone, or run
`git add --renormalize .`.

**The dev server will not start on Windows.** If your Node is under
`C:\Program Files`, the unquoted space breaks some launchers. Invoking Vite
directly avoids it: `node node_modules/vite/bin/vite.js`.

**`npm run sync:pricing` reports a degraded run.** Working as designed — it
means a source was unavailable, returned too few rows, or the catalog would have
shrunk more than 10%. It writes the health manifest and refuses to touch
`pricing.json`. Use `npm run sync:pricing:dry` to see what it would have done,
or `--litellm-file ./fixture.json` to run it entirely offline.

**Tests pass but the layout is wrong.** Expected — jsdom has no layout engine, so
the suite cannot see geometry at all. Check responsive and accessibility changes
in a real browser; see [TESTING.md](TESTING.md).
