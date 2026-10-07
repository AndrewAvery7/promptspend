# App Store creative asset briefs: PromptSpend and Vialmetry

Status: artwork PRODUCED for owner review (2026-10-07). Nothing has been uploaded to
App Store Connect.
Sources: Apple, "App Store asset best practices" and App Store Connect Help,
"Creative assets specifications" (both read 2026-10-07).

## 0. Outcome (read this first)

Decisions taken (the four recommendations): one universal 16:9 file per app, plus
dedicated 21:9 and 3:2 files; relative bars only, no currency figures; no syringe or
needle imagery; real captures for Vialmetry. Headline choices: PromptSpend "Know the
tab before you build." (header) and "Compare AI model costs" (search); Vialmetry
"Your vial log. Private on your device." (header) and "Vial log and site rotation"
(search). Vialmetry carries the quiet "No ads. No tracking." line on the header only.

Files (all opaque RGB PNG, exact Apple sizes, verified by script):

- PromptSpend: `apps/mobile/store/assets/apple/` (uncommitted)
- Vialmetry: `.claude/worktrees/store-submit/docs/store/assets/apple/` in the Vialmetry
  repo (uncommitted, on branch `claude/affectionate-wozniak-756j7q`)

Each folder holds `*-universal-16x9-5244x2950.png`, `*-header-21x9-3840x1646.png` and
`*-search-3x2-3840x2560.png`. Simulated 21:9 and 3:2 crops of both universal files
were checked: nothing important is cut.

**PromptSpend art is a faithful rebuild, not a device capture.** No native captures
exist yet, and the Expo web render uses the wrong typeface (serif fallback), so it
would misrepresent the app. The panels reuse the app's real labels, layout and colour
tokens, with generic "Model A to D" names and no prices so they stay accurate over
time. If you want strict real-capture art, swap the panels for TestFlight captures.
The Vialmetry art uses real iPhone captures from the shipped build, cropped to avoid
any area containing the word "dose".

**Figma:** the file "App Store creative assets — PromptSpend and Vialmetry"
(`figma.com/design/7rgXex2fPE7sLt5puEZ9uq`) holds the editable layers. The Starter plan
allows 20 connector calls a month and they are used up, so the final PNGs were rendered
locally from the same spec. The Figma Vialmetry frames still use the first, tighter
crops (the vial-list panel and the map-panel bottom edge), so they trail the PNGs by
two small edits.

**Not yet verified:** how the images look in App Store Connect's product page preview,
and whether Apple accepts the 16:9 universal file as a single upload for both slots
(Apple's wording suggests yes).

## 1. What these assets are

Apple has two new image slots, called creative assets:

- **Product page header**: the banner at the top of the app's page.
- **Search results**: the picture shown beside the app in search results.

They appear on iOS 27 / iPadOS 27 and later. Devices on older versions keep
showing screenshots. If no search-results asset is supplied, Apple falls back
to the app's screenshots and events. Apple lets one "universal" asset serve
both slots.

## 2. Specifications (from Apple's spec page)

| Slot                            | Shape | Size                             | Format      |
| ------------------------------- | ----- | -------------------------------- | ----------- |
| Product page header             | 21:9  | 3840 x 1646 px                   | JPEG or PNG |
| Search results                  | 3:2   | 1920 x 1280 up to 3840 x 2560 px | JPEG or PNG |
| Either slot (one file for both) | 16:9  | 5244 x 2950 px                   | PNG only    |

- No transparency (no alpha channel).
- Optional video: 5 to 30 seconds, 30 or 60 fps, same shapes as above, muted by
  default, loops.
- **My reading, not confirmed:** the 16:9 row looks like a "universal" file that
  Apple crops for each slot. Confirm in App Store Connect before building.
- **Not yet obtained:** Apple's Figma/Photoshop templates (they show the safe
  area each slot crops to). Download the Figma "Universal" template before any
  layout work; until then, keep everything important in the centre.

## 3. Rules that apply to both apps (Apple's best-practice page)

- No prices, discounts, website addresses, copyright symbols or unearned awards.
- No Apple recognitions (Editor's Choice, App of the Day, and so on).
- No logos or mentions of other platforms or stores (so no "also on Android").
- Must be suitable for a 4+ age rating, even though the apps are rated higher.
- One clear idea; no clutter. Short text that adds to the picture, not a
  description of it.
- Show real app interface where possible; stay within what the shipped build does
  (App Review Guideline 2.3, accurate metadata).
- Use the same look across the icon, header, search image and screenshots.

**Production approach for both apps:** one 16:9 universal PNG per app as the
primary file, built centre-weighted so both crops work. Add dedicated 21:9 and
3:2 versions only if Apple's preview crops the universal one badly.

---

## 4. PromptSpend

**Where it stands:** iPhone/iPad screenshot storyboard exists
(`docs/STORE_SCREENSHOTS.md`). No Apple artwork exists. The only prepared art is
the Google Play banner (1024 x 500 and an illustrated receipt), which is too
small for Apple and is an illustration, not real UI.

### 4a. Product page header

- **One idea:** Know the tab before you build. (Same line as the Google banner and
  listing description, so the story is consistent.)
- **What the visitor should understand in two seconds:** this turns an AI
  workload into a clear monthly cost.
- **Composition:** one large, central, real capture of the Cost Brief screen from
  the release build (estimate, freshness chip, savings opportunity), with a
  smaller four-model ranking card tucked behind or beside it. Short headline on
  the left third, large margins, nothing important near the edges.
- **Look:** cool-paper light canvas, cobalt accent (`#2456E6` in the app's theme
  file; confirm it is the default accent), emerald only for the "lowest cost"
  cue. Matches the storyboard's "calm cost-intelligence instrument".
- **Text (pick one, max seven words):**
  A) "Know the tab before you build." (recommended)
  B) "AI cost, forecast before launch."
- **Avoid:** dollar figures in the headline, "free", provider logos (OpenAI,
  Anthropic and so on), invented awards, fake UI, glass effects, tiny
  spreadsheet-style collages.

### 4b. Search results

- **One idea:** compare models on the same workload. In search the visitor is
  looking for something specific, so the purpose must be obvious without the name.
- **Composition (3:2, tighter than the header):** the ranked four-model result,
  lowest-cost row highlighted, with a short caption. The interface is the hero;
  no receipt illustration.
- **Text:** "Compare AI model costs" (recommended) or "Forecast your AI bill".
- **Decision needed:** a real ranking screen contains dollar amounts. Apple bans
  "specific pricing" in assets. I read that as the app's own price or discounts,
  not model prices shown as app content, but I could not verify it. Safer option:
  crop to bars and relative differences ("+38%") with no currency figures.

---

## 5. Vialmetry

**Where it stands:** live on iOS. The store-listing drafts and the screenshot set
(iPhone 6.9-inch and iPad 13-inch, eight each) live in the `store-submit`
worktree under `docs/store/`, not on the main working branch. The only banner is
the Google Play graphic (1024 x 500, JPG).

**Sensitivity:** Vialmetry's own listing rules (`STORE_LISTING.md`, written
against Apple 1.4.2 and 1.4.3) apply to every asset: no compound names, nothing
that reads as a recommended amount, no accuracy or outcome claims. Apple also
requires 4+-suitable imagery.

**Problems in the existing Google graphic that must not carry over:**

- The syringe marked "25 u" reads as a specific amount. Drop the syringe-with-
  number entirely.
- Needle imagery is a 4+ and drug-imagery risk. Use vials and the body map
  instead of a needle.
- It names no other platform, which is good; keep it that way.

### 5a. Product page header

- **One idea:** a private vial log that stays on your device.
- **Composition:** a vial card (strength, remaining-amount bar, mixed date, using
  the neutral name "Compound A") in the centre, with the front-view body map
  showing rested versus recent sites beside it. Headline on the left third.
- **Look:** the app's deep green (`#0C211F`) with the teal (`#006A67`) and mint
  highlight used in the Play graphic, so the brand carries across stores.
- **Text (max seven words):**
  A) "Your vial log. Private on your device." (recommended)
  B) "Vials, sites, reminders. All private."
- **Optional small strip:** "No ads. No tracking." Allowed because the listing
  states it and the app does it. Keep it quiet, in one corner, and keep it clear
  of the edges.
- **Avoid:** "dose", "dosage", "calculator", any compound or brand name, anything
  that implies results, the "Estimated levels" chart, the plan-check card, the
  syringe-with-number, and outcome words such as "optimise" or "results".

### 5b. Search results

- **One idea:** vial log and site rotation, readable at a glance.
- **Composition (3:2):** body map with rested and recent sites in the foreground,
  one small vial card overlapping it. Fewer elements than the header.
- **Text:** "Vial log and site rotation" (recommended) or "Track vials and
  injection sites".
- The visitor sees the app name and subtitle next to it, so the image text should
  describe the app's purpose rather than repeat the name.

---

## 6. Decisions needed from Andrew

1. Universal 16:9 file first, with dedicated crops only if needed. Agreed?
2. PromptSpend: dollar figures in the search image, or relative bars only? (4b)
3. Vialmetry: confirm the syringe and any needle imagery stays out of every
   Apple asset. (5)
4. Headline choices: PromptSpend A or B; Vialmetry A or B.
5. Vialmetry's "No ads. No tracking." strip: include or leave out?
6. Production route: Figma with Apple's template and real captures from the
   release builds (recommended), or an image-generation pass. Real UI is the
   storyboard's own rule for PromptSpend.

## 7. Production steps (after approval)

1. Download Apple's Figma universal template and note each slot's safe area.
2. Capture fresh real-UI frames from the exact released builds, with synthetic data.
3. Compose, export an opaque PNG at 5244 x 2950, and check the file's dimensions
   and absence of transparency by script.
4. Review in App Store Connect's product page preview, then submit through the
   Asset Library (or with a new version).
5. Later: use product page optimization to A/B test two header variants once
   there is enough traffic.

## 8. Not verified

- Whether Apple's 21:9 and 3:2 crops can both be produced from the single 16:9
  file (see section 2).
- Whether the "no specific pricing" rule applies to model prices shown in app UI.
- Whether the Vialmetry listing name is currently "Peptide Calculator" (the
  2026-10-01 plan says the rename follows approval by three days; I did not check
  App Store Connect).
