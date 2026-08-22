# The generated pages

The calculator is one URL whose views are client state. That is the right shape
for a tool and the wrong shape for search: nobody types "LLM cost estimator" into
Google. They type **"gpt-5.6 pricing"** and **"claude opus vs gemini pro cost"**.

`scripts/build-pages.ts` gives every one of those questions a real page, built
from the same catalog and costed by the same engine as the app. 162 of them
today: 72 models, 12 providers, 75 comparisons, 3 indexes.

---

## What gets built

| URL                    | Count | Contains                                                            |
| ---------------------- | ----- | ------------------------------------------------------------------- |
| `/models/`             | 1     | Every model by blended rate, with one workload costed on each       |
| `/models/<slug>/`      | 72    | Full rate card, three monthly bills, rank, alternatives, provenance |
| `/providers/`          | 1     | Every provider, model counts, cheapest model                        |
| `/providers/<slug>/`   | 12    | That provider's models, cheapest first                              |
| `/compare/`            | 1     | Every head-to-head                                                  |
| `/compare/<a>-vs-<b>/` | 75    | Two models side by side on the same three workloads                 |

Aliases and rows upstream has stopped listing do not get pages. Two URLs for one
purchasable model would compete with each other.

## The rule these pages live or die by

**Every page must contain something no other page contains.** Mass-produced
pages that differ only in a name are doorway pages, they are recognised as such,
and they drag down the pages around them.

So each carries its own rate card, its own three monthly bills, its own position
in the catalog, its own cheaper alternatives, and its own honest warnings — a
promotional window, a review flag, a workload that will not fit the context
window. `npm run check:seo` fails the build if two pages share a title or a
description.

### Why the comparison set is curated

The combinatorial answer is 72 × 71 ÷ 2 = 2,556 pages, nearly all comparing
things nobody would choose between. A $0.14 flash model against a $75 frontier
model is not a decision, it is a category difference.

A pair qualifies only when it is a real decision: both models current and still
listed, from **different providers** (which is what people search — "claude vs
gpt", never "gpt-5 vs gpt-5-mini"), both scored, and within 3× of each other on
blended rate. Each model contributes its three nearest peers by capability; the
union is deduplicated and capped. **Reaching the cap is logged**, because a page
set that quietly shrank looks exactly like one that is complete.

## Three constraints, each the reason for the next

1. **No JavaScript.** These pages state numbers. A React bundle to render static
   text would cost every visitor a download and make the content invisible to
   anything that does not run scripts. The only `<script>` is the JSON-LD data
   block, which is not executed.
2. **Therefore a very tight policy** — `default-src 'none'`, with the JSON-LD
   admitted by its exact SHA-256 rather than `'unsafe-inline'`. The hash is
   computed over the string that is actually emitted, so the two cannot drift.
3. **Therefore no external anything**: no fonts, no analytics, no images beyond
   an inline SVG favicon. Which is also the honest position for a site whose
   footer says "no accounts, no tracking".

A consequence worth knowing: `style-src 'self'` with no `'unsafe-inline'` means
**an inline `style=` attribute is silently dropped**. There is a test asserting
none exist.

## Slugs are permanent

A slug is derived from the model **id**, never the display name. Display names
get tidied up — the changelog is full of it — and a URL that moves throws away
everything the page has earned.

The one transformation is collapsing a doubled leading token, so
`gemini-gemini-2.5-flash` becomes `gemini-2-5-flash` rather than something that looks
like a bug to anyone reading the URL. `assertUniqueSlugs` fails the build if two
ids ever land on one address; a collision would mean the second page silently
overwrote the first.

## Where it runs

```
npm run build          # vite build, then build:pages
npm run build:pages    # just the pages, against an existing dist/
npm run check:seo      # the gate
```

A post-build script rather than a Vite plugin: it needs the finished `dist/`, it
writes ~160 files, and keeping it out of the config leaves `vite.config.ts` about
building the app. `sitemap.xml` moved here too — it has to list these pages, and
the config has no idea they exist.

`check:seo` asserts, on the built artifact: unique titles and descriptions within
length limits, a self-referencing absolute canonical on every page, valid
JSON-LD, a policy with no `unsafe-inline`, a sitemap entry per page, and that
**every internal link resolves to a file that exists**. That last one catches the
failure with no symptom: the page renders perfectly and the link is dead.

---

## IndexNow

When prices move, `scripts/ping-indexnow.ts` submits exactly the pages a reader
would now see differently — the changed models, every comparison they appear on,
the providers that list them, the index tables and the calculator. It runs from
the same workflow that notifies subscribers, on the same trigger.

**Bing, Yandex, Seznam and Naver read this. Google does not** — it has never
joined IndexNow and finds these pages through the sitemap and ordinary crawling.
Worth stating plainly, because "we tell search engines when prices change" sounds
like it includes the one that matters most.

Submitting the whole sitemap on every change would be simpler and is exactly what
gets a host's submissions ignored: the protocol is for pages that genuinely
changed, and crying wolf on 160 URLs a day teaches a crawler to stop listening.

The key is `scripts/lib/indexnow.ts` and it is **public by design** — the whole
verification model is that it is readable at
`https://promptspend.com/<key>.txt`. The build emits that file; `check:seo`
fails if it is missing, because without it every submission is refused and the
only sign is a 403 in a job nobody reads.

A rejected submission is a warning, never a failed build. IndexNow is an
optimisation on top of ordinary crawling, and it must not be able to turn a
perfectly good pricing update into a red deploy.

---

## Search Console will report structured data "issues" that must not be fixed

Google emails two recurring warnings about the model pages. Both are expected,
and four of the five suggested fixes would require publishing something untrue.
Read this before acting on one.

**Product snippets — missing `aggregateRating`, missing `review`.** These pages
carry `name` and `offers`, which is valid: Google requires only `name` plus one
of `review`, `aggregateRating` or `offers`. The warning is documented behaviour
for supplying `offers` alone — its own reference says the test "may report a
warning if you provide `offers` without `review` or `aggregateRating`".

There are no reviews and no ratings, because nobody reviews or rates a price
list. Inventing them is not a shortcut, it is the one thing Google names a
manual-action offence: _"reviews or ratings not by actual users may result in
manual action"_, alongside _"don't mark up irrelevant or misleading content,
such as fake reviews"_. **These two warnings are permanent. Leave them.**

**Merchant listings — missing `image`, `shippingDetails`,
`hasMerchantReturnPolicy`.** Merchant listings are for pages "where customers
can purchase products from you". Nothing is sold here; the rates belong to the
vendors and every page links to the vendor's own page to prove it. There is no
shipping and there is no returns policy, so both fields would be fabrications,
and the `image` — an API endpoint has no photograph — would mean attaching a
picture of something else to satisfy a validator. The `image` issue is flagged
**critical**, which means only that it blocks a merchant-listing rich result
these pages should never earn.

What _was_ wrong: the offers carried `availability: https://schema.org/InStock`,
asserting stock held for sale. That has been removed. It was false on its own
terms, and it was the strongest signal inviting Google to grade a price
reference as a shop.

> Whether removing it stops the merchant-listing mail is unverified — Google
> decides what to evaluate, and the warning may persist. The reason to remove it
> was that it was untrue, not that it was noisy.
