# Google Play Developer Page package

Status: draft preparation only. Nothing in this document has been uploaded or
saved to Play Console.

## Account-level fields

Use the corporate developer identity on this page, not the app listing identity.

- **Developer name:** `Crestwood Holdings`
- **Website:** `https://crestwood.holdings/`
- **Featured app:** `PromptSpend` after the app listing has been created
- **Promotional text (138/140 characters):**
  `PromptSpend helps teams estimate, compare, and understand LLM API costs with current pricing evidence—before the first production invoice.`

The verified company website is `crestwood.holdings`; do not enter
`crestwood.holdings.com`. The app listing itself continues to use
`https://promptspend.com/` for its marketing, support, and privacy links.

## Required artwork

The current Play Console page is the authority for the exact upload validation.
The official Developer Profile guidance specifies:

- **Developer icon:** 512 × 512, JPEG or opaque 24-bit PNG as shown in the
  current Console, maximum 1 MB. Do not add badges, prices, rankings, or store
  marks.
- **Header image:** 4096 × 2304, JPEG or opaque 24-bit PNG. Keep the focal
  message and brand inside the center safe area; edge content may be cropped in
  some placements.

Existing source assets:

- `apps/mobile/assets/images/icon.png` — 1024 × 1024, opaque, 47 KB. This is a
  good source for an opaque 512 × 512 developer icon export.
- `assets/logo.png` — 834 × 197 with transparency. Useful as a design source,
  but it cannot be uploaded directly as the header because it has alpha and the
  wrong aspect ratio.
- `assets/poster.png` — 1920 × 1080. Reference artwork only; it is not the
  required Developer Page header size.
- `assets/social-card.png` — 1280 × 640. Reference artwork only; it is not the
  required Developer Page header size.

## Recommended creative direction

Because this is a developer-level page, the header should represent **Crestwood
Holdings** while using the PromptSpend visual language. Use the cobalt/ink/cool
paper palette, restrained typography, and a quiet evidence-led visual motif.
The header should say what the company makes without pretending that Crestwood
has a larger app portfolio than it does.

Recommended draft concept:

- Background: cool paper with a subtle cobalt-to-slate field, no transparent
  areas.
- Center-safe message: `Crestwood Holdings` and `Clearer decisions for AI
  costs.`
- Supporting visual: a simplified cost-brief surface and provenance/freshness
  cue derived from the real PromptSpend UI.
- Do not show exact prices, rankings, awards, download counts, Google Play
  badges, provider logos, fake testimonials, or device mockups.
- Keep the PromptSpend icon secondary so it does not duplicate the icon shown
  beside the developer page.

## Store-side sequence when the account is ready

1. Confirm the Google Play developer account shows the verified organization
   identity and the intended developer name.
2. Upload the final opaque developer icon and header image.
3. Enter the promotional text and `https://crestwood.holdings/`.
4. Create/select the PromptSpend app listing, then select it as the featured
   app.
5. Save and preview the page on desktop and mobile before accepting the result.
6. Allow for Google’s propagation window: the profile preview may take up to an
   hour and the public page may take up to 24 hours to appear or update.

This page work is independent of the pending Apple organization migration. It
does not authorize an Android upload, closed test, production-access request,
store review, or public release.

## Final approval items

Before generating the final header, Andrew should approve:

- the corporate wording `Crestwood Holdings` / `Clearer decisions for AI costs`;
- whether the developer icon should be the PromptSpend mark or a separate
  Crestwood Holdings mark; and
- whether PromptSpend should be featured immediately when its listing exists.
