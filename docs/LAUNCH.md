# Launch surfaces, and what each one renders

The launch itself is still **not done** — see `DEFERRED.md`. This file records
one piece of it that _is_: what every surface shows when the link is posted,
verified against the live site rather than assumed from the markup.

Verified **2026-08-07** against `https://promptspend.com`, the repository, the
Marketplace listing and the registry entry.

## The links that will actually be posted

| Link                                                         | Card comes from | State                       |
| ------------------------------------------------------------ | --------------- | --------------------------- |
| `https://promptspend.com/`                                   | this repository | ✅ verified                 |
| `https://promptspend.com/models/…`, `/compare/…` (159 pages) | this repository | ✅ verified                 |
| `https://github.com/AndrewAvery7/promptspend`                | GitHub          | ❌ **image 403s**           |
| Marketplace `promptspend.promptspend`                        | Microsoft       | ✅ verified                 |
| `@promptspend/mcp` on npm                                    | npm             | ⚠️ not externally checkable |

## What each surface does with the link

Ten crawlers were sent the homepage with their own user agent. All ten answered
**200** with a complete card — nothing in Cloudflare is filtering them, which
was the failure worth ruling out before posting anywhere:

X · Facebook · LinkedIn · Slack · Discord · Reddit · Bluesky · Mastodon ·
Telegram · WhatsApp

The image was fetched separately under each of the same ten agents — crawlers
request it as a second hop, and a card fails just as completely when the page
is fine and the picture is not. All ten: `200 image/png`, 1280×640, 113 KB,
matching the declared `og:image:width`/`height` exactly.

**Hacker News renders no preview at all**, and neither does Lobsters. A Show HN
is a title and a bare domain. Nothing here improves it, and nobody should go
looking for a card that was never going to appear — the work that pays on that
surface is the title, not the artwork.

`www.promptspend.com` and `andrewavery7.github.io/promptspend/` both answer 200
and both declare the **apex** in `og:url` and `og:image`. Posting either by
mistake still renders the right card and still consolidates to one canonical
host.

## The one that is broken

`github.com/AndrewAvery7/promptspend` declares its social preview as

```
https://repository-images.githubusercontent.com/1319848991/e193384e-bc86-4e0d-b475-16532f7ce738
```

and that URL answers **403 AccessDenied** from S3 — on a direct request, on a
redirect-following request, under a browser agent and under Twitterbot alike,
and again twenty minutes later. It is not a signed-URL artifact and it is not
transient. Both sibling repositories' preview images answer **200** from the
same host, which is what rules out the fetch and leaves the object itself.

So every surface that renders the _repository_ link — as opposed to the site
link — shows GitHub's card with a missing image. For an open-source launch that
is the more likely of the two links to be shared.

**Fixing it is a manual step and cannot be scripted.** GitHub exposes no REST or
GraphQL endpoint for a repository's social preview; it is
_Settings → General → Social preview → Upload an image_, and nothing else sets
it. `assets/social-card.png` is already the right asset at the right size —
GitHub asks for 1280×640, which is what `make-assets.py` draws.

## The card carries live figures, and they rot

`assets/social-card.png` shows three monthly costs. They are the cheapest,
middle and dearest of the site's own default estimate, and `make-assets.py`
draws them as string literals, because that script draws everything from
primitives and has no way to read the catalog.

Which means they go stale silently. **They had.** The card drawn 2026-08-02
claimed a mid tier of `$3,240/mo` and a frontier tier of `$9,110/mo`, and the
same two figures were repeated in the `og:image:alt` text. On 2026-08-07 the
product computed `$2,417` and `$11,081` for those two slots.

Worth being exact about how wrong, because it is worse than drift: the two
figures do not correspond to **any** model in the default selection, under
either the 2026-08-02 catalog or today's, at standard or promotional rates.
Priced on the default scenario the four defaults come to $723, $2,416, $11,081
and either $12,082 or $8,055 for Sonnet 5 depending on whether its promotion is
in force — and $3,240 and $9,110 are none of them. Only the budget tier ever
matched, and it still does exactly. So these were not figures that aged; as far
as can be reconstructed they were never true of this catalog. Which is the more
embarrassing failure, on the one image every share renders, in the project
whose first rule is that a claim on screen must be true of the code.

`npm run check:social-card` recomputes all three through the real engine, with
the real default selection, the real default scenario and promotional rates
honoured, and fails when the artwork or the alt text has drifted:

```bash
npm run check:social-card
```

**It is deliberately not in `npm run verify`.** The catalog re-syncs every
morning and `sync-pricing.yml` pushes the result; `deploy.yml` gates on
`verify`. A card check in that gate would mean the next price move on any
default model turns CI red and blocks the price update itself from reaching the
site — trading a stale marketing image for a stale product, which is the wrong
way round. It is a pre-post gate, run deliberately, exactly as
`make-promo.py --check` is.

## Before posting

1. `npm run check:social-card` — the figures move with the catalog, so run it on
   the day, not the week before.
2. Re-upload the repository social preview (above). Confirm with:

   ```bash
   curl -sS -o /dev/null -w '%{http_code}\n' -L https://github.com/AndrewAvery7/promptspend
   ```

   then re-read the repo's `og:image` and check that URL answers 200, not 403.

3. **Force a re-scrape where the card is cached.** The image content changed on
   2026-08-07 but its URL did not, so any surface that cached the old picture
   keeps serving the wrong figures. LinkedIn's Post Inspector and Facebook's
   Sharing Debugger both force a refresh on demand. X retired its public card
   validator, so its cache expires on its own — I have not verified how long
   that takes, so check X by posting to a throwaway account before the real
   post rather than trusting it.
