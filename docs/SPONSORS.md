# Sponsors: the policy

**Status: policy, no sponsor yet.** On 2026-10-06 the owner decided PromptSpend may
accept clearly labelled sponsors, and that a sponsor may never appear inside the
price data. The site still says "no ads" until the first sponsor goes live, and
that line changes in the same release.

A price comparison is only worth reading if nobody paid to move a number. The
rules below exist to keep that true and to make it visible.

## The rules

1. **Never in the data.** No sponsor in a price table, a ranking, a comparison,
   the value map, the calculator's results, the free-tier pages' answers, the
   API, the MCP server, the VS Code extension or the data files. A sponsor can
   never change an order, a price, a flag or a "cheapest" label.
2. **Always labelled.** Every placement says "Sponsor" in words, not only a
   colour, and its link carries `rel="sponsored"`.
3. **One per page, outside the content.** A single slot, below the main content,
   visually separate from it. No pop-ups, no floating banners, no sponsor inside
   an article or a table row.
4. **No sponsor tracking.** The sponsor's image is hosted by PromptSpend, so no
   sponsor script or pixel runs on the page. A sponsor link may carry a campaign
   tag (`utm_source=promptspend`) so the sponsor can count visits on its side.
5. **Disclosed.** The privacy policy and a short "How sponsorship works" note,
   linked from every slot, say what sponsors can and cannot do.
6. **Conflicts.** A company whose prices PromptSpend lists may not sponsor at
   first. If that ever changes, its rows carry a visible note while it sponsors.

## Where a slot could go

| Place                        | Why                                                                  |
| ---------------------------- | -------------------------------------------------------------------- |
| Below the content, home page | The most-visited page; below the calculator, never inside it         |
| Generated-page footer area   | Model, provider and free-tier pages; above the site footer, one slot |
| The monthly price report     | One labelled line in the article and the email, never in the figures |

Not in: the Receipt, the apps (their store declarations say "no ads"; changing
that means a store resubmission), the API, the MCP server or the extension.

## What it is worth

For scale: pricepertoken.com, with traffic several times PromptSpend's, sells a
pinned table row at $600 a month, a floating banner at $400 and a hero block at
$500, and reported about $1,800 a month in total (TrustMRR, October 2026). Its
pinned row inside the price table is exactly what rule 1 forbids here. Pricing
for PromptSpend should follow its own traffic, which the analytics planned in
the privacy review will measure.

## Building it

When the first sponsor is agreed: a small configuration file (name, label,
image, link, start and end dates), one slot component for the site and one for
the generated pages, the disclosure page, a test that no slot can render inside
a table or the calculator results, and the footer and privacy-policy changes.
An expired sponsor disappears on its end date without a code change.
