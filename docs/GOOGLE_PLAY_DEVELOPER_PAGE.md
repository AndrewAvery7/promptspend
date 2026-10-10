# Google Play Developer Page

Status: **published 2026-10-10.** This file used to be the draft package
(written 2026-09-08, before either app was in a store). It is now the record of
what is live and how to change it.

## What is live

The developer page belongs to the Google Play developer account, not to an app.
The Crestwood Holdings organization account holds both PromptSpend and
Vialmetry, so one page covers both.

- **Public page:** <https://play.google.com/store/apps/dev?id=4914249645624372750>
- **Edit in:** Play Console → Developer account → Play developer profile →
  "Developer page" section → Save changes.

| Field                      | Published value                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Developer icon             | `apps/mobile/store/assets/google-play/developer-page/crestwood-play-icon-512.png`: the navy Crestwood shield, 512 × 512, opaque             |
| Header image               | `apps/mobile/store/assets/google-play/developer-page/crestwood-play-header-4096x2304.png` (details below)                                   |
| Featured app               | PromptSpend                                                                                                                                 |
| Developer website          | `https://crestwood.holdings`                                                                                                                |
| Promotional text (137/140) | `Crestwood Holdings Management LLC builds focused apps: PromptSpend estimates AI model costs; Vialmetry keeps a private log of your vials.` |

The verified organization details above the developer page section (legal
name, address and public developer email) are managed separately under
Account details. They were already correct, so they were not touched.

### Header image

4096 × 2304, opaque PNG, about 190 KB. Google's limits are 1 MB, JPEG or 24-bit
PNG, no transparency.

- Navy field `#0B1F3A`. This is the brand's primary colour; the brand guide
  pairs it with the reversed (white) logo.
- The white horizontal Crestwood logo, with its sub-line retypeset as
  `HOLDINGS MANAGEMENT LLC` in Inter Bold. Store pages use the full legal name.
- A short Heritage Gold (`#A88A4A`) rule, then `Focused, useful apps` in
  Georgia, the brand's primary typeface, in Cool Mist (`#D9DEE3`).
- All content sits in the central safe area (about x 1098–2998,
  y 716–1588), because Google crops the edges in some placements.

The editable source assets (logo masters and the full-name logo PNG) live in the
owner's Crestwood branding folder, outside this repository.

## Naming

The company is legally **Crestwood Holdings Management LLC** and does business
as **Crestwood Holdings**. The store surfaces (this page, and Apple's seller
name) use the legal name. The company website and the master logo use the
trading name. Both are correct; do not "fix" one to match the other.

## Apple

Apple has no editable developer page. The App Store builds the seller page
automatically: <https://apps.apple.com/us/developer/id6800386430>. It lists
both apps under "Crestwood Holdings Management LLC". The iOS 27 header and
search-results images are per-app product-page assets, not developer-page ones.
See `docs/APP_STORE_CREATIVE_BRIEFS.md`.

## Gotchas found while publishing

- **Website validation:** the field shows an `https://` prefix label, but the
  value is only accepted with the scheme typed in full (`https://crestwood.holdings`).
  Typing `crestwood.holdings` or `crestwood.holdings/` gives "Website URL is
  invalid", and the save fails with "Your changes couldn't be saved".
- **Featured app:** only one app can be featured. To feature Vialmetry instead,
  remove the PromptSpend chip and pick it.
- **Propagation:** Google says the public page can take up to 24 hours to show
  a change.

## When to update it

- A third app ships: revisit the promotional text (140-character limit) and
  decide which app is featured. The header names no apps on purpose, so it
  does not go stale.
- The trading name or logo changes: rebuild the header to the same layout.
