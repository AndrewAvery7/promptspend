# Free-tier pages

`/free-tiers/` compares whether each provider in the catalog lets a new account
use its API without paying, and `/providers/<slug>/free/` answers that question
for one provider at a time. Thirteen pages, built with the rest of the site.

Prices have two independent feeds to check them against. Free tiers have none:
there is no aggregator for "does a new account need a card", vendors phrase
these terms loosely, and they change them often. So these pages make one claim
only — **this is what the vendor's own page said, here is the page, and here is
the day we read it** — and the build refuses any fact that arrives without all
three.

## Where the facts live

`data/free-tiers.json`, one record per catalog provider. Each record has:

| Field                       | What it is                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `verdict`                   | `ongoing`, `one-time`, `none` or `unclear` — the headline answer                            |
| `answer`                    | One or two sentences a reader came for                                                      |
| `card`, `training`          | Whether any payment is needed to start; whether free use trains the vendor's models         |
| `trainingNote`, `whatsFree` | Short qualifiers for the comparison table                                                   |
| `updated`                   | When this record's _content_ last changed — the sitemap date, never the check date          |
| `basis`                     | The fact ids each headline field rests on. A headline with no basis fails the build         |
| `facts[]`                   | `statement` (our words), `quote` (theirs), `url`, optional `readUrl`, `readOn`, `topic`     |
| `facts[].conflictsWith`     | Another fact of the same vendor that contradicts this one — always recorded from both sides |
| `unpublished`               | What we looked for and the vendor does not publish, in words, instead of a guess            |

`src/lib/free-tiers/types.ts` is the gate. It reports every problem at once:
a missing quote, link or date; a non-https source; a read date after the
record's `updated`; markdown left in a quote; a contradiction recorded from one
side only; a headline resting on a fact that does not exist; a misspelt field;
and a record set that does not match the catalog's providers exactly.

### Quotes are verbatim

The only edits allowed are markup: a table row's cells are joined with `·`, a
link keeps its words and loses its address, and `…` marks an omission. Anything
else — tidying grammar, fixing the vendor's typo ("an Trial API key") — makes
the quote a paraphrase, and a paraphrase cannot be checked against the page.

### When a vendor contradicts itself

Both facts stay, each names the other in `conflictsWith`, and the page says
"another of their own pages says something different; both are shown, we don't
pick one". The headline becomes `unclear` when the contradiction is about the
headline itself (Anthropic: free credits, or buy first?). Picking a side would
be a claim the vendor never made — the same reason a disputed price is shown as
disputed rather than reconciled.

## The daily check

`scripts/check-free-tiers.ts` runs in `sync-pricing.yml` each morning, beside
the vendor price check. For every source page it:

1. reads `readUrl` (often a Markdown twin) by plain fetch;
2. for any quote not found there, reads the human `url` rendered by Firecrawl,
   when `FIRECRAWL_API_KEY` is set (some pages — DeepSeek's FAQ, x.ai — exist
   only after JavaScript runs);
3. records each fact as `confirmed`, `missing` or `unread`. Only the rendered
   page can make a fact `missing`: a plain fetch that lacks the words proves
   nothing, because several vendors draw the quoted table with JavaScript. If
   the page cannot be rendered today the fact is `unread`, which says nothing
   about the wording and raises nothing.

Matching reduces both sides to lowercase letters and digits, so markup,
punctuation, curly quotes and line breaks never cause a false alarm while a
changed word or figure always does. See `src/lib/free-tiers/quote.ts`.

The report is `public/data/free-tier-check.json`. The pages read it:

- a confirmed fact shows "still there on" with the last date it was seen;
- a missing fact shows a notice with the date it disappeared, and stays
  otherwise unchanged until a person looks;
- the day a quote disappears (or comes back) moves that page's sitemap `lastmod`;
  a routine confirmation never does. The "still there on" date changes most
  mornings and is deliberately not material, the same rule the model pages
  apply to `lastVerified`: a sitemap that called every page changed each day
  would teach crawlers to ignore it.

On the morning a quote first goes missing the workflow comments on (or opens) a
rolling issue, **Free-tier wording changed at the source**. It does not repeat
itself on later mornings; the page already says so.

The check never edits a fact and never fails the sync.

## Updating a record

When the issue fires, or a vendor announces a change:

1. Open the source. If the vendor reworded the same terms, replace `quote` with
   the new wording and set `readOn` to today. A `readOn` newer than the check's
   last reading resets that fact's check state.
2. If the terms themselves changed, update `statement` too, then the provider's
   `answer`, `verdict`, `whatsFree`, `card` or `training` as needed, and set
   `updated` to today so the sitemap reports the change.
3. Run `npm test -- free-tiers` and `npm run check:free-tiers -- --only <provider>`.

Never delete a fact to make a warning go away. If a page has gone, find where
the vendor now says it, or move the claim to `unpublished`.

## What these pages do not cover

Only the providers in the catalog. Hosts such as Groq, Cerebras and OpenRouter
publish their own free tiers, and the most-visited free-tier pages elsewhere
are often theirs; covering hosts is a catalog decision, not a page decision.

Rate limits that a vendor shows only inside its logged-in console (Google,
Mistral, Z.ai, Anthropic's Evaluation tier) are listed under "doesn't publish"
rather than copied from a screenshot or a forum.

The providers index and each provider's pricing page show the verdict as a
link. Their sitemap date follows their prices, not the verdict, so a change of
verdict reaches those two pages without moving their `lastmod`; the free-tier
page itself, where the answer is, does move.
