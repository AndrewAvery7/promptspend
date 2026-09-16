# Sell With Boost listing — PromptSpend

Live since 2026-09-16. A companion to [`ph-launch-copy.md`](ph-launch-copy.md),
which is the Product Hunt kit; nothing here is shared with it.

- Listing: https://sellwithboost.com/startups/promptspend
- Maker profile: https://sellwithboost.com/makers/2754/andrew-avery
- Account: andrew@crestwood.holdings

## What was submitted

| Field        | Value                                                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| Product URL  | https://promptspend.com                                                                                               |
| Product name | PromptSpend                                                                                                           |
| Tags         | LLM Pricing · Cost Calculator · API Pricing · Developer Tools · AI · Open Source · GPT · Claude · MCP · Token Counter |
| Social link  | https://github.com/AndrewAvery7/promptspend (no X or Telegram exists)                                                 |
| Logo         | `ph-thumbnail.png`, the same 240×240 square used for Product Hunt                                                     |
| Launch date  | left blank — see below                                                                                                |
| Plan         | Free, which is the tier that requires the badge                                                                       |

The category was chosen in the browser and the live page does not display it, so
it is not recorded here. Read it off the submission form before assuming.

**Launch date was left deliberately blank.** The field does not say whether it
means "when the product launched" or "when this listing should go live", and the
site was already public. A past date under the second reading either bounces or
publishes immediately into the back of a feed. If it ever needs filling, the
defensible date is 2026-08-02, the `v0.5.0` tag — the first shipped version. It
is _not_ the Product Hunt date, which had not happened when this was written.

### The story

The listing's own copy, as published:

> Every LLM cost calculator goes stale the moment a vendor reprices. PromptSpend
> re-checks its catalog every morning against vendor pages, flags disagreements
> instead of averaging over them, and shows the source URL and confirmation date
> on every number.
>
> Paste a real prompt or set your scale, compare up to four models side by side,
> and see the monthly cost — plus the two numbers every calculator gets wrong:
> compounding chat history and hidden reasoning tokens.
>
> I built it because every pricing calculator I found was a snapshot — someone
> hard-codes a dozen prices, and within a few months the whole thing is quietly
> wrong. So here the pricing pipeline is the product: it re-fetches from
> independent sources each morning, cross-checks them, and either commits a clean
> update or opens a pull request for a human. There is also a public API, an MCP
> server for coding agents, and a VS Code extension that prices the model on the
> line of code that calls it.
>
> Free, no account, open source.

The site then generated an "AI Overview", a key-features list, use cases and an
FAQ from that text. Those are theirs, not ours, and they are not editable from
the submission form.

## The badge, which is the rent

The free tier is approved only while a page on promptspend.com carries a link
back to sellwithboost.com. Directories re-check this, so **removing the footer
badge risks delisting.**

Their embed snippet hot-links the artwork from their CDN and was not used.
`img-src` is `'self' data:` on every surface here, so the browser would have
blocked it and shipped a broken image on every page; and a footer that says "no
tracking" should not hand a directory the IP of every visitor. The two SVGs in
`public/sellwithboost-*.svg` are local copies, self-contained (the mark is a data
URI inside the file), with the opaque plate and border removed so the badge sits
on the footer rather than on a card. See `SWB_URL` in `src/config.ts`.

**The page given for verification is `https://promptspend.com/models/`, and it
has to be a generated page.** promptspend.com itself is a shell that draws its
footer in JavaScript, so a fetch-only verifier sees no badge there and fails you
while the badge is plainly visible in your own browser. Any generated page works;
the calculator's own URL does not.

## Their image frames, measured

Measured on the live site at a 1826px window, 2026-09-16. All three use
`object-fit: cover` centred, so anything the frame's shape does not want is
**cropped, not letterboxed** — and none of the three matches the shape the upload
form asks for.

| Where                   | Frame                  | Shape                                | What survives                                          |
| ----------------------- | ---------------------- | ------------------------------------ | ------------------------------------------------------ |
| Maker profile, public   | 1811 × 224, full-bleed | 8.1:1 and worse as the window widens | the middle **49%** of a 4:1 image                      |
| Maker profile, settings | 606 × 112, card-capped | 5.4:1, fixed                         | the middle 74%                                         |
| Listing gallery         | 813 × 507              | 1.60:1                               | the full height; **8% off each side** of a 1.9:1 image |

Consequences worth not rediscovering:

- The form says a cover photo is "cropped to 1200×300" (4:1). The public profile
  shows barely half of that. A LinkedIn banner dropped in unchanged loses the top
  of its headline and all of its caption row.
  `~/OneDrive/Documents/Employment/sellwithboost-cover/` holds a cover built for
  the real shape, with its own README.
- Gallery images must be **1.60:1** or they lose their left and right edges.
  `swb-gallery/` holds the social card and the five Product Hunt captures padded
  to exactly that, with their own background colour so the join is invisible.
  Nothing is scaled and nothing is lost.
